# backend/sentinel/agents/orchestrator.py
"""
Orchestrator — State Machine & Pub/Sub
Every state transition writes to the audit log AND broadcasts to the
dashboard over WebSocket. Broadcasting failures are non-fatal.
"""

import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Dict, Set

from sentinel.audit.trustchain_logger import TrustChainLogger
from api.websocket import broadcast_state_change, broadcast_audit_event

logger = logging.getLogger("sentinel.orchestrator")


class WorkerState(Enum):
    HEALTHY = "HEALTHY"
    LOOP_SUSPECTED = "LOOP_SUSPECTED"
    DIAGNOSING = "DIAGNOSING"
    REMEDIATING = "REMEDIATING"
    VERIFYING = "VERIFYING"
    RESUMED = "RESUMED"
    ESCALATED = "ESCALATED"


VALID_TRANSITIONS: Dict[WorkerState, Set[WorkerState]] = {
    WorkerState.HEALTHY: {WorkerState.LOOP_SUSPECTED},
    WorkerState.LOOP_SUSPECTED: {WorkerState.DIAGNOSING, WorkerState.HEALTHY},
    WorkerState.DIAGNOSING: {WorkerState.REMEDIATING, WorkerState.ESCALATED},
    WorkerState.REMEDIATING: {WorkerState.VERIFYING},
    WorkerState.VERIFYING: {WorkerState.RESUMED, WorkerState.ESCALATED},
    WorkerState.RESUMED: {WorkerState.HEALTHY, WorkerState.LOOP_SUSPECTED},
    WorkerState.ESCALATED: set(),
}

CONFIDENCE_ESCALATION_THRESHOLD = 0.7


class Orchestrator:
    def __init__(
        self,
        event_bus=None,
        audit_logger=None,
        triage_agent=None,
        remediation_agent=None,
    ):
        self.worker_states: Dict[str, WorkerState] = {}
        self.event_bus = event_bus
        self.audit_logger = audit_logger or TrustChainLogger()
        self.triage_agent = triage_agent
        self.remediation_agent = remediation_agent
        # Day 10 fix: OptimizationAgent's ReroutePlan (assignments,
        # excluded_workers, projected_throughput_pct) had no consumer at
        # all — dispatched in parallel with Triage but silently dropped.
        # Latest plan per worker, mirrors self.worker_states' simplicity.
        self.reroute_plans: Dict[str, dict] = {}

        if self.event_bus is not None:
            self.event_bus.subscribe("LOOP_SUSPECTED", self.on_loop_suspected)
            self.event_bus.subscribe("DIAGNOSIS_COMPLETE", self.on_diagnosis_complete)
            self.event_bus.subscribe("OPTIMIZATION_COMPLETE", self.on_optimization_complete)

    def get_state(self, worker_id: str) -> WorkerState:
        return self.worker_states.get(worker_id, WorkerState.HEALTHY)

    async def transition(
        self,
        worker_id: str,
        to_state: WorkerState,
        trigger_event: str,
        agent_name: str,
        confidence_score: float = None,
        fallback_used: bool = False,
        fallback_origin: str = None,
        root_cause: str = None,
        fix_type: str = None,
        affected_field: str = None,
    ) -> None:
        current = self.get_state(worker_id)
        allowed = VALID_TRANSITIONS.get(current, set())
        if to_state not in allowed:
            logger.error(
                "Illegal transition for %s: %s -> %s", worker_id, current, to_state
            )
            raise ValueError(f"Illegal transition: {current.value} -> {to_state.value}")

        self.worker_states[worker_id] = to_state

        record = self.audit_logger.log_transition(
            worker_id=worker_id,
            from_state=current.value,
            to_state=to_state.value,
            trigger_event=trigger_event,
            agent_name=agent_name,
            confidence_score=confidence_score,
            fallback_used=fallback_used,
            fallback_origin=fallback_origin,
            root_cause=root_cause,
            fix_type=fix_type,
            affected_field=affected_field,
        )

        logger.info(
            "[%s] %s -> %s (trigger=%s, agent=%s) at %s",
            worker_id, current, to_state, trigger_event, agent_name,
            datetime.now(timezone.utc).isoformat(),
        )

        try:
            await broadcast_state_change(
                worker_id=worker_id,
                from_state=current.value,
                to_state=to_state.value,
                trigger_event=trigger_event,
            )
            await broadcast_audit_event(worker_id=worker_id, audit_record=record)
        except Exception as e:
            logger.warning("WebSocket broadcast failed (non-fatal): %s", e)

    async def on_loop_suspected(self, event: dict) -> None:
        worker_id = event["worker_id"]

        # A fresh fault injection targeting a worker that previously
        # escalated (a terminal state — see VALID_TRANSITIONS) would
        # otherwise raise here and crash the publish, since ESCALATED has
        # no legal outgoing transition. Re-injecting a fault is meant to
        # start a brand-new incident regardless of what the worker's last
        # cycle ended in, so treat it as an implicit reset back to HEALTHY
        # first — HEALTHY -> LOOP_SUSPECTED is always legal. No-op for
        # workers already in HEALTHY/RESUMED, where the transition below
        # is legal anyway.
        current = self.get_state(worker_id)
        if current not in (WorkerState.HEALTHY, WorkerState.RESUMED):
            logger.info(
                "[%s] New fault injected while in %s — resetting to HEALTHY "
                "before re-detecting", worker_id, current,
            )
            self.worker_states[worker_id] = WorkerState.HEALTHY

        # Day 12: which embedding source detected this loop — drives the
        # Sentinel node's fallback ring (blue for sentence-transformers,
        # per Shreshtha's guide; "NIM" itself is never a fallback).
        embedding_origin = event.get("embedding_origin")
        await self.transition(
            worker_id, WorkerState.LOOP_SUSPECTED,
            trigger_event="LOOP_SUSPECTED", agent_name="SentinelAgent",
            fallback_used=embedding_origin not in (None, "NIM"),
            fallback_origin=embedding_origin if embedding_origin != "NIM" else None,
        )
        await self.transition(
            worker_id, WorkerState.DIAGNOSING,
            trigger_event="DIAGNOSIS_STARTED", agent_name="Orchestrator",
        )

        log_lines = event.get("log_lines", [])
        diagnosis = self.triage_agent.diagnose(event, log_lines)

        await self.event_bus.publish(
            "DIAGNOSIS_COMPLETE",
            {"worker_id": worker_id, **diagnosis},
        )

    async def on_diagnosis_complete(self, event: dict) -> None:
        worker_id = event["worker_id"]
        confidence = event.get("confidence", 0.0)

        if confidence < CONFIDENCE_ESCALATION_THRESHOLD:
            # Day 12: this branch never forwarded fallback_used/fallback_origin,
            # even though the rule-based heuristic (confidence always 0.65,
            # always below CONFIDENCE_ESCALATION_THRESHOLD) can ONLY ever
            # reach this branch, never REMEDIATING — meaning
            # fallback_origin="rule_based_heuristic" could never actually
            # appear on any audit record before this fix, leaving the
            # Triage node's fallback indicator blind to that one path.
            await self.transition(
                worker_id, WorkerState.ESCALATED,
                trigger_event="LOW_CONFIDENCE", agent_name="Orchestrator",
                confidence_score=confidence,
                fallback_used=event.get("fallback_used", False),
                fallback_origin=event.get("fallback_origin"),
                root_cause=event.get("root_cause"),
                fix_type=event.get("fix_type"),
                affected_field=event.get("affected_field"),
            )
            await self.event_bus.publish("ESCALATED", {"worker_id": worker_id, **event})
            return

        await self.transition(
            worker_id, WorkerState.REMEDIATING,
            trigger_event="DIAGNOSIS_COMPLETE", agent_name="TriageAgent",
            confidence_score=confidence,
            fallback_used=event.get("fallback_used", False),
            fallback_origin=event.get("fallback_origin"),
            root_cause=event.get("root_cause"),
            fix_type=event.get("fix_type"),
            affected_field=event.get("affected_field"),
        )

        if self.remediation_agent is None:
            logger.info(
                "[%s] Remediation Agent not available — worker held in REMEDIATING (stub)",
                worker_id,
            )
            return

        remediation_result = await self.remediation_agent.remediate(event)

        await self.transition(
            worker_id, WorkerState.VERIFYING,
            trigger_event="REMEDIATION_ATTEMPTED", agent_name="RemediationAgent",
        )

        # Day 12: "mock" specifically drives the Remediation node's gray
        # ring + MOCK badge (guide's 4th fallback indicator); other
        # non-primary modes (timeout/error/unavailable) are real failures,
        # not the mock-wrapper-took-over case, so they're flagged but not
        # labeled as this specific fallback.
        mode = remediation_result.get("mode")
        remediation_fallback_origin = mode if mode == "mock" else None

        if remediation_result.get("verified") is True:
            await self.transition(
                worker_id, WorkerState.RESUMED,
                trigger_event="REMEDIATION_SUCCESS", agent_name="RemediationAgent",
                fallback_used=remediation_result.get("flagged", False),
                fallback_origin=remediation_fallback_origin,
            )
            await self.event_bus.publish(
                "REMEDIATION_SUCCESS",
                {"worker_id": worker_id, **remediation_result},
            )
        else:
            await self.transition(
                worker_id, WorkerState.ESCALATED,
                trigger_event="REMEDIATION_FAILED", agent_name="RemediationAgent",
                fallback_used=remediation_result.get("flagged", False),
                fallback_origin=remediation_fallback_origin,
            )
            await self.event_bus.publish(
                "ESCALATED",
                {"worker_id": worker_id, **remediation_result},
            )

    async def on_optimization_complete(self, event: dict) -> None:
        """OptimizationAgent dispatches in parallel with Triage on every
        LOOP_SUSPECTED (per master doc Section 6's concurrency guarantee).
        Day 10 fix: this had no consumer at all — ReroutePlan was computed
        and immediately discarded. Stores the latest plan per worker.

        Day 12 fix: this docstring claimed the plan was written to the
        audit trail "so a reroute is provable after the fact, same as
        every other real transition" — it never actually was; the method
        only logged and stored in-memory. Optimization has no WorkerState
        of its own, so this can't go through self.transition() (which
        enforces FSM legality against self.worker_states) — it writes
        directly via audit_logger + broadcasts the same way transition()
        does, using the worker's current state for both from/to (a
        side-channel event, not an FSM move). This is also what the
        Optimization node's fallback ring on the dashboard reads
        (solver_used is always "or-tools" or "greedy_round_robin" since
        cuOpt is skipped project-wide — see docs/api_contracts.md)."""
        worker_id = event["worker_id"]
        plan = {
            "assignments": event.get("assignments", []),
            "excluded_workers": event.get("excluded_workers", []),
            "projected_throughput_pct": event.get("projected_throughput_pct"),
            "solver_used": event.get("solver_used"),
        }
        self.reroute_plans[worker_id] = plan
        logger.info(
            "[%s] ReroutePlan received: solver=%s throughput=%.1f%% "
            "assignments=%d excluded=%s",
            worker_id, plan["solver_used"], plan["projected_throughput_pct"] or 0.0,
            len(plan["assignments"]), plan["excluded_workers"],
        )

        current_state = self.get_state(worker_id).value
        record = self.audit_logger.log_transition(
            worker_id=worker_id,
            from_state=current_state,
            to_state=current_state,
            trigger_event="OPTIMIZATION_COMPLETE",
            agent_name="OptimizationAgent",
            fallback_used=True,  # cuOpt is always skipped — OR-Tools/greedy is always a fallback
            fallback_origin=plan["solver_used"],
            projected_throughput_pct=plan["projected_throughput_pct"],
        )
        try:
            await broadcast_audit_event(worker_id=worker_id, audit_record=record)
        except Exception as e:
            logger.warning("WebSocket broadcast failed (non-fatal): %s", e)

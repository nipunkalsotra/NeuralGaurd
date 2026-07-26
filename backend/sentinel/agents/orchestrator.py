# backend/sentinel/agents/orchestrator.py
"""
Orchestrator — State Machine & Pub/Sub
Day 3: HEALTHY -> LOOP_SUSPECTED -> DIAGNOSING wired to real Sentinel + Triage.
Day 5: Full FSM states added. Audit logging on every transition.
       Optimization Agent dispatches in parallel via its own subscription.
       Remediation dispatch STUBBED — agent doesn't exist until Day 7.
"""

import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Dict, Optional

from sentinel.audit.trustchain_logger import TrustChainLogger
from sentinel.event_bus.asyncio_queue_bus import EventBus

logger = logging.getLogger("sentinel.orchestrator")


class WorkerState(str, Enum):
    HEALTHY = "HEALTHY"
    LOOP_SUSPECTED = "LOOP_SUSPECTED"
    DIAGNOSING = "DIAGNOSING"
    REMEDIATING = "REMEDIATING"
    VERIFYING = "VERIFYING"
    RESUMED = "RESUMED"
    ESCALATED = "ESCALATED"


VALID_TRANSITIONS = {
    WorkerState.HEALTHY: {WorkerState.LOOP_SUSPECTED},
    WorkerState.LOOP_SUSPECTED: {WorkerState.DIAGNOSING},
    WorkerState.DIAGNOSING: {WorkerState.REMEDIATING, WorkerState.ESCALATED},
    WorkerState.REMEDIATING: {WorkerState.VERIFYING},
    WorkerState.VERIFYING: {WorkerState.RESUMED, WorkerState.ESCALATED},
    WorkerState.RESUMED: {WorkerState.HEALTHY},
    WorkerState.ESCALATED: {WorkerState.HEALTHY},
}

CONFIDENCE_ESCALATION_THRESHOLD = 0.6  # per master doc Section 5.2


class Orchestrator:
    def __init__(
        self,
        event_bus: EventBus,
        triage_agent,
        remediation_agent=None,   # None until Day 7
        optimization_agent=None,  # subscribes itself if provided
        audit_logger: Optional[TrustChainLogger] = None,
    ):
        self.event_bus = event_bus
        self.triage_agent = triage_agent
        self.remediation_agent = remediation_agent
        self.optimization_agent = optimization_agent
        self.audit_logger = audit_logger or TrustChainLogger()
        self.worker_states: Dict[str, WorkerState] = {}

        self.event_bus.subscribe("LOOP_SUSPECTED", self.on_loop_suspected)
        self.event_bus.subscribe("DIAGNOSIS_COMPLETE", self.on_diagnosis_complete)

    def get_state(self, worker_id: str) -> WorkerState:
        return self.worker_states.get(worker_id, WorkerState.HEALTHY)

    def transition(
        self,
        worker_id: str,
        to_state: WorkerState,
        trigger_event: str,
        agent_name: str,
        confidence_score: float = None,
        fallback_used: bool = False,
        fallback_origin: str = None,
    ) -> None:
        current = self.get_state(worker_id)
        allowed = VALID_TRANSITIONS.get(current, set())
        if to_state not in allowed:
            logger.error(
                "Illegal transition for %s: %s -> %s", worker_id, current, to_state
            )
            raise ValueError(f"Illegal transition: {current} -> {to_state}")

        self.worker_states[worker_id] = to_state

        self.audit_logger.log_transition(
            worker_id=worker_id,
            from_state=current.value,
            to_state=to_state.value,
            trigger_event=trigger_event,
            agent_name=agent_name,
            confidence_score=confidence_score,
            fallback_used=fallback_used,
            fallback_origin=fallback_origin,
        )

        logger.info(
            "[%s] %s -> %s (trigger=%s, agent=%s) at %s",
            worker_id, current, to_state, trigger_event, agent_name,
            datetime.now(timezone.utc).isoformat(),
        )

    async def on_loop_suspected(self, event: dict) -> None:
        """Sentinel -> LOOP_SUSPECTED -> DIAGNOSING. Dispatches Triage.
        Optimization Agent dispatches itself in parallel via its OWN
        subscription to LOOP_SUSPECTED on the same event bus — EventBus.publish()
        uses asyncio.gather() so both fire concurrently, no extra code needed
        here as long as OptimizationAgent was constructed with this bus."""
        worker_id = event["worker_id"]

        self.transition(
            worker_id, WorkerState.LOOP_SUSPECTED,
            trigger_event="LOOP_SUSPECTED", agent_name="SentinelAgent",
        )
        self.transition(
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
        """DIAGNOSING -> REMEDIATING (confidence ok) or ESCALATED (low confidence).
        Remediation dispatch is STUBBED — agent doesn't exist until Day 7."""
        worker_id = event["worker_id"]
        confidence = event.get("confidence", 0.0)

        if confidence < CONFIDENCE_ESCALATION_THRESHOLD:
            self.transition(
                worker_id, WorkerState.ESCALATED,
                trigger_event="LOW_CONFIDENCE", agent_name="Orchestrator",
                confidence_score=confidence,
            )
            await self.event_bus.publish("ESCALATED", {"worker_id": worker_id, **event})
            return

        self.transition(
            worker_id, WorkerState.REMEDIATING,
            trigger_event="DIAGNOSIS_COMPLETE", agent_name="TriageAgent",
            confidence_score=confidence,
            fallback_used=event.get("fallback_used", False),
            fallback_origin=event.get("fallback_origin"),
        )

        if self.remediation_agent is not None:
            pass  # TODO Day 7
        else:
            logger.info(
                "[%s] Remediation Agent not yet available (Day 7) — "
                "worker held in REMEDIATING state (stub)", worker_id,
            )
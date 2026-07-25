# backend/sentinel/agents/orchestrator.py
"""
Orchestrator — State Machine & Pub/Sub
Day 3 scope: wire Sentinel + Triage into the FSM.
States: HEALTHY -> LOOP_SUSPECTED -> DIAGNOSING -> REMEDIATING -> VERIFYING -> RESUMED/ESCALATED
Today only HEALTHY -> LOOP_SUSPECTED -> DIAGNOSING is wired (Remediation/Optimization land later).
"""

import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Dict

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


# Valid transitions — guards against illegal state jumps
VALID_TRANSITIONS = {
    WorkerState.HEALTHY: {WorkerState.LOOP_SUSPECTED},
    WorkerState.LOOP_SUSPECTED: {WorkerState.DIAGNOSING},
    WorkerState.DIAGNOSING: {WorkerState.REMEDIATING, WorkerState.ESCALATED},
    WorkerState.REMEDIATING: {WorkerState.VERIFYING},
    WorkerState.VERIFYING: {WorkerState.RESUMED, WorkerState.ESCALATED},
    WorkerState.RESUMED: {WorkerState.HEALTHY},
    WorkerState.ESCALATED: {WorkerState.HEALTHY},
}


class Orchestrator:
    def __init__(self, event_bus: EventBus, triage_agent):
        self.event_bus = event_bus
        self.triage_agent = triage_agent
        self.worker_states: Dict[str, WorkerState] = {}

        # Wire subscriptions
        self.event_bus.subscribe("LOOP_SUSPECTED", self.on_loop_suspected)

    def get_state(self, worker_id: str) -> WorkerState:
        return self.worker_states.get(worker_id, WorkerState.HEALTHY)

    def transition(self, worker_id: str, to_state: WorkerState) -> None:
        current = self.get_state(worker_id)
        allowed = VALID_TRANSITIONS.get(current, set())
        if to_state not in allowed:
            logger.error(
                "Illegal transition for %s: %s -> %s", worker_id, current, to_state
            )
            raise ValueError(f"Illegal transition: {current} -> {to_state}")

        self.worker_states[worker_id] = to_state
        logger.info(
            "[%s] %s -> %s at %s",
            worker_id,
            current,
            to_state,
            datetime.now(timezone.utc).isoformat(),
        )

    async def on_loop_suspected(self, event: dict) -> None:
        """Sentinel published LOOP_SUSPECTED -> transition and dispatch Triage."""
        worker_id = event["worker_id"]

        self.transition(worker_id, WorkerState.LOOP_SUSPECTED)
        self.transition(worker_id, WorkerState.DIAGNOSING)

        # Dispatch Triage Agent — synchronous call today, matches Day 3 scope
        # (log_lines is a placeholder; real log retrieval wires in later)
        log_lines = event.get("log_lines", [])
        diagnosis = self.triage_agent.diagnose(event, log_lines)

        await self.event_bus.publish(
            "DIAGNOSIS_COMPLETE",
            {"worker_id": worker_id, **diagnosis},
        )
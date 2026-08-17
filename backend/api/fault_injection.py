# backend/api/fault_injection.py
"""
Fault Injection Backend — POST /demo/inject
Day 7: 4 fault types, each designed to trigger Sentinel's loop detection
within 3 steps, feeding into the real Orchestrator/Triage/Remediation chain.
Day 8: Wired to actually drive real Sentinel detect_loop() and broadcast
the resulting state_change over WebSocket — closes the gap where fault
injection only set backend state without triggering real detection.
Day 9: Wired to the REAL Orchestrator/EventBus/OptimizationAgent — this
endpoint used to fake the LOOP_SUSPECTED -> ... transition with a single
direct broadcast_state_change call. It now publishes onto the same shared
EventBus the Orchestrator and OptimizationAgent subscribe to, so a real
fault genuinely drives Triage -> Remediation and Optimization (dispatched
concurrently, per master doc Section 6) -- closes the "fault-injection-to-
Orchestrator wiring" gap noted in docs/api_contracts.md's Day 8 status.
Day 12: fixed the synthetic log line each fault produces — it used to
fall back to a bare keyword (e.g. "Error: latency (fault: latency)")
that never matched RuleBasedHeuristic's regex patterns for ANY of the 4
fault types. Harmless whenever Nemotron or Groq are reachable (an LLM
reads natural language fine), but if BOTH are down during a live demo,
every fault type would misdiagnose as "unknown" and escalate instead of
healing — exactly the resilience path Day 12's chaos testing exists to
validate. Each fault now carries a realistic `log_message` instead.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from sentinel.agents.sentinel_agent import SentinelAgent
from sentinel.agents.triage_agent import TriageAgent
from sentinel.agents.remediation_agent import RemediationAgent
from sentinel.agents.optimization_agent import OptimizationAgent
from sentinel.agents.orchestrator import Orchestrator
from sentinel.event_bus.asyncio_queue_bus import EventBus
from api.websocket import broadcast_similarity

logger = logging.getLogger("sentinel.fault_injection")
router = APIRouter()

# In-memory worker fault state — Day 7 scope, no persistence needed
_worker_faults: dict = {}

# Shared instances driving real detection/diagnosis/remediation/reroute
# from injected faults. Simple module-level singletons — matches the
# project's "don't over-engineer Phase 1" philosophy rather than full
# dependency injection.
_sentinel = SentinelAgent()
_event_bus = EventBus()
_triage_agent = TriageAgent()
_remediation_agent = RemediationAgent()
_optimization_agent = OptimizationAgent(event_bus=_event_bus)
_orchestrator = Orchestrator(
    event_bus=_event_bus,
    triage_agent=_triage_agent,
    remediation_agent=_remediation_agent,
)


class InjectRequest(BaseModel):
    target: str
    fault_type: str
    payload: Optional[dict] = None


class InjectResponse(BaseModel):
    injected: bool
    target: str
    fault_type: str
    timestamp: str
    details: dict


def get_worker_fault(worker_id: str) -> Optional[dict]:
    """Used by a worker simulation / Sentinel feed to check active faults."""
    return _worker_faults.get(worker_id)


def clear_worker_fault(worker_id: str) -> None:
    _worker_faults.pop(worker_id, None)


class SchemaCorruptionFault:
    def apply(self, target: str, payload: dict) -> dict:
        field = (payload or {}).get("field", "Tax_ID")
        _worker_faults[target] = {
            "type": "schema_corruption",
            "removed_field": field,
            "error_signature": f"{field}_missing",
            # Day 12: realistic message, not just the bare field name — see
            # module note below on why this text actually matters, not
            # just for log readability.
            "log_message": f"Field '{field}' not found in invoice schema",
        }
        return {"removed_field": field}


class LatencyFault:
    def apply(self, target: str, payload: dict) -> dict:
        delay_ms = (payload or {}).get("delay_ms", 5000)
        _worker_faults[target] = {
            "type": "latency",
            "delay_ms": delay_ms,
            "error_signature": "latency_injected",
            "log_message": f"Operation timed out after {delay_ms}ms waiting for worker response",
        }
        return {"delay_ms": delay_ms}


class ErrorSignatureFault:
    def apply(self, target: str, payload: dict) -> dict:
        error = (payload or {}).get("error", "Tax_ID not found")
        _worker_faults[target] = {
            "type": "error_signature",
            "forced_error": error,
            "error_signature": error,
            "log_message": error,
        }
        return {"forced_error": error}


class ResourcePressureFault:
    def apply(self, target: str, payload: dict) -> dict:
        memory_mb = (payload or {}).get("memory_mb", 512)
        _worker_faults[target] = {
            "type": "resource_pressure",
            "consumed_memory_mb": memory_mb,
            "error_signature": "oom_pressure",
            "log_message": f"Worker ran out of memory (OOM) after consuming {memory_mb}MB",
        }
        return {"consumed_memory_mb": memory_mb}


FAULT_HANDLERS = {
    "schema_corruption": SchemaCorruptionFault(),
    "latency": LatencyFault(),
    "error_signature": ErrorSignatureFault(),
    "resource_pressure": ResourcePressureFault(),
}


@router.post("/demo/inject", response_model=InjectResponse)
async def inject_fault(request: InjectRequest):
    handler = FAULT_HANDLERS.get(request.fault_type)
    if handler is None:
        return InjectResponse(
            injected=False, target=request.target, fault_type=request.fault_type,
            timestamp=datetime.now(timezone.utc).isoformat(),
            details={"error": f"unknown fault_type: {request.fault_type}"},
        )

    result = handler.apply(request.target, request.payload or {})
    logger.info("Fault injected: %s on %s -> %s", request.fault_type, request.target, result)

    # Drive real Sentinel detection — simulate the worker repeating the
    # fault-induced error 4x (matches the pattern in test_fault_injection.py)
    fault = get_worker_fault(request.target)
    loop_event = None
    log_line = None
    if fault:
        log_line = f"Error: {fault['log_message']} (fault: {fault['type']})"
        for step in range(4):
            loop_event = _sentinel.detect_loop(
                request.target, log_line, fault["error_signature"],
            )
            # Real per-step similarity score, once the sliding window has
            # enough samples to compute one — gives the dashboard's
            # Similarity Graph an actual live trace (see sentinel_agent.py's
            # last_similarity / websocket.py's broadcast_similarity).
            if _sentinel.last_similarity is not None:
                await broadcast_similarity(request.target, _sentinel.last_similarity, float(step))

        if loop_event:
            # Publish onto the shared EventBus rather than faking a single
            # broadcast — the Orchestrator (Triage -> Remediation) and the
            # OptimizationAgent both subscribe to LOOP_SUSPECTED and are
            # dispatched concurrently (asyncio.gather in EventBus.publish).
            # The Orchestrator's own transition() calls broadcast_state_change
            # and broadcast_audit_event on every real transition, so no
            # separate broadcast call is needed here anymore.
            await _event_bus.publish(
                "LOOP_SUSPECTED", {**loop_event, "log_lines": [log_line]},
            )

    return InjectResponse(
        injected=True,
        target=request.target,
        fault_type=request.fault_type,
        timestamp=datetime.now(timezone.utc).isoformat(),
        details={**result, "loop_detected": loop_event is not None},
    )
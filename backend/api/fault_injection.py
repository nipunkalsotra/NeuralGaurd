# backend/api/fault_injection.py
"""
Fault Injection Backend — POST /demo/inject
Day 7: 4 fault types, each designed to trigger Sentinel's loop detection
within 3 steps, feeding into the real Orchestrator/Triage/Remediation chain.
Day 8: Wired to actually drive real Sentinel detect_loop() and broadcast
the resulting state_change over WebSocket — closes the gap where fault
injection only set backend state without triggering real detection.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from api.websocket import broadcast_state_change
from sentinel.agents.sentinel_agent import SentinelAgent

logger = logging.getLogger("sentinel.fault_injection")
router = APIRouter()

# In-memory worker fault state — Day 7 scope, no persistence needed
_worker_faults: dict = {}

# Shared Sentinel instance for driving real detection from injected faults.
# Simple module-level singleton — matches the project's "don't
# over-engineer Phase 1" philosophy rather than full dependency injection.
_sentinel = SentinelAgent()


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
        }
        return {"removed_field": field}


class LatencyFault:
    def apply(self, target: str, payload: dict) -> dict:
        delay_ms = (payload or {}).get("delay_ms", 5000)
        _worker_faults[target] = {
            "type": "latency",
            "delay_ms": delay_ms,
            "error_signature": "latency_injected",
        }
        return {"delay_ms": delay_ms}


class ErrorSignatureFault:
    def apply(self, target: str, payload: dict) -> dict:
        error = (payload or {}).get("error", "Tax_ID not found")
        _worker_faults[target] = {
            "type": "error_signature",
            "forced_error": error,
            "error_signature": error,
        }
        return {"forced_error": error}


class ResourcePressureFault:
    def apply(self, target: str, payload: dict) -> dict:
        memory_mb = (payload or {}).get("memory_mb", 512)
        _worker_faults[target] = {
            "type": "resource_pressure",
            "consumed_memory_mb": memory_mb,
            "error_signature": "oom_pressure",
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
    if fault:
        error_text = (
            fault.get("removed_field")
            or fault.get("forced_error")
            or fault.get("type")
        )
        for _ in range(4):
            loop_event = _sentinel.detect_loop(
                request.target,
                f"Error: {error_text} (fault: {fault['type']})",
                fault["error_signature"],
            )

        if loop_event:
            await broadcast_state_change(
                worker_id=request.target,
                from_state="HEALTHY",
                to_state="LOOP_SUSPECTED",
                trigger_event="LOOP_SUSPECTED",
            )

    return InjectResponse(
        injected=True,
        target=request.target,
        fault_type=request.fault_type,
        timestamp=datetime.now(timezone.utc).isoformat(),
        details={**result, "loop_detected": loop_event is not None},
    )
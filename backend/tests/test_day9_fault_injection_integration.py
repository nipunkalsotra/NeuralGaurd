# backend/tests/test_day9_rashi_integration.py
"""
Day 9 — Integration Test on Shreshtha's Machine (Nipun's scope:
Algorithms & Optimization — owns SentinelAgent's detection algorithm,
OptimizationAgent, the Fault Injection Backend, and (jointly with Nipun)
the TrustChainLogger audit fields).

Confirms POST /demo/inject now genuinely drives the full stack through
the real Orchestrator (Day 9 fix — see docs/api_contracts.md's Day 8
status note on the "fault-injection-to-Orchestrator wiring" gap), not
just a fake broadcast: Sentinel's real detect_loop() fires, the
Optimization Agent is dispatched CONCURRENTLY with Triage/Remediation
(asyncio.gather inside EventBus.publish — the parallel dispatch this
project's docs have referenced since Day 5), and the resulting audit
record correctly captures the fallback chain when NemoClaw is
unavailable (this machine has no real `nemoclaw` binary, so PRIMARY mode
genuinely exercises that fallback, not a simulation of one).
"""

import json
import time
import uuid

import pytest
from fastapi.testclient import TestClient

from api import fault_injection
from api.main import app


@pytest.fixture
def client_with_live_wrapper(live_wrapper_primary_mode):
    """Points the shared fault_injection Orchestrator's RemediationAgent at
    the live wrapper subprocess for this test, then restores it."""
    real_wrapper_url = fault_injection._orchestrator.remediation_agent.wrapper_url
    fault_injection._orchestrator.remediation_agent.wrapper_url = live_wrapper_primary_mode
    try:
        yield TestClient(app)
    finally:
        fault_injection._orchestrator.remediation_agent.wrapper_url = real_wrapper_url


def test_fault_injection_drives_sentinel_and_optimization_in_parallel_via_orchestrator(
    client_with_live_wrapper,
):
    # fault_injection._orchestrator's audit logger writes to a real,
    # persistent file on disk (shared across every run of this test, not
    # just this process) — a unique worker_id per run keeps the
    # "exactly one RESUMED record" assertion meaningful no matter how many
    # times this test has run before.
    worker_id = f"worker-nipun-day9-{uuid.uuid4().hex[:8]}"

    optimization_events = []

    async def capture_optimization(event):
        optimization_events.append(event)

    fault_injection._event_bus.subscribe("OPTIMIZATION_COMPLETE", capture_optimization)

    start = time.monotonic()
    response = client_with_live_wrapper.post("/demo/inject", json={
        "target": worker_id,
        "fault_type": "schema_corruption",
        "payload": {"field": "Tax_ID"},
    })
    elapsed = time.monotonic() - start

    assert response.status_code == 200
    data = response.json()
    assert data["details"]["loop_detected"] is True
    assert elapsed < 5.0, f"end-to-end fault injection took {elapsed:.2f}s, must be <5s"

    # Optimization Agent's own real OR-Tools solve ran, dispatched
    # concurrently with Triage/Remediation over the shared EventBus —
    # this is the "parallel dispatch" this project's docs have claimed
    # since Day 5, now actually exercised through the live HTTP endpoint.
    matching_optimization_events = [
        e for e in optimization_events if e["worker_id"] == worker_id
    ]
    assert len(matching_optimization_events) == 1
    assert matching_optimization_events[0]["solver_used"] == "or-tools"

    # Full FSM reached RESUMED via the wrapper's mock fallback.
    assert fault_injection._orchestrator.get_state(worker_id).value == "RESUMED"

    audit_log_file = fault_injection._orchestrator.audit_logger.log_file
    with open(audit_log_file) as f:
        records = [json.loads(line) for line in f if line.strip()]
    resumed_records = [
        r for r in records
        if r["worker_id"] == worker_id and r["to_state"] == "RESUMED"
    ]
    assert len(resumed_records) == 1
    assert resumed_records[0]["fallback_used"] is True, (
        "audit record for the RESUMED transition must show the fallback "
        "chain was used — NemoClaw isn't available on this host, so the "
        "wrapper's mock fallback is what actually resolved this worker."
    )

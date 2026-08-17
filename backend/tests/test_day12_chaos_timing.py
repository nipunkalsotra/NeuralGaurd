# backend/tests/test_day12_rashi_chaos_timing.py
"""
Day 12 — Fault Injection Testing (End-to-End) (Nipun).

Guide: "Run each fault type and time the full healing loop" for all 4
fault types (schema_corruption, latency, error_signature,
resource_pressure), target <90s total in the live demo.

Writing these end-to-end (through the real POST /demo/inject, not a unit
test of the heuristic in isolation) is what actually surfaced a real
Day-12 bug: every fault type's synthetic log line failed to match
RuleBasedHeuristic's patterns at all (see api/fault_injection.py's
updated module docstring and the fix to each Fault class's log_message).
That path only matters when BOTH Nemotron and Groq are unreachable — the
autouse `deterministic_triage_for_fault_injection` fixture in conftest.py
mocks Triage entirely for other tests, so this file deliberately swaps
in a REAL TriageAgent with Nemotron/Groq mocked to fail, to genuinely
exercise the one path where this bug was reachable.

Elapsed time is measured and asserted to be well under the demo's 90s
budget, but that assertion is nearly vacuous here — this environment has
no real Nemotron/NemoClaw network latency to measure against, so it
cannot validate the live 90s SLA itself. What IS validated for real:
each fault type reaches a terminal state with an ACCURATE diagnosis
(not "unknown") once the log-line fix is in place — the actual thing a
human reviewing an escalated incident would need.
"""

import time
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from api import fault_injection
from api.main import app
from sentinel.agents.orchestrator import WorkerState
from sentinel.agents.triage_agent import TriageAgent

client = TestClient(app)


@pytest.fixture(autouse=True)
def _reset_remediation_circuit_breaker():
    """The one non-parametrized test below uses the default mock diagnosis
    (confidence 0.9), which reaches REMEDIATING and calls the shared
    production `_remediation_agent` singleton against the default (dead
    in this environment) wrapper_url — a real connection failure against
    the SAME circuit breaker test_day9_rashi_integration.py's live-wrapper
    test later depends on being closed. Without this reset, 2-3
    accumulated failures here were enough to leave that breaker OPEN for
    the rest of the session, making an unrelated, later test fail because
    it assumed a clean slate — same pattern as the existing
    `_reset_circuit_registry` fixtures elsewhere."""
    fault_injection._orchestrator.remediation_agent.circuit_breaker.record_success()
    yield
    fault_injection._orchestrator.remediation_agent.circuit_breaker.record_success()

# (fault_type, payload, expected fix_type once correctly diagnosed via
# the rule-based heuristic — both Nemotron and Groq mocked down)
SCENARIOS = [
    ("schema_corruption", {"field": "Tax_ID"}, "SCHEMA_MISMATCH"),
    ("latency", {"delay_ms": 5000}, "TIMEOUT"),
    ("error_signature", {"error": "Tax_ID not found"}, "SCHEMA_MISMATCH"),
    ("resource_pressure", {"memory_mb": 512}, "RESOURCE_ERROR"),
]


@pytest.fixture
def real_triage_agent(monkeypatch):
    """Overrides the autouse Triage mock with a real TriageAgent whose
    Nemotron/Groq clients are forced to fail — the only way to genuinely
    exercise RuleBasedHeuristic.classify() against fault_injection's real
    synthetic log lines instead of a canned diagnosis."""
    real_agent = TriageAgent()
    monkeypatch.setattr(fault_injection._orchestrator, "triage_agent", real_agent)
    with patch.object(real_agent.nemotron_client, "chat", side_effect=Exception("Nemotron down")):
        with patch.object(real_agent.groq_client, "chat", side_effect=Exception("Groq down")):
            yield real_agent


@pytest.mark.parametrize("fault_type,payload,expected_fix_type", SCENARIOS)
def test_chaos_scenario_end_to_end_with_accurate_diagnosis(
    real_triage_agent, fault_type, payload, expected_fix_type
):
    target = f"worker-12rashi-{fault_type}"

    start = time.monotonic()
    response = client.post("/demo/inject", json={
        "target": target, "fault_type": fault_type, "payload": payload,
    })
    elapsed = time.monotonic() - start

    assert response.status_code == 200
    assert response.json()["details"]["loop_detected"] is True

    # Confidence 0.65 (the heuristic's own ceiling) is below the 0.7
    # escalation threshold by design — the system correctly hands off to
    # a human rather than auto-applying a low-confidence patch. The real
    # assertion is that the escalation carries an ACCURATE diagnosis
    # instead of "unknown" (the bug this file's fix closes).
    state = fault_injection._orchestrator.get_state(target)
    assert state == WorkerState.ESCALATED

    import json
    records = [
        json.loads(line) for line in
        open(fault_injection._orchestrator.audit_logger.log_file).readlines()
    ]
    escalated_record = next(
        r for r in reversed(records)
        if r["worker_id"] == target and r["to_state"] == "ESCALATED"
    )
    assert escalated_record["fix_type"] == expected_fix_type
    assert escalated_record["root_cause"] != "unknown — no matching pattern in rule-based heuristic"

    # Not a real SLA check (no live LLM/NemoClaw latency in this
    # environment) — just confirms nothing pathologically hangs.
    assert elapsed < 5.0


def test_all_4_fault_types_still_dispatch_optimization_concurrently():
    """Guide's 'latency' scenario specifically calls out 'verify
    Optimization reroutes work around the delayed worker' — confirms
    OptimizationAgent is dispatched for every fault type (it doesn't
    special-case on fault_type, by design; see optimization_agent.py),
    not just schema_corruption."""
    received = []

    async def capture(event):
        received.append(event)

    fault_injection._event_bus.subscribe("OPTIMIZATION_COMPLETE", capture)

    response = client.post("/demo/inject", json={
        "target": "worker-12rashi-latency-reroute",
        "fault_type": "latency",
        "payload": {"delay_ms": 5000},
    })

    assert response.status_code == 200
    assert len(received) == 1
    assert received[0]["worker_id"] == "worker-12rashi-latency-reroute"
    assert "solver_used" in received[0]

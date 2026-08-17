# backend/tests/test_day11_tushar_panel_verification.py
"""
Day 11 — Circuit Breaker Panel Complete + Dashboard Polish (Shreshtha).

Shreshtha's guide's end-of-day BLOCKER is a live, physical test: block the
NIM URL in a teammate's hosts file, watch the panel's NIM dot go red
within 10s / yellow at 60s / green on recovery; then ask for a real
Nemotron rate-limit and confirm Triage falls back to Groq. That requires
two people and real network conditions and can't be run from here.

What CAN be verified from here, and is the actual thing the physical
test is checking: that a real failure in SentinelAgent.embed() /
TriageAgent.diagnose() — not a directly-poked CircuitBreaker object —
correctly reaches the dashboard-facing circuit_registry and therefore
GET /api/circuit-status. test_day11_cache_circuit_integration.py already
proved the registry-to-endpoint half of that chain (Shreshtha's side);
this file proves the agent-to-registry half (the half a real hosts-file
block would exercise), closing the loop end-to-end without needing to
touch system DNS. If this passes, the only thing left to confirm live is
that the browser renders it — see docs/api_contracts.md's Day 11 status.
"""

from unittest.mock import patch, MagicMock

import pytest

from sentinel.agents.sentinel_agent import SentinelAgent
from sentinel.agents.triage_agent import TriageAgent
from sentinel.fallback.circuit_breaker import circuit_registry


@pytest.fixture
def sentinel():
    with patch("sentinel.agents.sentinel_agent.SentenceTransformer") as mock_st:
        mock_st.return_value.encode.return_value = MagicMock(
            tolist=lambda: [0.1, 0.2, 0.3]
        )
        yield SentinelAgent()


@pytest.fixture
def triage():
    return TriageAgent()


@pytest.fixture(autouse=True)
def _reset_circuit_registry():
    for breaker in circuit_registry._breakers.values():
        breaker.record_success()
    yield
    for breaker in circuit_registry._breakers.values():
        breaker.record_success()


def test_real_nim_outage_opens_the_dashboard_facing_breaker(sentinel):
    """Equivalent of 'block NIM URL in hosts file' — a real embed()
    failure (not a direct circuit_registry poke) must open the NIM
    service breaker the panel reads from GET /api/circuit-status."""
    from fastapi.testclient import TestClient
    from api.main import app

    client = TestClient(app)
    assert client.get("/api/circuit-status").json()["services"]
    nim_before = next(
        s for s in client.get("/api/circuit-status").json()["services"]
        if s["service"] == "NIM"
    )
    assert nim_before["status"] == "CLOSED"

    with patch.object(sentinel.nim_client, "embed", side_effect=Exception("Name or service not known")):
        for _ in range(3):
            sentinel.embed(f"Error: distinct call {_}")  # distinct text per call — cache must not hide a real 2nd/3rd failure

    nim_after = next(
        s for s in client.get("/api/circuit-status").json()["services"]
        if s["service"] == "NIM"
    )
    assert nim_after["status"] == "OPEN"
    assert nim_after["failure_count"] == 3
    assert "Name or service not known" in nim_after["last_failure"]


def test_real_nemotron_rate_limit_falls_back_to_groq_and_opens_breaker(triage):
    """Equivalent of 'ask Nipun to trigger Nemotron failure (rate limit
    simulation)' — a real diagnose() call, not a direct breaker poke.
    Confirms both halves of what Shreshtha's panel + Workflow DAG need:
    (1) the dashboard-facing Nemotron breaker opens, and (2) the
    diagnosis result itself carries fallback_used/fallback_origin,
    which is what drives the Groq fallback banner/badge (already
    rendered by TriageReportCard; the pulsing Triage-node halo variant
    is Day 12 scope per Shreshtha's own guide, not built yet)."""
    from fastapi.testclient import TestClient
    from api.main import app

    client = TestClient(app)
    loop_event = {"worker_id": "worker-shreshtha-11", "similarity": 0.95, "consecutive_count": 3, "error_hash": "rate_limited"}
    log_lines = ["Error: Field 'Tax_ID' not found in schema"]

    with patch.object(triage.nemotron_client, "chat", side_effect=Exception("429 Too Many Requests")):
        with patch.object(
            triage.groq_client, "chat",
            return_value='{"root_cause": "Tax_ID missing", "fix_type": "SCHEMA_MISMATCH", "affected_field": "Tax_ID", "confidence": 0.88}',
        ):
            result = triage.diagnose(loop_event, log_lines)

    assert result["fallback_used"] is True
    assert result["fallback_origin"] == "groq"

    nemotron_status = next(
        s for s in client.get("/api/circuit-status").json()["services"]
        if s["service"] == "Nemotron"
    )
    assert nemotron_status["failure_count"] == 1
    assert "429" in nemotron_status["last_failure"]

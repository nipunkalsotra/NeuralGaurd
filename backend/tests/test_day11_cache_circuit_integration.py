# backend/tests/test_day11_cache_circuit_integration.py
"""
Day 11 — Caching Layer Integration + Circuit Breaker Panel.

Both caches (embedding_cache, diagnosis_cache) and the circuit_registry
wiring into all 5 services (NIM, Nemotron, cuOpt, Groq, NemoClaw) were
already wired into their owning agents ahead of schedule on Days 1, 4, 6
and 8 (see docs/cache_schema.md, docs/api_contracts.md's Day 6 section).
Existing unit tests (test_sentinel.py, test_triage.py, test_circuit_breaker.py)
already prove the low-level pieces work in isolation: embed()/diagnose()
cache hits, and the CircuitBreaker class's state machine.

Two real gaps remained for Day 11's specific blocker checks, closed here:
1. No test drove the cache hit through the actual entry points named in
   the guide — detect_loop() and diagnose() called TWICE with identical
   input — only the lower-level embed()/diagnose() cache tests existed.
2. No test proved circuit state (OPEN / HALF_OPEN / CLOSED) is visible
   through the live GET /api/circuit-status endpoint the dashboard panel
   actually polls — test_circuit_breaker.py only exercises the
   CircuitBreaker class directly, never through the HTTP layer.

cuOpt remains intentionally skipped per the Day 4-5 decision in
docs/api_contracts.md — CircuitBreakerPanel.tsx already renders it as
"Unused" rather than a live health indicator. Nothing to change there.
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
    """circuit_registry is a process-wide singleton by design (so the
    dashboard panel and every agent read/write one shared state) — reset
    it before and after each test so failures injected here don't leak
    into other test files or between tests in this file."""
    for breaker in circuit_registry._breakers.values():
        breaker.record_success()
    yield
    for breaker in circuit_registry._breakers.values():
        breaker.record_success()


# ── detect_loop() cache integration ─────────────────────────────────────

def test_detect_loop_twice_same_output_hits_cache(sentinel):
    """Day 11 blocker: trigger loop detection twice with the same output —
    second call must use the cache, not call NIM again."""
    with patch.object(
        sentinel.nim_client, "embed", return_value=[0.9, 0.9, 0.9]
    ) as mock_nim:
        for _ in range(4):
            sentinel.detect_loop("worker-11a", "Error: Tax_ID missing", "Tax_ID_missing")
        after_first_round = mock_nim.call_count
        for _ in range(4):
            sentinel.detect_loop("worker-11a", "Error: Tax_ID missing", "Tax_ID_missing")

    # All 8 detect_loop() calls embed the exact same text — NIM should
    # only ever be hit once; every other lookup comes from embedding_cache.
    assert after_first_round == 1
    assert mock_nim.call_count == 1


def test_detect_loop_cache_entry_preserves_fallback_origin(sentinel):
    """Cache entry must correctly remember which source produced it, even
    across repeat lookups — the dashboard's fallback indicator (and the
    Day 11 blocker's 'verify fallback_origin' check) depends on this."""
    with patch.object(sentinel.nim_client, "embed", side_effect=Exception("NIM down")):
        for _ in range(2):
            sentinel.detect_loop("worker-11b", "Error: schema drift", "schema_drift")

    cache_key = list(sentinel.embedding_cache._store.keys())[0]
    _, _, origin = sentinel.embedding_cache._store[cache_key]
    assert origin == "sentence-transformers"


# ── diagnose() cache integration ────────────────────────────────────────

LOOP_EVENT = {
    "worker_id": "worker-11c",
    "similarity": 0.95,
    "consecutive_count": 3,
    "error_hash": "day11_hash",
}
LOG_LINES = ["Error: Tax_ID not found", "Retrying...", "Error: Tax_ID not found"]
VALID_JSON_RESPONSE = (
    '{"root_cause": "Tax_ID missing", "fix_type": "SCHEMA_MISMATCH", '
    '"affected_field": "Tax_ID", "confidence": 0.9}'
)


def test_diagnose_twice_same_logs_hits_cache(triage):
    """Day 11 blocker: trigger diagnosis twice with the same logs — second
    call must use the cache, not call Nemotron again."""
    with patch.object(
        triage.nemotron_client, "chat", return_value=VALID_JSON_RESPONSE
    ) as mock_nemotron:
        triage.diagnose(LOOP_EVENT, LOG_LINES)
        triage.diagnose(LOOP_EVENT, LOG_LINES)
    assert mock_nemotron.call_count == 1


def test_diagnose_cache_entry_preserves_fallback_origin(triage):
    """Cache entry must show fallback_origin: 'groq' when Nemotron was down
    on the FIRST call — and keep showing 'groq' on the cached second call,
    not silently drift back to a default."""
    with patch.object(triage.nemotron_client, "chat", side_effect=Exception("down")):
        with patch.object(
            triage.groq_client, "chat", return_value=VALID_JSON_RESPONSE
        ) as mock_groq:
            first = triage.diagnose(LOOP_EVENT, LOG_LINES)
            second = triage.diagnose(LOOP_EVENT, LOG_LINES)

    assert mock_groq.call_count == 1  # second call was a cache hit
    assert first["fallback_origin"] == "groq"
    assert second["fallback_origin"] == "groq"

    cache_key = triage._cache_key(LOG_LINES, LOOP_EVENT["error_hash"])
    _, _, origin = triage.diagnosis_cache._store[cache_key]
    assert origin == "groq"


# ── circuit breaker panel (/api/circuit-status) ─────────────────────────

def test_circuit_status_endpoint_lists_all_5_services():
    """Panel must always show exactly the 5 services from
    docs/api_contracts.md's Circuit Breaker Service List, even before any
    traffic has touched them."""
    from fastapi.testclient import TestClient
    from api.main import app

    client = TestClient(app)
    response = client.get("/api/circuit-status")
    assert response.status_code == 200

    data = response.json()
    services = {s["service"] for s in data["services"]}
    assert services == {"NIM", "Nemotron", "cuOpt", "Groq", "NemoClaw"}
    for s in data["services"]:
        assert set(s.keys()) == {"service", "status", "failure_count", "last_failure"}


def test_circuit_status_reflects_real_backend_failures_in_real_time():
    """Day 11 blocker: a service failure must show up on the SAME endpoint
    the dashboard polls, not just on the CircuitBreaker object in
    isolation (that part is already covered by test_circuit_breaker.py) —
    this is what actually drives the panel's red dot."""
    from fastapi.testclient import TestClient
    from api.main import app

    client = TestClient(app)
    nim_breaker = circuit_registry.get("NIM")
    for _ in range(3):
        nim_breaker.record_failure(reason="simulated NIM outage")

    response = client.get("/api/circuit-status")
    nim_status = next(s for s in response.json()["services"] if s["service"] == "NIM")
    assert nim_status["status"] == "OPEN"
    assert nim_status["failure_count"] == 3
    assert nim_status["last_failure"] == "simulated NIM outage"


def test_circuit_status_reflects_half_open_after_timeout():
    """Day 11 blocker: after the open window elapses, the live endpoint
    must report HALF_OPEN (dashboard renders this as yellow)."""
    from fastapi.testclient import TestClient
    from api.main import app

    client = TestClient(app)
    groq_breaker = circuit_registry.get("Groq")
    for _ in range(3):
        groq_breaker.record_failure(reason="simulated Groq outage")
    assert groq_breaker.get_status()["status"] == "OPEN"

    # Simulate the 60s open window elapsing without a real sleep — same
    # technique test_circuit_breaker.py uses via a short open_duration,
    # applied here to the real service breaker's fixed 60s window.
    groq_breaker.opened_at -= 61

    response = client.get("/api/circuit-status")
    groq_status = next(s for s in response.json()["services"] if s["service"] == "Groq")
    assert groq_status["status"] == "HALF_OPEN"


def test_circuit_status_recovers_to_closed_after_successful_probe():
    """Yellow (half-open) -> green (closed) recovery, verified end-to-end
    through the live endpoint after a successful probe request."""
    from fastapi.testclient import TestClient
    from api.main import app

    client = TestClient(app)
    nemotron_breaker = circuit_registry.get("Nemotron")
    for _ in range(3):
        nemotron_breaker.record_failure(reason="simulated outage")
    nemotron_breaker.opened_at -= 61
    assert nemotron_breaker.allow_request() is True  # the probe request
    nemotron_breaker.record_success()

    response = client.get("/api/circuit-status")
    nemotron_status = next(
        s for s in response.json()["services"] if s["service"] == "Nemotron"
    )
    assert nemotron_status["status"] == "CLOSED"


# ── cache integration must not break existing behavior ──────────────────

def test_repeated_fault_injection_still_detects_loop_with_cache_warm():
    """Day 11 critical note: 'Cache integration must NOT break existing
    functionality.' Hitting the exact same fault twice — the second call
    now backed by a warm embedding cache — must still detect the loop
    correctly both times."""
    from fastapi.testclient import TestClient
    from api.main import app

    client = TestClient(app)
    payload = {
        "target": "worker-11-cache-warm",
        "fault_type": "schema_corruption",
        "payload": {"field": "Tax_ID"},
    }
    first = client.post("/demo/inject", json=payload)
    second = client.post("/demo/inject", json=payload)

    assert first.status_code == 200 and second.status_code == 200
    assert first.json()["details"]["loop_detected"] is True
    assert second.json()["details"]["loop_detected"] is True

# backend/tests/test_day12_shreshtha_metrics.py
"""
Day 12 — Report Card Backend + Token Counter + Throughput Tracker
(Shreshtha).

Guide's own critical note: "Metrics must be REAL, not hardcoded.
Calculate from actual audit log events." Every test here drives the real
agent methods / real audit log file, never asserts against a pre-baked
number — see report_card.py's module docstring for how each of the 6
ReportCardMetrics fields is actually derived, and its documented honesty
tradeoff on throughput_maintained (tied to OptimizationAgent's real
solver output, not the guide's illustrative 71%/97% narrative numbers,
since no item-processing pipeline exists to measure those against).
"""

from unittest.mock import patch, MagicMock

import pytest
import httpx

from sentinel.metrics.token_counter import TokenCounter
from sentinel.metrics.throughput_tracker import ThroughputTracker
from sentinel.metrics.report_card import build_report_card
from sentinel.agents.triage_agent import TriageAgent
from sentinel.agents.orchestrator import Orchestrator, WorkerState
from sentinel.event_bus.asyncio_queue_bus import EventBus
from sentinel.audit.trustchain_logger import TrustChainLogger


# ── TokenCounter ──────────────────────────────────────────────────────

def test_token_counter_records_and_sums_per_hour():
    tc = TokenCounter(hourly_budget=1000)
    tc.record("TriageAgent", "Nemotron", 120)
    tc.record("TriageAgent", "Nemotron", 80)
    assert tc.usage_this_hour("TriageAgent", "Nemotron") == 200


def test_token_counter_ignores_zero_or_missing_usage():
    tc = TokenCounter()
    tc.record("TriageAgent", "Nemotron", 0)
    assert tc.usage_this_hour("TriageAgent", "Nemotron") == 0


def test_token_counter_soft_limit_enforcement():
    tc = TokenCounter(hourly_budget=100)
    tc.record("TriageAgent", "Nemotron", 100)
    assert tc.is_over_budget("TriageAgent", "Nemotron") is True
    assert tc.is_over_budget("TriageAgent", "Groq") is False  # separate bucket


def test_token_counter_cache_hit_savings_uses_last_real_cost():
    tc = TokenCounter()
    tc.record("TriageAgent", "Nemotron", 180)
    tc.record_cache_hit_savings("TriageAgent", "Nemotron")
    assert tc.total_saved() == 180


def test_triage_diagnose_over_budget_skips_straight_to_groq():
    """Day 12 blocker: soft limit enforcement. Once Nemotron's hourly
    budget is exhausted, diagnose() must not even attempt it — go
    straight to Groq — same as if the circuit breaker were open."""
    agent = TriageAgent()
    agent.token_counter = None  # not used directly; module-level singleton is what diagnose() reads
    from sentinel.metrics.token_counter import token_counter
    token_counter.reset()
    token_counter.record("TriageAgent", "Nemotron", token_counter.hourly_budget)

    with patch.object(agent.nemotron_client, "chat") as mock_nemotron:
        with patch.object(
            agent.groq_client, "chat",
            return_value='{"root_cause": "x", "fix_type": "SCHEMA_MISMATCH", "affected_field": "y", "confidence": 0.8}',
        ):
            result = agent.diagnose(
                {"worker_id": "worker-12tok", "error_hash": "over_budget"}, ["Error: x"]
            )
    mock_nemotron.assert_not_called()
    assert result["fallback_origin"] == "groq"
    token_counter.reset()


# ── ThroughputTracker ─────────────────────────────────────────────────

def test_throughput_tracker_baseline_when_no_orchestrator():
    assert ThroughputTracker(None).current_pct() == 100.0


def test_throughput_tracker_baseline_when_no_incidents_yet():
    orch = Orchestrator(event_bus=EventBus())
    assert ThroughputTracker(orch).current_pct() == 100.0


@pytest.mark.asyncio
async def test_throughput_tracker_reflects_real_reroute_plan():
    orch = Orchestrator(event_bus=EventBus())
    await orch.event_bus.publish("OPTIMIZATION_COMPLETE", {
        "worker_id": "worker-12a", "assignments": [], "excluded_workers": [],
        "projected_throughput_pct": 82.5, "solver_used": "or-tools",
    })
    assert ThroughputTracker(orch).current_pct() == 82.5


# ── Report Card aggregation ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_report_card_computed_from_real_audit_log(tmp_path):
    """Drive a real HEALTHY -> ... -> RESUMED cycle and confirm every
    ReportCardMetrics field is derived from the resulting audit log /
    live agent state, not hardcoded."""
    from sentinel.agents.remediation_agent import RemediationAgent
    from sentinel.metrics.token_counter import token_counter
    token_counter.reset()

    mock_triage = MagicMock()
    mock_triage.diagnose.return_value = {
        "root_cause": "Tax_ID missing", "fix_type": "SCHEMA_MISMATCH",
        "affected_field": "Tax_ID", "confidence": 0.9, "fallback_used": True,
        "fallback_origin": "groq",
    }
    remediation_agent = RemediationAgent()

    async def mock_post_verified_true(self, url, json=None, **kwargs):
        request = httpx.Request("POST", url)
        return httpx.Response(200, json={
            "verified": True, "output": "ok", "sandbox_log": "",
            "mode": "mock", "flagged": False,
        }, request=request)

    with patch.object(httpx.AsyncClient, "post", mock_post_verified_true):
        audit_logger = TrustChainLogger(log_file=str(tmp_path / "audit.jsonl"))
        bus = EventBus()
        orch = Orchestrator(
            event_bus=bus, triage_agent=mock_triage,
            remediation_agent=remediation_agent, audit_logger=audit_logger,
        )
        await bus.publish("LOOP_SUSPECTED", {"worker_id": "worker-12rc", "similarity": 0.95})

    assert orch.get_state("worker-12rc") == WorkerState.RESUMED

    card = build_report_card(str(tmp_path / "audit.jsonl"), orch)

    assert card["fixes_applied"] == 1
    assert card["escalations"] == 0
    assert card["fallbacks_triggered"] >= 1  # the REMEDIATING record carries fallback_used=True
    assert card["time_to_detect"] is not None and card["time_to_detect"] >= 0
    assert card["throughput_maintained"] == 100.0  # no OPTIMIZATION_COMPLETE published in this test
    token_counter.reset()


def test_report_card_handles_empty_log_honestly(tmp_path):
    """No incidents yet -> counts are 0 and time_to_detect is None, not a
    fabricated placeholder — matches the guide's own 'real, not
    hardcoded' requirement even in the empty-state case."""
    card = build_report_card(str(tmp_path / "nonexistent.jsonl"), None)
    assert card == {
        "time_to_detect": None,
        "tokens_saved": card["tokens_saved"],  # cumulative across the process; not asserted to be 0 here
        "throughput_maintained": 100.0,
        "fixes_applied": 0,
        "escalations": 0,
        "fallbacks_triggered": 0,
    }


# ── /api/metrics endpoints ────────────────────────────────────────────

def test_metrics_endpoints_return_expected_shape():
    from fastapi.testclient import TestClient
    from api.main import app

    client = TestClient(app)

    tokens_resp = client.get("/api/metrics/tokens")
    assert tokens_resp.status_code == 200
    assert set(tokens_resp.json().keys()) == {"usage", "hourly_budget", "total_saved"}

    throughput_resp = client.get("/api/metrics/throughput")
    assert throughput_resp.status_code == 200
    assert "throughput_pct" in throughput_resp.json()

    combined_resp = client.get("/api/metrics")
    assert combined_resp.status_code == 200
    assert set(combined_resp.json().keys()) == {
        "time_to_detect", "tokens_saved", "throughput_maintained",
        "fixes_applied", "escalations", "fallbacks_triggered",
    }

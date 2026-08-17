# backend/tests/test_day12_tushar_fallback_indicators.py
"""
Day 12 — Fallback Indicators (Shreshtha's guide, backend half).

The guide's 4 fallback indicators (Groq halo on Triage, sentence-
transformers ring on Sentinel, OR-Tools ring on Optimization, mock ring
on Remediation) all need the SAME thing: fallback_origin riding on the
audit_event the frontend already listens to. Triage's half already
existed (Day 10). This file proves the other 3 — closing 2 real gaps in
the process:

1. LOOP_SUSPECTED's audit record never carried which embedding source
   (NIM / sentence-transformers / hash) detected the loop — no way to
   drive the Sentinel node's ring at all.
2. on_optimization_complete's own docstring claimed it "writes it to the
   audit trail... same as every other real transition" — it never
   actually did; only logged and stored in-memory. No way to drive the
   Optimization node's ring either.

Remediation's mock-mode fallback_origin (RESUMED/ESCALATED transitions
carrying mode="mock") is the third, smaller addition, mirroring the
pattern Triage's REMEDIATING transition already used.
"""

import json
from unittest.mock import MagicMock, patch

import httpx
import pytest

from sentinel.agents.orchestrator import Orchestrator, WorkerState
from sentinel.agents.sentinel_agent import SentinelAgent
from sentinel.agents.remediation_agent import RemediationAgent
from sentinel.event_bus.asyncio_queue_bus import EventBus
from sentinel.audit.trustchain_logger import TrustChainLogger


def _records(log_file):
    with open(log_file) as f:
        return [json.loads(line) for line in f if line.strip()]


# ── Sentinel: embedding fallback_origin on LOOP_SUSPECTED ──────────────

def test_detect_loop_carries_embedding_origin_when_falling_back():
    with patch("sentinel.agents.sentinel_agent.SentenceTransformer") as mock_st:
        mock_st.return_value.encode.return_value = MagicMock(tolist=lambda: [0.9, 0.9, 0.9])
        agent = SentinelAgent()

    with patch.object(agent.nim_client, "embed", side_effect=Exception("NIM down")):
        event = None
        for _ in range(4):
            event = agent.detect_loop("worker-12tf-a", "Error: same text", "same_sig")

    assert event is not None
    assert event["embedding_origin"] == "sentence-transformers"


@pytest.mark.asyncio
async def test_loop_suspected_record_carries_sentence_transformers_fallback(tmp_path):
    audit_logger = TrustChainLogger(log_file=str(tmp_path / "audit.jsonl"))
    mock_triage = MagicMock()
    mock_triage.diagnose.return_value = {
        "root_cause": "x", "fix_type": "SCHEMA_MISMATCH", "affected_field": "y",
        "confidence": 0.9, "fallback_used": False,
    }
    orch = Orchestrator(event_bus=EventBus(), triage_agent=mock_triage, audit_logger=audit_logger)

    await orch.event_bus.publish("LOOP_SUSPECTED", {
        "worker_id": "worker-12tf-b", "similarity": 0.95, "embedding_origin": "sentence-transformers",
    })

    record = next(r for r in _records(str(tmp_path / "audit.jsonl")) if r["to_state"] == "LOOP_SUSPECTED")
    assert record["fallback_used"] is True
    assert record["fallback_origin"] == "sentence-transformers"


@pytest.mark.asyncio
async def test_loop_suspected_record_has_no_fallback_when_nim_succeeded(tmp_path):
    audit_logger = TrustChainLogger(log_file=str(tmp_path / "audit.jsonl"))
    mock_triage = MagicMock()
    mock_triage.diagnose.return_value = {
        "root_cause": "x", "fix_type": "SCHEMA_MISMATCH", "affected_field": "y",
        "confidence": 0.9, "fallback_used": False,
    }
    orch = Orchestrator(event_bus=EventBus(), triage_agent=mock_triage, audit_logger=audit_logger)

    await orch.event_bus.publish("LOOP_SUSPECTED", {
        "worker_id": "worker-12tf-c", "similarity": 0.95, "embedding_origin": "NIM",
    })

    record = next(r for r in _records(str(tmp_path / "audit.jsonl")) if r["to_state"] == "LOOP_SUSPECTED")
    assert record["fallback_used"] is False
    assert record["fallback_origin"] is None


# ── Optimization: real audit record + broadcast on OPTIMIZATION_COMPLETE ─

@pytest.mark.asyncio
async def test_optimization_complete_actually_writes_audit_record(tmp_path):
    """Regression test for the docstring/code mismatch: this used to only
    log to console despite claiming to write to the audit trail."""
    audit_logger = TrustChainLogger(log_file=str(tmp_path / "audit.jsonl"))
    orch = Orchestrator(event_bus=EventBus(), audit_logger=audit_logger)

    await orch.event_bus.publish("OPTIMIZATION_COMPLETE", {
        "worker_id": "worker-12tf-d", "assignments": [], "excluded_workers": [],
        "projected_throughput_pct": 88.0, "solver_used": "or-tools",
    })

    records = _records(str(tmp_path / "audit.jsonl"))
    assert len(records) == 1
    record = records[0]
    assert record["trigger_event"] == "OPTIMIZATION_COMPLETE"
    assert record["agent_name"] == "OptimizationAgent"
    assert record["fallback_used"] is True
    assert record["fallback_origin"] == "or-tools"
    # Side-channel event, not an FSM move — from/to should be the
    # worker's actual current state (HEALTHY, since no incident here).
    assert record["from_state"] == record["to_state"] == "HEALTHY"


@pytest.mark.asyncio
async def test_optimization_complete_broadcasts_over_websocket(tmp_path, monkeypatch):
    audit_logger = TrustChainLogger(log_file=str(tmp_path / "audit.jsonl"))
    orch = Orchestrator(event_bus=EventBus(), audit_logger=audit_logger)

    broadcasts = []

    async def fake_broadcast(worker_id, audit_record):
        broadcasts.append((worker_id, audit_record))

    monkeypatch.setattr("sentinel.agents.orchestrator.broadcast_audit_event", fake_broadcast)

    await orch.event_bus.publish("OPTIMIZATION_COMPLETE", {
        "worker_id": "worker-12tf-e", "assignments": [], "excluded_workers": [],
        "projected_throughput_pct": 90.0, "solver_used": "greedy_round_robin",
    })

    assert len(broadcasts) == 1
    assert broadcasts[0][0] == "worker-12tf-e"
    assert broadcasts[0][1]["fallback_origin"] == "greedy_round_robin"


# ── Triage: rule_based_heuristic fallback_origin on ESCALATED ───────────

@pytest.mark.asyncio
async def test_escalated_record_carries_rule_based_heuristic_fallback_origin(tmp_path):
    """The rule-based heuristic's confidence (always 0.65) is always
    below CONFIDENCE_ESCALATION_THRESHOLD (0.7), so this is the ONLY
    branch fallback_origin='rule_based_heuristic' can ever reach — it
    can never occur on a REMEDIATING transition. Regression test for
    the gap where this branch dropped fallback_used/fallback_origin
    entirely."""
    audit_logger = TrustChainLogger(log_file=str(tmp_path / "audit.jsonl"))
    mock_triage = MagicMock()
    mock_triage.diagnose.return_value = {
        "root_cause": "unknown", "fix_type": "SCHEMA_MISMATCH", "affected_field": "y",
        "confidence": 0.65, "fallback_used": True, "fallback_origin": "rule_based_heuristic",
    }
    orch = Orchestrator(event_bus=EventBus(), triage_agent=mock_triage, audit_logger=audit_logger)

    await orch.event_bus.publish("LOOP_SUSPECTED", {"worker_id": "worker-12tf-h", "similarity": 0.95})

    assert orch.get_state("worker-12tf-h") == WorkerState.ESCALATED
    escalated_record = next(r for r in _records(str(tmp_path / "audit.jsonl")) if r["to_state"] == "ESCALATED")
    assert escalated_record["fallback_used"] is True
    assert escalated_record["fallback_origin"] == "rule_based_heuristic"


# ── Remediation: mock-mode fallback_origin on RESUMED ───────────────────

@pytest.mark.asyncio
async def test_resumed_record_carries_mock_fallback_origin(tmp_path):
    audit_logger = TrustChainLogger(log_file=str(tmp_path / "audit.jsonl"))
    mock_triage = MagicMock()
    mock_triage.diagnose.return_value = {
        "root_cause": "x", "fix_type": "SCHEMA_MISMATCH", "affected_field": "y",
        "confidence": 0.9, "fallback_used": False,
    }
    remediation_agent = RemediationAgent()

    async def mock_post_mock_mode(self, url, json=None, **kwargs):
        request = httpx.Request("POST", url)
        return httpx.Response(200, json={
            "verified": True, "output": "ok", "sandbox_log": "",
            "mode": "mock", "flagged": True,
        }, request=request)

    with patch.object(httpx.AsyncClient, "post", mock_post_mock_mode):
        orch = Orchestrator(
            event_bus=EventBus(), triage_agent=mock_triage,
            remediation_agent=remediation_agent, audit_logger=audit_logger,
        )
        await orch.event_bus.publish("LOOP_SUSPECTED", {"worker_id": "worker-12tf-f", "similarity": 0.95})

    assert orch.get_state("worker-12tf-f") == WorkerState.RESUMED
    resumed_record = next(r for r in _records(str(tmp_path / "audit.jsonl")) if r["to_state"] == "RESUMED")
    assert resumed_record["fallback_origin"] == "mock"


@pytest.mark.asyncio
async def test_resumed_record_no_mock_origin_when_nemoclaw_primary_succeeded(tmp_path):
    audit_logger = TrustChainLogger(log_file=str(tmp_path / "audit.jsonl"))
    mock_triage = MagicMock()
    mock_triage.diagnose.return_value = {
        "root_cause": "x", "fix_type": "SCHEMA_MISMATCH", "affected_field": "y",
        "confidence": 0.9, "fallback_used": False,
    }
    remediation_agent = RemediationAgent()

    async def mock_post_primary_mode(self, url, json=None, **kwargs):
        request = httpx.Request("POST", url)
        return httpx.Response(200, json={
            "verified": True, "output": "ok", "sandbox_log": "",
            "mode": "nemoclaw", "flagged": False,
        }, request=request)

    with patch.object(httpx.AsyncClient, "post", mock_post_primary_mode):
        orch = Orchestrator(
            event_bus=EventBus(), triage_agent=mock_triage,
            remediation_agent=remediation_agent, audit_logger=audit_logger,
        )
        await orch.event_bus.publish("LOOP_SUSPECTED", {"worker_id": "worker-12tf-g", "similarity": 0.95})

    resumed_record = next(r for r in _records(str(tmp_path / "audit.jsonl")) if r["to_state"] == "RESUMED")
    assert resumed_record["fallback_origin"] is None

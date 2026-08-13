# backend/tests/test_orchestrator.py
"""
Orchestrator tests — Day 3.
Verifies: Sentinel detects loop -> Orchestrator transitions -> Triage dispatched.
Day 10: Orchestrator also consumes OptimizationAgent's ReroutePlan (was
computed and silently dropped before — see docs/api_contracts.md Day 10
notes on the OPTIMIZATION_COMPLETE consumer gap).
"""

from unittest.mock import MagicMock

import pytest
import httpx

from sentinel.agents.orchestrator import Orchestrator, WorkerState
from sentinel.event_bus.asyncio_queue_bus import EventBus
from sentinel.agents.remediation_agent import RemediationAgent
from sentinel.audit.trustchain_logger import TrustChainLogger

@pytest.fixture
def mock_triage_agent():
    agent = MagicMock()
    agent.diagnose.return_value = {
        "root_cause": "Tax_ID missing",
        "fix_type": "SCHEMA_MISMATCH",
        "affected_field": "Tax_ID",
        "confidence": 0.9,
        "fallback_used": False,
    }
    return agent


@pytest.fixture
def orchestrator(mock_triage_agent):
    bus = EventBus()
    return Orchestrator(event_bus=bus, triage_agent=mock_triage_agent)

@pytest.mark.asyncio
async def test_diagnosis_complete_event_published(orchestrator):
    """After dispatching Triage, Orchestrator should publish DIAGNOSIS_COMPLETE."""
    received = []

    async def capture(event):
        received.append(event)

    orchestrator.event_bus.subscribe("DIAGNOSIS_COMPLETE", capture)

    loop_event = {"worker_id": "worker-3", "similarity": 0.95, "consecutive_count": 3}
    await orchestrator.event_bus.publish("LOOP_SUSPECTED", loop_event)

    assert len(received) == 1
    assert received[0]["worker_id"] == "worker-3"
    assert received[0]["root_cause"] == "Tax_ID missing"


@pytest.mark.asyncio
async def test_illegal_transition_raises(orchestrator):
    """Skipping states (e.g. HEALTHY -> DIAGNOSING directly) should be rejected."""
    with pytest.raises(ValueError):
        await orchestrator.transition(
            "worker-3", WorkerState.DIAGNOSING,
            trigger_event="test", agent_name="test",
        )


@pytest.mark.asyncio
async def test_valid_transition_updates_state(orchestrator):
    await orchestrator.transition(
        "worker-3", WorkerState.LOOP_SUSPECTED,
        trigger_event="test", agent_name="test",
    )
    assert orchestrator.get_state("worker-3") == WorkerState.LOOP_SUSPECTED


@pytest.mark.asyncio
async def test_fsm_full_chain_to_remediating(orchestrator, mock_triage_agent):
    """Sentinel's LOOP_SUSPECTED event should drive the full chain:
    HEALTHY -> LOOP_SUSPECTED -> DIAGNOSING -> REMEDIATING (Day 5: the
    mock Triage returns confidence 0.9, so escalation isn't triggered
    and the worker advances all the way to REMEDIATING in one publish)."""
    assert orchestrator.get_state("worker-3") == WorkerState.HEALTHY

    loop_event = {
        "worker_id": "worker-3",
        "similarity": 0.95,
        "consecutive_count": 3,
        "error_hash": "abc123",
        "embedding_vector": [0.1, 0.2, 0.3],
        "timestamp": "2026-07-25T10:00:00Z",
    }

    await orchestrator.event_bus.publish("LOOP_SUSPECTED", loop_event)

    assert orchestrator.get_state("worker-3") == WorkerState.REMEDIATING
    mock_triage_agent.diagnose.assert_called_once()


@pytest.mark.asyncio
async def test_full_fsm_verified_true_reaches_resumed(tmp_path, monkeypatch):
    """End-to-end: HEALTHY -> ... -> REMEDIATING -> VERIFYING -> RESUMED
    when wrapper returns verified=true."""
    mock_triage = MagicMock()
    mock_triage.diagnose.return_value = {
        "root_cause": "Tax_ID missing", "fix_type": "SCHEMA_MISMATCH",
        "affected_field": "Tax_ID", "confidence": 0.9, "fallback_used": False,
    }

    remediation_agent = RemediationAgent()

    async def mock_post_verified_true(self, url, json=None, **kwargs):
        request = httpx.Request("POST", url)
        return httpx.Response(200, json={
            "verified": True, "output": "ok", "sandbox_log": "",
            "mode": "mock", "flagged": False,
        }, request=request)

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post_verified_true)

    audit_logger = TrustChainLogger(log_file=str(tmp_path / "audit.jsonl"))
    bus = EventBus()
    orch = Orchestrator(
        event_bus=bus, triage_agent=mock_triage,
        remediation_agent=remediation_agent, audit_logger=audit_logger,
    )

    await bus.publish("LOOP_SUSPECTED", {"worker_id": "worker-3", "similarity": 0.95})

    assert orch.get_state("worker-3") == WorkerState.RESUMED
    assert audit_logger.verify_chain() is True

    import json
    records = [json.loads(line) for line in (tmp_path / "audit.jsonl").read_text().splitlines()]
    remediating_record = next(r for r in records if r["to_state"] == "REMEDIATING")
    # Day 10: root_cause/fix_type/affected_field must ride along on the
    # transition into REMEDIATING — this is what lets the dashboard's
    # Triage Report Card open on live data instead of only demo buttons.
    assert remediating_record["root_cause"] == "Tax_ID missing"
    assert remediating_record["fix_type"] == "SCHEMA_MISMATCH"
    assert remediating_record["affected_field"] == "Tax_ID"
    # Every other transition must still have these as null, not leak
    # a stale diagnosis onto unrelated states.
    loop_suspected_record = next(r for r in records if r["to_state"] == "LOOP_SUSPECTED")
    assert loop_suspected_record["root_cause"] is None


@pytest.mark.asyncio
async def test_full_fsm_verified_false_escalates_no_retry(tmp_path, monkeypatch):
    """verified=false -> ESCALATED directly. No retry loop — confirm
    remediate() is called exactly once, not looped."""
    mock_triage = MagicMock()
    mock_triage.diagnose.return_value = {
        "root_cause": "unknown", "fix_type": "SCHEMA_MISMATCH",
        "affected_field": "X", "confidence": 0.9, "fallback_used": False,
    }

    remediation_agent = RemediationAgent()
    call_count = {"count": 0}

    async def mock_post_verified_false(self, url, json=None, **kwargs):
        call_count["count"] += 1
        request = httpx.Request("POST", url)
        return httpx.Response(200, json={
            "verified": False, "output": "patch failed", "sandbox_log": "",
            "mode": "mock", "flagged": False,
        }, request=request)

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post_verified_false)

    audit_logger = TrustChainLogger(log_file=str(tmp_path / "audit.jsonl"))
    bus = EventBus()
    orch = Orchestrator(
        event_bus=bus, triage_agent=mock_triage,
        remediation_agent=remediation_agent, audit_logger=audit_logger,
    )

    await bus.publish("LOOP_SUSPECTED", {"worker_id": "worker-4", "similarity": 0.95})

    assert orch.get_state("worker-4") == WorkerState.ESCALATED
    assert call_count["count"] == 1  # confirms NO retry loop


@pytest.mark.asyncio
async def test_loop_suspected_after_escalation_resets_instead_of_crashing(orchestrator):
    """Day 11 fix: ESCALATED is a deliberate terminal state (no legal
    outgoing transition), but a brand-new fault injected against a worker
    that previously escalated must start a fresh incident, not raise.
    Regression test for the crash caught by
    test_day11_cache_circuit_integration.py's repeated-injection test."""
    await orchestrator.transition(
        "worker-9", WorkerState.LOOP_SUSPECTED,
        trigger_event="test", agent_name="test",
    )
    await orchestrator.transition(
        "worker-9", WorkerState.DIAGNOSING,
        trigger_event="test", agent_name="test",
    )
    await orchestrator.transition(
        "worker-9", WorkerState.ESCALATED,
        trigger_event="test", agent_name="test",
    )
    assert orchestrator.get_state("worker-9") == WorkerState.ESCALATED

    loop_event = {
        "worker_id": "worker-9", "similarity": 0.95, "consecutive_count": 3,
    }
    await orchestrator.event_bus.publish("LOOP_SUSPECTED", loop_event)

    assert orchestrator.get_state("worker-9") == WorkerState.REMEDIATING


@pytest.mark.asyncio
async def test_orchestrator_consumes_optimization_complete(orchestrator):
    """Day 10 fix: OPTIMIZATION_COMPLETE previously had no subscriber at
    all in production — the Optimization Agent's real, computed ReroutePlan
    was silently discarded. Confirms it's now stored per worker."""
    reroute_plan = {
        "worker_id": "worker-5",
        "assignments": [{"item_id": "item-1", "worker_id": "worker-2"}],
        "excluded_workers": ["worker-5"],
        "projected_throughput_pct": 97.0,
        "solver_used": "or-tools",
    }

    await orchestrator.event_bus.publish("OPTIMIZATION_COMPLETE", reroute_plan)

    stored = orchestrator.reroute_plans["worker-5"]
    assert stored["assignments"] == reroute_plan["assignments"]
    assert stored["excluded_workers"] == ["worker-5"]
    assert stored["projected_throughput_pct"] == 97.0
    assert stored["solver_used"] == "or-tools"
# backend/tests/test_day9_nipun_integration.py
"""
Day 9 — Integration Test on Shreshtha's Machine (Nipun's scope: SDK Lead
& Fallback Architect — owns Orchestrator, TriageAgent, RemediationAgent).

Adapted for a single-machine build: rather than mocking httpx at the
network boundary (as the Day 5-8 orchestrator tests do), this drives the
full Orchestrator FSM against the REAL, live wrapper_service.py process
(Shreshtha's owned code) started in PRIMARY mode by the shared
`live_wrapper_primary_mode` fixture in conftest.py. This machine has no
real `nemoclaw` binary, so PRIMARY mode here genuinely exercises the
auto-fallback path end-to-end across the full stack — Orchestrator ->
TriageAgent -> RemediationAgent -> live wrapper subprocess -> audit log —
not just the wrapper in isolation (see
wrapper/tests/test_nemoclaw_adapter.py for that layer).
"""

import json
import time
from unittest.mock import MagicMock

import pytest

from sentinel.agents.orchestrator import Orchestrator, WorkerState
from sentinel.agents.remediation_agent import RemediationAgent
from sentinel.audit.trustchain_logger import TrustChainLogger
from sentinel.event_bus.asyncio_queue_bus import EventBus


@pytest.mark.asyncio
async def test_full_fsm_survives_nemoclaw_unavailable_end_to_end(
    live_wrapper_primary_mode, tmp_path
):
    """HEALTHY -> LOOP_SUSPECTED -> DIAGNOSING -> REMEDIATING -> VERIFYING
    -> RESUMED against the REAL, live wrapper in PRIMARY mode. Confirms
    the Day 9 blocker end-to-end: the full stack reaches RESUMED with the
    fallback surfaced correctly, the audit hash chain stays intact, and
    the whole round-trip stays under 5 seconds."""
    mock_triage = MagicMock()
    mock_triage.diagnose.return_value = {
        "root_cause": "Tax_ID missing", "fix_type": "SCHEMA_MISMATCH",
        "affected_field": "Tax_ID", "confidence": 0.9, "fallback_used": False,
    }

    remediation_agent = RemediationAgent(wrapper_url=live_wrapper_primary_mode)
    audit_log_file = tmp_path / "audit.jsonl"
    audit_logger = TrustChainLogger(log_file=str(audit_log_file))
    bus = EventBus()
    orch = Orchestrator(
        event_bus=bus, triage_agent=mock_triage,
        remediation_agent=remediation_agent, audit_logger=audit_logger,
    )

    start = time.monotonic()
    await bus.publish(
        "LOOP_SUSPECTED", {"worker_id": "worker-nipun-day9", "similarity": 0.95}
    )
    elapsed = time.monotonic() - start

    assert elapsed < 5.0, f"full-stack fallback took {elapsed:.2f}s, must be <5s"
    assert orch.get_state("worker-nipun-day9") == WorkerState.RESUMED
    assert audit_logger.verify_chain() is True

    records = [json.loads(line) for line in audit_log_file.read_text().splitlines()]
    resumed_record = next(r for r in records if r["to_state"] == "RESUMED")
    assert resumed_record["fallback_used"] is True, (
        "RESUMED was reached via the wrapper's mock fallback (no real "
        "nemoclaw binary on this host) — the audit record must say so."
    )

# backend/tests/test_fallback_chains.py
"""
Day 8 — Consolidated fallback chain tests, one file covering every
cascading fallback path in the system per master doc Section 9.

NOTE on scope vs. original spec:
- cuOpt -> OR-Tools: cuOpt was explicitly SKIPPED for this project (API
  access never confirmed working — see docs/api_contracts.md "Day 4-5
  Solver Status"). Practical chain is OR-Tools -> greedy round-robin,
  tested here instead.
- Orchestrator nvidia-nat -> asyncio: nvidia-nat was never integrated;
  the EventBus was built directly on asyncio.Queue from Day 3. No
  fallback test applies since there's nothing to fall back FROM.
"""

from unittest.mock import patch, MagicMock

import pytest

from sentinel.agents.sentinel_agent import SentinelAgent
from sentinel.agents.triage_agent import TriageAgent
from sentinel.agents.optimization_agent import OptimizationAgent
from sentinel.agents.remediation_agent import RemediationAgent


# ── Sentinel: NIM -> sentence-transformers -> hash ──────────────────────

@pytest.fixture
def sentinel_agent():
    with patch("sentinel.agents.sentinel_agent.SentenceTransformer") as mock_st:
        mock_st.return_value.encode.return_value = MagicMock(tolist=lambda: [0.1, 0.2, 0.3])
        yield SentinelAgent()


def test_sentinel_nim_to_sentence_transformers(sentinel_agent):
    with patch.object(sentinel_agent.nim_client, "embed", side_effect=Exception("NIM 429")):
        result = sentinel_agent.embed("test")
    assert result == [0.1, 0.2, 0.3]


def test_sentinel_sentence_transformers_to_hash(sentinel_agent):
    with patch.object(sentinel_agent.nim_client, "embed", side_effect=Exception("NIM down")):
        with patch.object(sentinel_agent.local_embedder, "encode", side_effect=Exception("model OOM")):
            result = sentinel_agent.embed("test")
    assert isinstance(result, list)
    assert len(result) == 1  # hash fallback signature


# ── Triage: Nemotron -> Groq (with JSON repair) -> heuristic ────────────

VALID_JSON = '{"root_cause": "Tax_ID missing", "fix_type": "SCHEMA_MISMATCH", "affected_field": "Tax_ID", "confidence": 0.9}'
LOOP_EVENT = {"worker_id": "worker-3", "similarity": 0.95, "consecutive_count": 3, "error_hash": "abc"}
LOG_LINES = ["Error: Tax_ID not found"]


def test_triage_nemotron_to_groq():
    agent = TriageAgent()
    with patch.object(agent.nemotron_client, "chat", side_effect=Exception("5xx")):
        with patch.object(agent.groq_client, "chat", return_value=VALID_JSON):
            result = agent.diagnose(LOOP_EVENT, LOG_LINES)
    assert result["fallback_used"] is True
    assert result["fallback_origin"] == "groq"


def test_triage_groq_json_repair():
    """Groq lacks native JSON mode — response wrapped in markdown fences."""
    agent = TriageAgent()
    malformed = f"Here's the diagnosis:\n```json\n{VALID_JSON}\n```"
    with patch.object(agent.nemotron_client, "chat", side_effect=Exception("down")):
        with patch.object(agent.groq_client, "chat", return_value=malformed):
            result = agent.diagnose(LOOP_EVENT, LOG_LINES)
    assert result["root_cause"] == "Tax_ID missing"


def test_triage_groq_to_heuristic():
    agent = TriageAgent()
    logs = ["Error: Field 'Tax_ID' not found in schema"]
    with patch.object(agent.nemotron_client, "chat", side_effect=Exception("down")):
        with patch.object(agent.groq_client, "chat", side_effect=Exception("rate limited")):
            result = agent.diagnose(LOOP_EVENT, logs)
    assert result["fallback_origin"] == "rule_based_heuristic"
    assert result["fix_type"] == "SCHEMA_MISMATCH"


# ── Optimization: OR-Tools -> greedy round-robin ─────────────────────────
# (cuOpt SKIPPED — see module docstring)

def test_optimization_ortools_to_greedy():
    agent = OptimizationAgent()
    problem = agent.formulate_problem("worker-3", [{"id": "item-1"}], [{"id": "worker-1"}])
    with patch.object(agent, "solve_with_or_tools", side_effect=Exception("solver failed")):
        result = agent.solve(problem)
    assert result["solver_used"] == "greedy_round_robin"


# ── Remediation: NemoClaw/wrapper -> mock/escalate ───────────────────────

@pytest.mark.asyncio
async def test_remediation_wrapper_timeout_to_flagged_mock():
    """Wrapper timeout -> Remediation Agent receives flagged mock result,
    does NOT crash."""
    import httpx
    agent = RemediationAgent()

    async def mock_post_timeout(self, url, json=None, **kwargs):
        raise httpx.TimeoutException("simulated timeout")

    with patch.object(httpx.AsyncClient, "post", mock_post_timeout):
        result = await agent.remediate({
            "root_cause": "Tax_ID missing", "fix_type": "SCHEMA_MISMATCH",
            "affected_field": "Tax_ID", "confidence": 0.9,
        })

    assert result["verified"] is False
    assert result["flagged"] is True
    assert result["mode"] == "timeout"


# ── Orchestrator: N/A ─────────────────────────────────────────────────

@pytest.mark.skip(
    reason="nvidia-nat was never integrated — EventBus built directly on "
    "asyncio.Queue since Day 3. No fallback applies since there is "
    "nothing to fall back FROM. Documented, not a gap."
)
def test_orchestrator_nat_to_asyncio():
    pass
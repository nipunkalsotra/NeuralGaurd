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
        with patch.object(sentinel_agent._get_local_embedder(), "encode", side_effect=Exception("model OOM")):
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


# Day 11 — the guide names these 4 exact malformed-JSON shapes as the
# mandatory blocker check ("Run every fallback path including Groq JSON
# repair... fix ALL failures before Day 12"). Each is tested against a
# distinct worker_id so the diagnosis cache (30 min TTL) can't mask a
# real repair failure behind a hit from an earlier test in this file.

def test_triage_groq_missing_closing_brace_is_repaired():
    """Malformed format 1/3: LLM output truncated before the closing
    brace (e.g. hit max_tokens mid-response). Real diagnosis must be
    recovered, not discarded for the generic heuristic fallback."""
    agent = TriageAgent()
    malformed = '{"root_cause": "Field Tax_ID not found", "fix_type": "SCHEMA_MISMATCH", "affected_field": "Tax_ID", "confidence": 0.91'
    event = {**LOOP_EVENT, "worker_id": "worker-11d", "error_hash": "missing_brace"}
    with patch.object(agent.nemotron_client, "chat", side_effect=Exception("down")):
        with patch.object(agent.groq_client, "chat", return_value=malformed):
            result = agent.diagnose(event, LOG_LINES)
    assert result["root_cause"] == "Field Tax_ID not found"
    assert result["fallback_origin"] == "groq"


def test_triage_groq_plain_text_falls_through_to_heuristic():
    """Malformed format 3/3: no JSON at all in the response — nothing to
    repair, must fall through to the rule-based heuristic without
    raising or crashing the Triage Agent."""
    agent = TriageAgent()
    malformed = (
        "The root cause is that Field Tax_ID is missing from the new "
        "invoice format. Confidence: 91%."
    )
    logs = ["Error: Field 'Tax_ID' not found in schema"]
    event = {**LOOP_EVENT, "worker_id": "worker-11e", "error_hash": "plain_text"}
    with patch.object(agent.nemotron_client, "chat", side_effect=Exception("down")):
        with patch.object(agent.groq_client, "chat", return_value=malformed):
            result = agent.diagnose(event, logs)
    assert result["fallback_origin"] == "rule_based_heuristic"
    assert result["fix_type"] == "SCHEMA_MISMATCH"


def test_triage_groq_nested_markdown_fence_is_repaired():
    """Malformed format 4/4 (extra case from the guide's worked examples):
    fenced block without a 'json' language tag."""
    agent = TriageAgent()
    malformed = 'Here is the analysis:\n\n```\n{\n "root_cause": "missing field"\n}\n```'
    event = {**LOOP_EVENT, "worker_id": "worker-11f", "error_hash": "nested_markdown"}
    with patch.object(agent.nemotron_client, "chat", side_effect=Exception("down")):
        with patch.object(agent.groq_client, "chat", return_value=malformed):
            result = agent.diagnose(event, LOG_LINES)
    assert result["root_cause"] == "missing field"
    assert result["fallback_origin"] == "groq"


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
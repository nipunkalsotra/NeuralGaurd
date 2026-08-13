"""
Triage Agent tests. diagnose() is fully built (Day 2) — tested here
with both Nemotron and Groq mocked.
"""

from unittest.mock import patch

import pytest

from sentinel.agents.triage_agent import TriageAgent


@pytest.fixture
def agent():
    return TriageAgent()


LOOP_EVENT = {"worker_id": "worker-3", "similarity": 0.95, "consecutive_count": 3}
LOG_LINES = ["Error: Tax_ID not found", "Retrying...", "Error: Tax_ID not found"]

VALID_JSON_RESPONSE = (
    '{"root_cause": "Tax_ID missing", "fix_type": "SCHEMA_MISMATCH", '
    '"affected_field": "Tax_ID", "confidence": 0.9}'
)


def test_diagnose_nemotron_success(agent):
    with patch.object(agent.nemotron_client, "chat", return_value=VALID_JSON_RESPONSE):
        result = agent.diagnose(LOOP_EVENT, LOG_LINES)

    assert result["root_cause"] == "Tax_ID missing"
    assert result["fix_type"] == "SCHEMA_MISMATCH"
    assert result["confidence"] == 0.9
    assert result["fallback_used"] is False


def test_diagnose_nemotron_fails_falls_back_to_groq(agent):
    with patch.object(agent.nemotron_client, "chat", side_effect=Exception("timeout")):
        with patch.object(agent.groq_client, "chat", return_value=VALID_JSON_RESPONSE):
            result = agent.diagnose(LOOP_EVENT, LOG_LINES)

    assert result["fallback_used"] is True
    assert result["fallback_origin"] == "groq"
    assert result["root_cause"] == "Tax_ID missing"


# backend/tests/test_triage.py
# Replace this test

def test_diagnose_both_fail_returns_unknown(agent):
    # Day 12: LOG_LINES ("Error: Tax_ID not found") used to be this test's
    # "doesn't match any pattern" case, but that was itself the exact bug
    # fixed on Day 12 — the SCHEMA_MISMATCH pattern required a literal
    # "field" prefix, so a perfectly ordinary "X not found" message went
    # unclassified. It's correctly caught now (see test_triage_agent's
    # heuristic pattern tests), so this test needs genuinely unmatchable
    # text to still exercise the "no pattern at all" fallback.
    unmatchable_logs = ["Worker produced output but no error was logged"]
    with patch.object(agent.nemotron_client, "chat", side_effect=Exception("down")):
        with patch.object(agent.groq_client, "chat", side_effect=Exception("down")):
            result = agent.diagnose(LOOP_EVENT, unmatchable_logs)

    assert result["confidence"] == 0.0
    assert result["fallback_used"] is True
    assert result["fallback_origin"] == "rule_based_heuristic"


def test_diagnose_groq_malformed_json_gets_repaired(agent):
    """Groq lacks native JSON mode — wrap response in markdown fences to test repair layer."""
    markdown_wrapped = f"Here is the diagnosis:\n```json\n{VALID_JSON_RESPONSE}\n```"
    with patch.object(agent.nemotron_client, "chat", side_effect=Exception("down")):
        with patch.object(agent.groq_client, "chat", return_value=markdown_wrapped):
            result = agent.diagnose(LOOP_EVENT, LOG_LINES)

    assert result["root_cause"] == "Tax_ID missing"
    assert result["fallback_used"] is True


def test_build_prompt_includes_worker_id_and_logs(agent):
    prompt = agent.build_prompt(LOOP_EVENT, LOG_LINES)
    assert "worker-3" in prompt
    assert "Tax_ID not found" in prompt
    assert "root_cause" in prompt


def test_build_prompt_truncates_to_last_50_lines(agent):
    long_logs = [f"log line {i}" for i in range(100)]
    prompt = agent.build_prompt(LOOP_EVENT, long_logs)
    assert "log line 50" in prompt
    assert "log line 0" not in prompt

# backend/tests/test_triage.py
# Add this test at the bottom, alongside the existing ones

def test_diagnose_cache_hit_skips_api_call(agent):
    """Second call with identical log_lines + error_signature should hit cache."""
    loop_event_with_hash = {**LOOP_EVENT, "error_hash": "same_error_hash"}
    with patch.object(
        agent.nemotron_client, "chat", return_value=VALID_JSON_RESPONSE
    ) as mock_nemotron:
        agent.diagnose(loop_event_with_hash, LOG_LINES)
        agent.diagnose(loop_event_with_hash, LOG_LINES)
    assert mock_nemotron.call_count == 1

# backend/tests/test_triage.py — add these

def test_diagnose_all_llms_fail_falls_back_to_heuristic(agent):
    """Nemotron + Groq both fail -> rule-based heuristic catches known pattern."""
    logs = ["Error: Field 'Tax_ID' not found in schema", "Retrying..."]
    with patch.object(agent.nemotron_client, "chat", side_effect=Exception("down")):
        with patch.object(agent.groq_client, "chat", side_effect=Exception("down")):
            result = agent.diagnose(LOOP_EVENT, logs)

    assert result["fallback_used"] is True
    assert result["fallback_origin"] == "rule_based_heuristic"
    assert result["fix_type"] == "SCHEMA_MISMATCH"
    assert "Tax_ID" in result["affected_field"]


def test_heuristic_catches_timeout_pattern(agent):
    logs = ["Request timed out after 30s"]
    with patch.object(agent.nemotron_client, "chat", side_effect=Exception("down")):
        with patch.object(agent.groq_client, "chat", side_effect=Exception("down")):
            result = agent.diagnose(LOOP_EVENT, logs)

    assert result["fix_type"] == "TIMEOUT"


def test_heuristic_no_match_returns_unknown_but_never_crashes(agent):
    """Completely unrecognized log pattern -> heuristic returns gracefully, no exception."""
    logs = ["Some completely novel error nobody has seen before xyz123"]
    with patch.object(agent.nemotron_client, "chat", side_effect=Exception("down")):
        with patch.object(agent.groq_client, "chat", side_effect=Exception("down")):
            result = agent.diagnose(LOOP_EVENT, logs)

    assert result["confidence"] == 0.0
    assert result["fallback_origin"] == "rule_based_heuristic"
    # Critically: this must NOT raise — it's the last resort, must always work
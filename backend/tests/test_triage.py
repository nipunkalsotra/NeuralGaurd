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


def test_diagnose_both_fail_returns_unknown(agent):
    with patch.object(agent.nemotron_client, "chat", side_effect=Exception("down")):
        with patch.object(agent.groq_client, "chat", side_effect=Exception("down")):
            result = agent.diagnose(LOOP_EVENT, LOG_LINES)

    assert result["root_cause"] == "unknown"
    assert result["confidence"] == 0.0
    assert result["fallback_origin"] == "none_available"


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
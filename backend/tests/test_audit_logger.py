"""
Audit logger tests — hash chain tamper detection.
Blocker check (Rashi's Day 3 spec): write 3 records, tamper line 2,
verify_chain() must fail.
"""

import json

from sentinel.audit.trustchain_logger import TrustChainLogger


def test_verify_chain_passes_on_untampered_log(tmp_path):
    log_file = tmp_path / "audit.jsonl"
    logger = TrustChainLogger(log_file=str(log_file))

    logger.log_transition(
        worker_id="worker-1", from_state="HEALTHY", to_state="LOOP_SUSPECTED",
        trigger_event="LOOP_SUSPECTED", agent_name="SentinelAgent",
    )
    logger.log_transition(
        worker_id="worker-1", from_state="LOOP_SUSPECTED", to_state="DIAGNOSING",
        trigger_event="DIAGNOSIS_STARTED", agent_name="Orchestrator",
    )
    logger.log_transition(
        worker_id="worker-1", from_state="DIAGNOSING", to_state="REMEDIATING",
        trigger_event="DIAGNOSIS_COMPLETE", agent_name="TriageAgent", confidence_score=0.9,
    )

    assert logger.verify_chain() is True


def test_verify_chain_fails_when_line_tampered(tmp_path):
    log_file = tmp_path / "audit.jsonl"
    logger = TrustChainLogger(log_file=str(log_file))

    logger.log_transition(
        worker_id="worker-1", from_state="HEALTHY", to_state="LOOP_SUSPECTED",
        trigger_event="LOOP_SUSPECTED", agent_name="SentinelAgent",
    )
    logger.log_transition(
        worker_id="worker-1", from_state="LOOP_SUSPECTED", to_state="DIAGNOSING",
        trigger_event="DIAGNOSIS_STARTED", agent_name="Orchestrator",
    )
    logger.log_transition(
        worker_id="worker-1", from_state="DIAGNOSING", to_state="REMEDIATING",
        trigger_event="DIAGNOSIS_COMPLETE", agent_name="TriageAgent", confidence_score=0.9,
    )

    # Tamper with line 2 — change to_state without recomputing the hash
    with open(log_file, "r") as f:
        lines = f.readlines()

    tampered_record = json.loads(lines[1])
    tampered_record["to_state"] = "ESCALATED"  # malicious/accidental edit
    lines[1] = json.dumps(tampered_record) + "\n"

    with open(log_file, "w") as f:
        f.writelines(lines)

    assert logger.verify_chain() is False


def test_current_hash_depends_on_previous_hash(tmp_path):
    """Confirms chaining actually links records, not independent hashes."""
    log_file = tmp_path / "audit.jsonl"
    logger = TrustChainLogger(log_file=str(log_file))

    r1 = logger.log_transition(
        worker_id="worker-1", from_state="HEALTHY", to_state="LOOP_SUSPECTED",
        trigger_event="LOOP_SUSPECTED", agent_name="SentinelAgent",
    )
    r2 = logger.log_transition(
        worker_id="worker-1", from_state="LOOP_SUSPECTED", to_state="DIAGNOSING",
        trigger_event="DIAGNOSIS_STARTED", agent_name="Orchestrator",
    )

    assert r2["previous_hash"] == r1["current_hash"]
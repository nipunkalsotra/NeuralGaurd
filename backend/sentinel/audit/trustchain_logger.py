# backend/sentinel/audit/trustchain_logger.py
"""
Immutable audit logger — append-only JSONL with hash chaining.
Per master doc Section 5.3: every state transition writes a
cryptographically linked record. Tampering any record breaks the chain.
"""

import hashlib
import json
import os
from datetime import datetime, timezone


class TrustChainLogger:
    def __init__(self, log_file: str = None):
        self.log_file = log_file or os.path.join(
            os.path.dirname(__file__), "..", "..", "audit_logs", "audit.jsonl"
        )
        os.makedirs(os.path.dirname(self.log_file), exist_ok=True)
        self.previous_hash = self._load_last_hash()

    def _load_last_hash(self) -> str:
        if not os.path.exists(self.log_file):
            return "0" * 64
        with open(self.log_file, "r") as f:
            lines = f.readlines()
            if not lines:
                return "0" * 64
            last_record = json.loads(lines[-1])
            return last_record["current_hash"]

    def log_transition(
        self,
        worker_id: str,
        from_state: str,
        to_state: str,
        trigger_event: str,
        agent_name: str,
        confidence_score: float = None,
        fallback_used: bool = False,
        fallback_origin: str = None,
    ) -> dict:
        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "worker_id": worker_id,
            "from_state": from_state,
            "to_state": to_state,
            "trigger_event": trigger_event,
            "agent_name": agent_name,
            "confidence_score": confidence_score,
            "fallback_used": fallback_used,
            "fallback_origin": fallback_origin,
            "previous_hash": self.previous_hash,
        }
        record_content = json.dumps(record, sort_keys=True)
        current_hash = hashlib.sha256(
            (self.previous_hash + record_content).encode()
        ).hexdigest()
        record["current_hash"] = current_hash

        with open(self.log_file, "a") as f:
            f.write(json.dumps(record) + "\n")

        self.previous_hash = current_hash
        return record

    def verify_chain(self) -> bool:
        if not os.path.exists(self.log_file):
            return True
        prev_hash = "0" * 64
        with open(self.log_file, "r") as f:
            for line in f:
                record = json.loads(line)
                expected_content = json.dumps(
                    {k: v for k, v in record.items() if k != "current_hash"},
                    sort_keys=True,
                )
                expected_hash = hashlib.sha256(
                    (prev_hash + expected_content).encode()
                ).hexdigest()
                if expected_hash != record["current_hash"]:
                    return False
                prev_hash = record["current_hash"]
        return True
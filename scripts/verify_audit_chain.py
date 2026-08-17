#!/usr/bin/env python3
"""
Hash Chain Verification Script — Day 14 (Nipun).

Her pre-demo checklist names this explicitly ("Hash chain verification
script passes") as something to run 30 minutes before the demo, but no
standalone script existed — TrustChainLogger.verify_chain() was only
ever called from inside the test suite. This is that script.

Usage:
    python scripts/verify_audit_chain.py
    python scripts/verify_audit_chain.py /path/to/audit.jsonl

Exit code 0 on a valid chain, 1 on a broken chain or missing file —
suitable for a pre-demo checklist / CI gate, not just a human reading
the printed output.
"""

import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from sentinel.audit.trustchain_logger import TrustChainLogger  # noqa: E402


def find_break(log_file: str):
    """Independent, from-scratch walk of the chain to report exactly
    where it breaks — verify_chain() itself only returns a bool, which
    is enough to gate a demo but not enough to debug one."""
    import hashlib

    prev_hash = "0" * 64
    with open(log_file, "r") as f:
        for line_num, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            record = json.loads(line)
            expected_content = json.dumps(
                {k: v for k, v in record.items() if k != "current_hash"},
                sort_keys=True,
            )
            expected_hash = hashlib.sha256(
                (prev_hash + expected_content).encode()
            ).hexdigest()
            if expected_hash != record["current_hash"]:
                return {
                    "line": line_num,
                    "worker_id": record.get("worker_id"),
                    "timestamp": record.get("timestamp"),
                    "to_state": record.get("to_state"),
                }
            prev_hash = record["current_hash"]
    return None


def main():
    log_file = sys.argv[1] if len(sys.argv) > 1 else None
    logger = TrustChainLogger(log_file=log_file)
    resolved_path = Path(logger.log_file)

    print(f"Audit log: {resolved_path}")

    if not resolved_path.exists():
        print("FAIL — audit log file does not exist yet.")
        print("(This is expected on a completely fresh checkout before any "
              "fault has ever been injected — not a broken chain, just no "
              "chain yet. Inject one fault via BREAK IT or POST /demo/inject "
              "and re-run.)")
        sys.exit(1)

    record_count = sum(1 for line in resolved_path.read_text().splitlines() if line.strip())
    valid = logger.verify_chain()

    if valid:
        print(f"PASS — {record_count} records, hash chain intact from genesis to head.")
        sys.exit(0)

    break_point = find_break(str(resolved_path))
    print(f"FAIL — chain breaks at line {break_point['line'] if break_point else '?'} "
          f"of {record_count} records.")
    if break_point:
        print(f"  worker_id: {break_point['worker_id']}")
        print(f"  to_state:  {break_point['to_state']}")
        print(f"  timestamp: {break_point['timestamp']}")
    sys.exit(1)


if __name__ == "__main__":
    main()

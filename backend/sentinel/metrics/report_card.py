# backend/sentinel/metrics/report_card.py
"""
Report Card Aggregation — Day 12 (Shreshtha).

Builds the ReportCardMetrics JSON
{time_to_detect, tokens_saved, throughput_maintained, fixes_applied,
escalations, fallbacks_triggered} entirely from real data: the
TrustChain audit log's actual transition records (per master doc
Section 5.3, hash-chained, so this is reading the same immutable trail
the dashboard's Audit Log Stream renders — not a separate, divergent
source of truth) plus TokenCounter/ThroughputTracker's live state.

time_to_detect: the guide defines this as "time between LOOP_SUSPECTED
event and DIAGNOSIS_COMPLETE event." DIAGNOSIS_COMPLETE itself is an
EventBus event, not a persisted audit record — the audit record that
actually carries a completed diagnosis is the transition INTO
REMEDIATING or ESCALATED (see orchestrator.py's on_diagnosis_complete),
so that's used as the real, persisted proxy for "diagnosis complete."
Computed per worker from its most recent LOOP_SUSPECTED record onward,
then the freshest such duration across all workers is reported (the
report card is shown right after the most recent healing cycle).
"""

import json
import os
from typing import Optional

from sentinel.metrics.token_counter import token_counter as _token_counter
from sentinel.metrics.throughput_tracker import ThroughputTracker


def _load_records(log_file: str) -> list:
    if not os.path.exists(log_file):
        return []
    records = []
    with open(log_file, "r") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def _latest_time_to_detect(records: list) -> Optional[float]:
    from datetime import datetime

    loop_suspected_at = {}  # worker_id -> timestamp string
    completed = []  # (worker_id, loop_ts, complete_ts)

    for r in records:
        if r["to_state"] == "LOOP_SUSPECTED":
            loop_suspected_at[r["worker_id"]] = r["timestamp"]
        elif r["to_state"] in ("REMEDIATING", "ESCALATED") and r["worker_id"] in loop_suspected_at:
            completed.append((r["worker_id"], loop_suspected_at.pop(r["worker_id"]), r["timestamp"]))

    if not completed:
        return None

    _, loop_ts, complete_ts = completed[-1]
    delta = datetime.fromisoformat(complete_ts) - datetime.fromisoformat(loop_ts)
    return round(delta.total_seconds(), 3)


def build_report_card(log_file: str, orchestrator=None) -> dict:
    records = _load_records(log_file)

    return {
        "time_to_detect": _latest_time_to_detect(records),
        "tokens_saved": _token_counter.total_saved(),
        "throughput_maintained": ThroughputTracker(orchestrator).current_pct(),
        "fixes_applied": sum(1 for r in records if r["to_state"] == "RESUMED"),
        "escalations": sum(1 for r in records if r["to_state"] == "ESCALATED"),
        "fallbacks_triggered": sum(1 for r in records if r.get("fallback_used")),
    }

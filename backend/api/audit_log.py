# backend/api/audit_log.py
"""
Audit Log Replay — GET /api/audit-log?limit=N

Fixes a real gap: the dashboard's audit trail was memory-only (populated
solely by live WebSocket pushes), so a page refresh lost the entire
history even though the backend was persisting every record to
audit_logs/audit.jsonl the whole time via TrustChainLogger. This just
reads that same file back — the exact records the hash chain already
covers, not a second/divergent source of truth.
"""

import json
import os

from fastapi import APIRouter, Query

from api.fault_injection import _orchestrator

router = APIRouter()


@router.get("/api/audit-log")
async def audit_log(limit: int = Query(default=200, ge=1, le=2000)):
    log_file = _orchestrator.audit_logger.log_file
    if not os.path.exists(log_file):
        return {"records": []}

    records = []
    with open(log_file, "r") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))

    return {"records": records[-limit:]}

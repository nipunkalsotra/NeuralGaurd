# backend/api/metrics.py
"""
Metrics API — Day 12 (Shreshtha).
GET /api/metrics/tokens, GET /api/metrics/throughput, GET /api/metrics
(the combined ReportCardMetrics Tushar's Post-Heal Report Card will wire
to on Day 13). Reads the same shared _orchestrator singleton
api/fault_injection.py already constructs, so this reports on the exact
same audit log / reroute plans the rest of the backend is producing —
not a second, disconnected metrics pipeline.
"""

from fastapi import APIRouter

from api.fault_injection import _orchestrator
from sentinel.metrics.token_counter import token_counter
from sentinel.metrics.throughput_tracker import ThroughputTracker
from sentinel.metrics.report_card import build_report_card

router = APIRouter()


@router.get("/api/metrics/tokens")
async def metrics_tokens():
    return {
        "usage": token_counter.all_usage(),
        "hourly_budget": token_counter.hourly_budget,
        "total_saved": token_counter.total_saved(),
    }


@router.get("/api/metrics/throughput")
async def metrics_throughput():
    return {"throughput_pct": ThroughputTracker(_orchestrator).current_pct()}


@router.get("/api/metrics")
async def metrics_combined():
    return build_report_card(_orchestrator.audit_logger.log_file, _orchestrator)

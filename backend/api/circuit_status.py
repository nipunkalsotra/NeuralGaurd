"""
circuit_status.py
Exposes per-service circuit breaker status to the dashboard.
Day 6 deliverable — {service, status, last_failure, failure_count} format.
"""

from fastapi import APIRouter

from sentinel.fallback.circuit_breaker import circuit_registry

router = APIRouter()


@router.get("/api/circuit-status")
async def circuit_status():
    return {"services": circuit_registry.all_statuses()}

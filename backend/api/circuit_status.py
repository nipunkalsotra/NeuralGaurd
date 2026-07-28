"""
REST endpoints exposing circuit breaker status to the dashboard's
Circuit Breaker Panel (grid of green=CLOSED / yellow=HALF_OPEN / red=OPEN
indicators per service).

Wire this router into api/main.py:
    from api.circuit_status import router as circuit_status_router
    app.include_router(circuit_status_router)
"""

from fastapi import APIRouter, HTTPException

from sentinel.fallback.circuit_breaker import circuit_breaker_manager

router = APIRouter()


@router.get("/v1/circuit-status")
async def circuit_status():
    """
    Returns status for every tracked service, e.g.:
    {
      "NIM":      {"service": "NIM", "status": "CLOSED", "last_failure": null, "failure_count": 0},
      "Nemotron": {"service": "Nemotron", "status": "OPEN", "last_failure": 1753..., "failure_count": 3},
      ...
    }
    """
    return circuit_breaker_manager.all_status()


@router.get("/v1/circuit-status/{service}")
async def circuit_status_one(service: str):
    if service not in circuit_breaker_manager.SERVICES:
        raise HTTPException(status_code=404, detail=f"Unknown service '{service}'")
    return circuit_breaker_manager.get(service).get_status()


@router.post("/v1/circuit-status/{service}/reset")
async def circuit_status_reset(service: str):
    """Manual reset — useful during Day 6 testing and later for an ops 'reset' button."""
    if service not in circuit_breaker_manager.SERVICES:
        raise HTTPException(status_code=404, detail=f"Unknown service '{service}'")
    circuit_breaker_manager.get(service).force_reset()
    return circuit_breaker_manager.get(service).get_status()
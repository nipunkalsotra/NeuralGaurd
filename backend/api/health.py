"""
health.py
Day 2 — Shreshtha (Person 3)

Simple health check endpoint so Nipun, Nipun, and Shreshtha can verify the
backend is alive before wiring anything else up to it.
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health_check():
    """
    Basic liveness check.
    curl http://localhost:8000/health  ->  {"status": "ok"}
    """
    return {"status": "ok"}
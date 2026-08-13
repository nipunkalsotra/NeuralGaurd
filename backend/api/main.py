# backend/api/main.py
"""
main.py
Backend FastAPI scaffold. Port 8000. This is YOUR port — no other
service (wrapper=8081, dashboard=3000) uses it.

Run locally:
    uvicorn api.main:app --reload --host 0.0.0.0 --port 8000

Run in prod / demo day (no reload):
    uvicorn api.main:app --host 0.0.0.0 --port 8000
"""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.health import router as health_router
from api.websocket import router as websocket_router
from api.fault_injection import router as fault_injection_router
from api.circuit_status import router as circuit_status_router
from api.stream_relay import router as stream_relay_router
from api.metrics import router as metrics_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sentinel.main")

app = FastAPI(
    title="AI Factory Sentinel — Backend",
    description="Self-healing agentic workflow orchestrator backend (Phase 1)",
    version="0.1.0",
)

# CORS — dashboard runs on port 3000 (Vite dev server). Allow it explicitly
# rather than wildcard, since we'll eventually need credentials/websockets
# to behave predictably across machines (Person 1 connects remotely too).
# NOTE: origins must NOT have a trailing slash — browsers send the Origin
# header without one, and allow_origins does exact string matching.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        # Person 1 (Nipun) connects to this backend remotely (ngrok / LAN).
        # Add that origin here once known, e.g. "https://xxxx.ngrok-free.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(websocket_router)
app.include_router(fault_injection_router)
app.include_router(circuit_status_router)
app.include_router(stream_relay_router)
app.include_router(metrics_router)


@app.on_event("startup")
async def on_startup() -> None:
    logger.info("AI Factory Sentinel backend starting on port 8000")


@app.on_event("shutdown")
async def on_shutdown() -> None:
    logger.info("AI Factory Sentinel backend shutting down")
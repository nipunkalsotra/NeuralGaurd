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
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.health import router as health_router
from api.websocket import router as websocket_router
from api.fault_injection import router as fault_injection_router
from api.circuit_status import router as circuit_status_router
from api.stream_relay import router as stream_relay_router
from api.metrics import router as metrics_router
from api.audit_log import router as audit_log_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sentinel.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Replaces the deprecated @app.on_event("startup"/"shutdown") hooks
    # (removed in current FastAPI) with the documented lifespan context
    # manager — same two log lines, non-deprecated mechanism.
    logger.info("AI Factory Sentinel backend starting on port 8000")
    yield
    logger.info("AI Factory Sentinel backend shutting down")


app = FastAPI(
    title="AI Factory Sentinel — Backend",
    description="Self-healing agentic workflow orchestrator backend (Phase 1)",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — origins come from CORS_ALLOWED_ORIGINS (comma-separated), so a
# deployed dashboard's real origin can be added without editing code.
# Previously hardcoded to localhost:3000/127.0.0.1:3000 only, which meant
# any deployed frontend's /api/metrics and /api/circuit-status calls (and
# the WebSocket handshake) failed CORS the moment the dashboard was
# hosted anywhere else. Defaults preserve the original localhost-only
# behavior for local dev when the env var is unset.
# NOTE: origins must NOT have a trailing slash — browsers send the Origin
# header without one, and allow_origins does exact string matching.
_default_origins = "http://localhost:3000,http://127.0.0.1:3000"
allowed_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", _default_origins).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
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
app.include_router(audit_log_router)

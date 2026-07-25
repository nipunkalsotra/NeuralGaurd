"""
main.py
Day 2 — Shreshtha (Person 3)

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


@app.on_event("startup")
async def on_startup() -> None:
    logger.info("AI Factory Sentinel backend starting on port 8000")


@app.on_event("shutdown")
async def on_shutdown() -> None:
    logger.info("AI Factory Sentinel backend shutting down")
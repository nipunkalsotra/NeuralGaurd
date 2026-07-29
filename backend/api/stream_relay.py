"""
stream_relay.py
Internal relay endpoint — wrapper container POSTs stream lines here,
backend broadcasts them over its own WebSocket connections.
Needed because wrapper (port 8081) and backend (port 8000) run in
separate Docker containers and cannot share in-memory objects.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from api.websocket import broadcast_sandbox_output, broadcast_mock_fallback_banner

router = APIRouter()


class StreamRelayRequest(BaseModel):
    worker_id: str
    stream_type: str  # "stdout" | "stderr"
    line: str


class MockBannerRelayRequest(BaseModel):
    worker_id: str
    reason: str = "nemoclaw_cli_failed"


@router.post("/internal/stream-relay")
async def stream_relay(payload: StreamRelayRequest):
    await broadcast_sandbox_output(payload.worker_id, payload.stream_type, payload.line)
    return {"ok": True}


@router.post("/internal/mock-banner-relay")
async def mock_banner_relay(payload: MockBannerRelayRequest):
    await broadcast_mock_fallback_banner(payload.worker_id, reason=payload.reason)
    return {"ok": True}

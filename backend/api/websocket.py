"""
websocket.py
Day 7 — Shreshtha (Person 3)

WebSocket hub for the dashboard at /ws/stream.

Envelope (LOCKED, see docs/websocket_schema.md):
    {
      "type": "stdout" | "stderr" | "mock_banner" | "state_change" | "audit_event",
      "event_type": "<sub-classification, see schema doc>",
      "worker_id": "worker-3" | "system",
      "payload": "<JSON-stringified or raw string, depending on type>",
      "timestamp": "ISO8601 UTC, millisecond precision"
    }

Day 7 scope: full support for broadcasting stdout/stderr/mock_banner
sandbox-stream messages to the dashboard, matching the locked envelope.
state_change / audit_event broadcasting hooks are included so
Orchestrator/audit code (Day 5+) can call the same broadcast function
once wired in — but are not exercised by today's manual tests.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger("sentinel.websocket")

router = APIRouter()

# Top-level `type` enum — see schema doc §2.
SANDBOX_STREAM_TYPES = ("stdout", "stderr", "mock_banner")

MOCK_FALLBACK_BANNER_MESSAGE = (
    "Sandbox auto-fallback active — demo continuing with simulated execution."
)


def _now_iso() -> str:
    now = datetime.now(timezone.utc)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


class ConnectionManager:
    """
    Tracks active dashboard WebSocket connections so we can broadcast
    events (including live sandbox CLI output) to all connected clients.
    """

    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info("Client connected. Total active: %d", len(self.active_connections))

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info("Client disconnected. Total active: %d", len(self.active_connections))

    async def broadcast(self, message: Dict[str, Any]) -> None:
        """Send a message to every connected dashboard client."""
        dead_connections = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                dead_connections.append(connection)
        for dead in dead_connections:
            self.disconnect(dead)


manager = ConnectionManager()


async def broadcast_envelope(
    msg_type: str,
    event_type: str,
    worker_id: str,
    payload: str,
) -> None:
    """
    Broadcast a message in the locked envelope shape to all connected
    dashboard clients. `payload` must already be a string — if the
    underlying content is structured, JSON-stringify it before calling
    this (per schema doc §1 / §4).
    """
    message = {
        "type": msg_type,
        "event_type": event_type,
        "worker_id": worker_id,
        "payload": payload,
        "timestamp": _now_iso(),
    }
    await manager.broadcast(message)
    logger.info("Broadcast %s/%s [%s]: %s", msg_type, event_type, worker_id, payload[:80])


async def broadcast_sandbox_output(worker_id: str, stream_type: str, line: str) -> None:
    """
    Broadcast one line of stdout/stderr from the NemoClaw CLI subprocess.
    stream_type must be "stdout" or "stderr".
    payload is raw text per schema §4 (NOT JSON-stringified).
    """
    if stream_type not in ("stdout", "stderr"):
        raise ValueError(f"invalid stream_type: {stream_type!r}")
    await broadcast_envelope(
        msg_type=stream_type,
        event_type="sandbox_output",
        worker_id=worker_id,
        payload=line,
    )


async def broadcast_mock_fallback_banner(
    worker_id: str,
    reason: str = "nemoclaw_cli_failed",
    event_type: str = "fallback_activated",
) -> None:
    """
    Broadcast the mock-mode fallback banner. Payload is JSON-stringified
    per schema §4: {"reason": ..., "message": ...}
    """
    payload = json.dumps({"reason": reason, "message": MOCK_FALLBACK_BANNER_MESSAGE})
    await broadcast_envelope(
        msg_type="mock_banner",
        event_type=event_type,
        worker_id=worker_id,
        payload=payload,
    )


async def broadcast_state_change(
    worker_id: str,
    from_state: str,
    to_state: str,
    trigger_event: str,
) -> None:
    """
    Broadcast an FSM state transition. event_type is the state being
    entered (to_state), per schema §3. Hook for Orchestrator, Day 5+.
    """
    payload = json.dumps(
        {"from_state": from_state, "to_state": to_state, "trigger_event": trigger_event}
    )
    await broadcast_envelope(
        msg_type="state_change",
        event_type=to_state,
        worker_id=worker_id,
        payload=payload,
    )


async def broadcast_audit_event(worker_id: str, audit_record: Dict[str, Any]) -> None:
    """
    Broadcast an immutable audit log record, mirroring the structure
    written to audit_logs (master doc §5.3). Hook for audit module, Day 8+.
    """
    payload = json.dumps(audit_record)
    await broadcast_envelope(
        msg_type="audit_event",
        event_type="transition_logged",
        worker_id=worker_id,
        payload=payload,
    )


async def route_message(websocket: WebSocket, message: Dict[str, Any]) -> None:
    """
    Type-based message router for messages the DASHBOARD sends TO us
    (inbound control-plane messages: ping/pong only, per schema §2).
    This is separate from broadcast_envelope, which is for
    server -> dashboard pushes.
    """
    msg_type = message.get("type")

    if msg_type == "ping":
        await websocket.send_json({"type": "pong"})
        return

    # --- Placeholder handlers for future inbound dashboard event types ---
    handlers = {
        "loop_suspected": _handle_not_implemented,
        "diagnosis_complete": _handle_not_implemented,
        "remediation_success": _handle_not_implemented,
        "optimization_complete": _handle_not_implemented,
        "escalated": _handle_not_implemented,
    }

    handler = handlers.get(msg_type, _handle_unknown)
    await handler(websocket, message)


async def _handle_not_implemented(websocket: WebSocket, message: Dict[str, Any]) -> None:
    logger.info(
        "Received type '%s' — handler not implemented yet (scheduled later this week).",
        message.get("type"),
    )


async def _handle_unknown(websocket: WebSocket, message: Dict[str, Any]) -> None:
    logger.warning("Unknown message type received: %s", message)
    await websocket.send_json(
        {"type": "error", "detail": f"unknown message type: {message.get('type')}"}
    )


@router.websocket("/ws/stream")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """
    Main WebSocket entrypoint for the dashboard.
    ws://localhost:8000/ws/stream
    """
    await manager.connect(websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "detail": "invalid JSON"})
                continue

            await route_message(websocket, message)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
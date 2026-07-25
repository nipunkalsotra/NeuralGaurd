"""
websocket.py
Day 2 — Shreshtha (Person 3)

WebSocket hub skeleton at /ws/stream.

Today's scope (per the Day 2 plan) is intentionally narrow:
  - accept connections
  - handle ping/pong keepalive
  - handle disconnects cleanly
  - a message router that dispatches by `type`, with empty handlers

The actual message SCHEMA (LOOP_SUSPECTED, DIAGNOSIS_COMPLETE, etc.) is
NOT defined today — that's Day 3-7 (Shreshtha defines it Day 3, locks it
with Tushar by Day 7). Don't invent payload shapes yet; just make sure
the plumbing works.
"""

import json
import logging
from typing import Dict, Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger("sentinel.websocket")

router = APIRouter()


class ConnectionManager:
    """
    Tracks active dashboard WebSocket connections so we can broadcast
    events to all connected clients later (Day 5+, when the Orchestrator
    starts publishing real events).
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


async def route_message(websocket: WebSocket, message: Dict[str, Any]) -> None:
    """
    Type-based message router skeleton.

    Real message types (LOOP_SUSPECTED, DIAGNOSIS_COMPLETE,
    REMEDIATION_SUCCESS, OPTIMIZATION_COMPLETE, ESCALATED, stdout/stderr
    stream frames, etc.) get wired in as the agents come online.
    Today, only the keepalive type is implemented.
    """
    msg_type = message.get("type")

    if msg_type == "ping":
        await websocket.send_json({"type": "pong"})
        return

    # --- Placeholder handlers, filled in as each event type is defined ---
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
    logger.info("Received type '%s' — handler not implemented yet (scheduled later this week).", message.get("type"))


async def _handle_unknown(websocket: WebSocket, message: Dict[str, Any]) -> None:
    logger.warning("Unknown message type received: %s", message)
    await websocket.send_json({"type": "error", "detail": f"unknown message type: {message.get('type')}"})


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
"""
WebSocket stream backend for AI Factory Sentinel (Day 6).

Exposes WebSocket endpoint  GET /v1/stream/{job_id}  that streams NemoClaw
CLI stdout/stderr, mock-mode banners, and orchestrator state-change events
in real time to the dashboard's Sandbox Terminal panel.

Message contract (one JSON object per WS frame):
    {
        "type": "stdout" | "stderr" | "mock_banner" | "state_change",
        "job_id": "<job_id>",
        "timestamp": <float>,
        "data": <string | dict>
    }
"""

import asyncio
import time
from typing import Dict, Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


class JobStreamHub:
    """
    Fan-out hub: each job_id has a set of subscriber queues. Producers
    (CLI subprocess readers, orchestrator transitions) publish into the
    hub; every connected WebSocket for that job_id receives a copy.
    """

    def __init__(self):
        self._subscribers: Dict[str, Set[asyncio.Queue]] = {}

    def _ensure_job(self, job_id: str) -> None:
        if job_id not in self._subscribers:
            self._subscribers[job_id] = set()

    async def publish(self, job_id: str, msg_type: str, data) -> None:
        self._ensure_job(job_id)
        message = {
            "type": msg_type,
            "job_id": job_id,
            "timestamp": time.time(),
            "data": data,
        }
        for q in list(self._subscribers[job_id]):
            await q.put(message)

    async def subscribe(self, job_id: str) -> asyncio.Queue:
        self._ensure_job(job_id)
        q: asyncio.Queue = asyncio.Queue()
        self._subscribers[job_id].add(q)
        return q

    def unsubscribe(self, job_id: str, q: asyncio.Queue) -> None:
        if job_id in self._subscribers:
            self._subscribers[job_id].discard(q)


job_stream_hub = JobStreamHub()


@router.websocket("/v1/stream/{job_id}")
async def stream_job(websocket: WebSocket, job_id: str):
    await websocket.accept()
    queue = await job_stream_hub.subscribe(job_id)

    await websocket.send_json({
        "type": "state_change",
        "job_id": job_id,
        "timestamp": time.time(),
        "data": {"stream_status": "connected"},
    })

    try:
        while True:
            get_msg = asyncio.create_task(queue.get())
            recv_msg = asyncio.create_task(websocket.receive_text())

            done, pending = await asyncio.wait(
                {get_msg, recv_msg}, return_when=asyncio.FIRST_COMPLETED
            )
            for task in pending:
                task.cancel()

            if get_msg in done:
                await websocket.send_json(get_msg.result())

            if recv_msg in done:
                # Client keepalive/ping — connection confirmed alive, ignore payload
                recv_msg.result()

    except WebSocketDisconnect:
        # Dashboard disconnected/refreshed — clean up quietly, never crash the server
        pass
    finally:
        job_stream_hub.unsubscribe(job_id, queue)


# --- Helpers for the wrapper adapter / CLI reader / orchestrator to push events ---

async def stream_stdout(job_id: str, line: str) -> None:
    await job_stream_hub.publish(job_id, "stdout", line)


async def stream_stderr(job_id: str, line: str) -> None:
    await job_stream_hub.publish(job_id, "stderr", line)


async def stream_mock_banner(job_id: str, reason: str) -> None:
    await job_stream_hub.publish(
        job_id,
        "mock_banner",
        {
            "message": "Sandbox auto-fallback active — demo continuing with simulated execution.",
            "reason": reason,
        },
    )


async def stream_state_change(job_id: str, from_state: str, to_state: str) -> None:
    await job_stream_hub.publish(
        job_id, "state_change", {"from_state": from_state, "to_state": to_state}
    )
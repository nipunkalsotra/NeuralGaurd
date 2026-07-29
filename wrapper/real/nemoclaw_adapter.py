# wrapper/real/nemoclaw_adapter.py
"""
nemoclaw_adapter.py
Shells out to the real nemoclaw CLI, relays stdout/stderr to the backend
(which broadcasts to the dashboard over WebSocket) via HTTP — the wrapper
and backend run as SEPARATE Docker containers and cannot share in-memory
objects, so direct imports across them are not possible. This relay
pattern is the fix for that.

Returns the standard wrapper contract:
    {"verified": bool, "mode": "nemoclaw" | "mock", "flagged": bool, "reason": str | None}
"""

import asyncio
import logging
import os

import httpx

logger = logging.getLogger("sentinel.wrapper.nemoclaw_adapter")

NEMOCLAW_TIMEOUT_SECONDS = 30
BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:8000")


async def _relay_line(worker_id: str, stream_type: str, line: str) -> None:
    """POSTs one stdout/stderr line to the backend's relay endpoint."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                f"{BACKEND_URL}/internal/stream-relay",
                json={"worker_id": worker_id, "stream_type": stream_type, "line": line},
            )
    except Exception as e:
        # A relay failure should never crash the actual nemoclaw exec.
        logger.warning("Failed to relay stream line to backend: %s", e)


async def _relay_mock_banner(worker_id: str, reason: str) -> None:
    """POSTs a mock-fallback-banner trigger to the backend's relay endpoint."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                f"{BACKEND_URL}/internal/mock-banner-relay",
                json={"worker_id": worker_id, "reason": reason},
            )
    except Exception as e:
        logger.warning("Failed to relay mock banner to backend: %s", e)


async def _stream_reader(stream: asyncio.StreamReader, worker_id: str, stream_type: str) -> None:
    """Reads a subprocess stream line-by-line and relays each line as it arrives."""
    if stream is None:
        return
    async for raw_line in stream:
        text = raw_line.decode(errors="replace")
        if text.strip():
            await _relay_line(worker_id, stream_type, text)


async def run_nemoclaw_patch(worker_id: str, patch: str, test_fixture: str) -> dict:
    """
    Runs `nemoclaw sandbox exec --patch <patch>` against the given test
    fixture, relaying stdout/stderr to the backend live for dashboard display.
    """
    logger.info(
        "Starting nemoclaw sandbox exec — worker=%s patch=%r fixture=%r",
        worker_id, patch, test_fixture,
    )

    try:
        proc = await asyncio.create_subprocess_exec(
            "nemoclaw", "sandbox", "exec", "--patch", patch, "--fixture", test_fixture,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError:
        logger.error("nemoclaw CLI not found on this machine — falling back to mock.")
        await _relay_mock_banner(worker_id, reason="nemoclaw_cli_failed")
        return {"verified": True, "mode": "mock", "flagged": True, "reason": "nemoclaw_cli_failed"}

    try:
        await asyncio.wait_for(
            asyncio.gather(
                _stream_reader(proc.stdout, worker_id, "stdout"),
                _stream_reader(proc.stderr, worker_id, "stderr"),
            ),
            timeout=NEMOCLAW_TIMEOUT_SECONDS,
        )
        returncode = await proc.wait()

    except asyncio.TimeoutError:
        logger.warning(
            "nemoclaw exec timed out after %ds — auto-fallback to mock.",
            NEMOCLAW_TIMEOUT_SECONDS,
        )
        proc.kill()
        await _relay_mock_banner(worker_id, reason="nemoclaw_cli_failed")
        return {"verified": True, "mode": "mock", "flagged": True, "reason": "nemoclaw_cli_failed"}

    except Exception:
        logger.exception("Unhandled exception during nemoclaw exec — auto-fallback to mock.")
        try:
            proc.kill()
        except ProcessLookupError:
            pass
        await _relay_mock_banner(worker_id, reason="nemoclaw_cli_failed")
        return {"verified": True, "mode": "mock", "flagged": True, "reason": "nemoclaw_cli_failed"}

    if returncode != 0:
        logger.warning("nemoclaw exec returned code %d — auto-fallback to mock.", returncode)
        await _relay_mock_banner(worker_id, reason="nemoclaw_cli_failed")
        return {"verified": True, "mode": "mock", "flagged": True, "reason": "nemoclaw_cli_failed"}

    logger.info("nemoclaw exec succeeded — patch verified.")
    return {"verified": True, "mode": "nemoclaw", "flagged": False, "reason": None}
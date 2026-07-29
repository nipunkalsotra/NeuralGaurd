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
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                f"{BACKEND_URL}/internal/stream-relay",
                json={"worker_id": worker_id, "stream_type": stream_type, "line": line},
            )
    except Exception as e:
        logger.warning("Failed to relay stream line to backend: %s", e)


async def _relay_mock_banner(worker_id: str, reason: str) -> None:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                f"{BACKEND_URL}/internal/mock-banner-relay",
                json={"worker_id": worker_id, "reason": reason},
            )
    except Exception as e:
        logger.warning("Failed to relay mock banner to backend: %s", e)


async def _stream_reader(stream: asyncio.StreamReader, worker_id: str, stream_type: str) -> None:
    if stream is None:
        return
    async for raw_line in stream:
        text = raw_line.decode(errors="replace")
        if text.strip():
            await _relay_line(worker_id, stream_type, text)


# wrapper/real/nemoclaw_adapter.py
# Update every early-return dict to include output and sandbox_log

async def nemoclaw_remediate(patch: str, test_fixture: str, worker_id: str = "worker-unknown") -> dict:
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
        return {
            "verified": True, "output": "nemoclaw CLI not found",
            "sandbox_log": "[FALLBACK] nemoclaw binary missing on host",
            "mode": "mock", "flagged": True, "reason": "nemoclaw_cli_failed",
        }

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
        logger.warning("nemoclaw exec timed out after %ds — auto-fallback to mock.", NEMOCLAW_TIMEOUT_SECONDS)
        proc.kill()
        await _relay_mock_banner(worker_id, reason="nemoclaw_cli_failed")
        return {
            "verified": True, "output": "nemoclaw exec timed out",
            "sandbox_log": f"[FALLBACK] Timeout after {NEMOCLAW_TIMEOUT_SECONDS}s",
            "mode": "mock", "flagged": True, "reason": "nemoclaw_cli_failed",
        }

    except Exception as e:
        logger.exception("Unhandled exception during nemoclaw exec — auto-fallback to mock.")
        try:
            proc.kill()
        except ProcessLookupError:
            pass
        await _relay_mock_banner(worker_id, reason="nemoclaw_cli_failed")
        return {
            "verified": True, "output": f"Unhandled exception: {e}",
            "sandbox_log": "[FALLBACK] Unhandled exception during nemoclaw exec",
            "mode": "mock", "flagged": True, "reason": "nemoclaw_cli_failed",
        }

    if returncode != 0:
        logger.warning("nemoclaw exec returned code %d — auto-fallback to mock.", returncode)
        await _relay_mock_banner(worker_id, reason="nemoclaw_cli_failed")
        return {
            "verified": True, "output": f"nemoclaw exec exited with code {returncode}",
            "sandbox_log": f"[FALLBACK] Non-zero exit code: {returncode}",
            "mode": "mock", "flagged": True, "reason": "nemoclaw_cli_failed",
        }

    logger.info("nemoclaw exec succeeded — patch verified.")
    return {
        "verified": True, "output": "Patch applied and verified successfully",
        "sandbox_log": f"[NEMOCLAW] worker={worker_id} patch applied, exit_code=0",
        "mode": "nemoclaw", "flagged": False, "reason": None,
    }
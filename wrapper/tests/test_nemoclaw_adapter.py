# wrapper/tests/test_nemoclaw_adapter.py
"""
Day 9 — Integration Day (Shreshtha). Blueprint Phase 3 requires switching
ALL services to PRIMARY mode (NEMOCLAW_MODE=nemoclaw) on Shreshtha's
machine and proving the auto-fallback blocker check: "Kill NemoClaw
mid-request, verify mock takes over in <5 seconds."

This machine has no real `nemoclaw` binary installed, so PRIMARY mode here
means exercising the real code path (real.nemoclaw_adapter) against that
genuine condition, plus a simulated "process killed mid-request" scenario
using a real, killable OS subprocess standing in for the nemoclaw CLI.

Real subprocesses are used (not mocked coroutines) so the kill actually
propagates through asyncio's subprocess machinery exactly as it would for
a real nemoclaw process being killed mid-exec.
"""

import asyncio
import time

import pytest

from real import nemoclaw_adapter
import wrapper_service


async def _noop_relay(*args, **kwargs):
    """Backend isn't running during these tests — the real relay calls
    already swallow their own exceptions, but the DNS lookup for the
    Docker Compose hostname 'backend' can be slow outside that network.
    No-op them so timing assertions measure fallback logic, not DNS."""
    return None


@pytest.fixture(autouse=True)
def patch_relays(monkeypatch):
    monkeypatch.setattr(nemoclaw_adapter, "_relay_line", _noop_relay)
    monkeypatch.setattr(nemoclaw_adapter, "_relay_mock_banner", _noop_relay)


# ── PRIMARY mode, nemoclaw binary genuinely absent on this machine ──────

@pytest.mark.asyncio
async def test_nemoclaw_binary_missing_falls_back_to_mock():
    """Real condition on this dev machine: NEMOCLAW_MODE=nemoclaw but the
    `nemoclaw` binary isn't installed. Confirms the FileNotFoundError path
    returns the standard wrapper contract instead of crashing."""
    result = await nemoclaw_adapter.nemoclaw_remediate("test-patch", "fixture.json")

    assert result["mode"] == "mock"
    assert result["flagged"] is True
    assert result["verified"] is True
    assert result["reason"] == "nemoclaw_cli_failed"
    assert "output" in result and "sandbox_log" in result


# ── Day 9 BLOCKER: kill mid-request, fallback in <5s ─────────────────────

@pytest.mark.asyncio
async def test_nemoclaw_killed_mid_request_falls_back_to_mock_under_5s(monkeypatch):
    """Stands a real, long-running OS process in for `nemoclaw`, then kills
    it 0.3s in — exactly the 'kill NemoClaw mid-request' scenario from the
    Day 9 blocker check. Must fall back to mock in well under 5 seconds
    (NEMOCLAW_TIMEOUT_SECONDS is 30s, so passing here proves the fallback
    reacts to the process dying, not to a timeout)."""
    real_create_subprocess_exec = asyncio.create_subprocess_exec

    async def stand_in_then_kill(*args, **kwargs):
        proc = await real_create_subprocess_exec(
            "python3", "-c", "import time; time.sleep(30)",
            stdout=kwargs.get("stdout"),
            stderr=kwargs.get("stderr"),
        )

        async def _kill_soon():
            await asyncio.sleep(0.3)
            proc.kill()

        asyncio.create_task(_kill_soon())
        return proc

    monkeypatch.setattr(asyncio, "create_subprocess_exec", stand_in_then_kill)

    start = time.monotonic()
    result = await nemoclaw_adapter.nemoclaw_remediate(
        "test-patch", "fixture.json", worker_id="worker-9"
    )
    elapsed = time.monotonic() - start

    assert elapsed < 5.0, f"auto-fallback took {elapsed:.2f}s, must be <5s"
    assert result["mode"] == "mock"
    assert result["flagged"] is True
    assert result["verified"] is True
    assert result["reason"] == "nemoclaw_cli_failed"


@pytest.mark.asyncio
async def test_nemoclaw_non_zero_exit_is_a_real_patch_failure_not_a_fallback(monkeypatch):
    """Process exits on its own with a plain non-zero code (no kill, not
    137) — a real patch failure inside a healthy sandbox. Must return
    verified=False directly, NOT silently swap in a mock success. This is
    the behavior docs/nemoclaw_cli.md's Day 5 table always recommended;
    Day 9 fixes the code to actually match it."""
    real_create_subprocess_exec = asyncio.create_subprocess_exec

    async def stand_in_exit_1(*args, **kwargs):
        return await real_create_subprocess_exec(
            "python3", "-c", "import sys; sys.exit(1)",
            stdout=kwargs.get("stdout"),
            stderr=kwargs.get("stderr"),
        )

    monkeypatch.setattr(asyncio, "create_subprocess_exec", stand_in_exit_1)

    result = await nemoclaw_adapter.nemoclaw_remediate("test-patch", "fixture.json")

    assert result["verified"] is False
    assert result["flagged"] is False
    assert result["mode"] == "nemoclaw"
    assert result["reason"] is None


@pytest.mark.asyncio
async def test_nemoclaw_oom_exit_code_137_falls_back_to_mock(monkeypatch):
    """Exit code 137 is Docker's OOM-kill signature (128+SIGKILL) — an
    infrastructure failure, not a patch failure. Must fall back to mock,
    unlike a plain non-zero exit."""
    real_create_subprocess_exec = asyncio.create_subprocess_exec

    async def stand_in_exit_137(*args, **kwargs):
        return await real_create_subprocess_exec(
            "python3", "-c", "import sys; sys.exit(137)",
            stdout=kwargs.get("stdout"),
            stderr=kwargs.get("stderr"),
        )

    monkeypatch.setattr(asyncio, "create_subprocess_exec", stand_in_exit_137)

    result = await nemoclaw_adapter.nemoclaw_remediate("test-patch", "fixture.json")

    assert result["mode"] == "mock"
    assert result["flagged"] is True
    assert result["verified"] is True


# ── Wrapper HTTP contract in PRIMARY mode (end-to-end through FastAPI) ───

@pytest.fixture
def primary_mode_client(monkeypatch):
    from fastapi.testclient import TestClient

    monkeypatch.setattr(wrapper_service, "NEMOCLAW_MODE", "nemoclaw")
    return TestClient(wrapper_service.app)


def test_wrapper_status_reports_primary_mode(primary_mode_client):
    response = primary_mode_client.get("/v1/status")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "mode": "nemoclaw"}


def test_wrapper_remediate_primary_mode_falls_back_to_mock_via_http(primary_mode_client):
    """Full HTTP round-trip through the wrapper service in PRIMARY mode on
    a machine without a real nemoclaw binary — the exact condition Day 9's
    'switch ALL services to primary mode' blocker check runs into here.
    The RemediationAgent-facing contract must stay intact regardless."""
    response = primary_mode_client.post(
        "/v1/remediate",
        json={"patch": "test-patch", "test_fixture": "fixture.json", "worker_id": "worker-9"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "mock"
    assert body["flagged"] is True
    assert body["verified"] is True
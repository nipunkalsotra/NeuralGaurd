# backend/tests/conftest.py
"""
Day 9 — shared fixtures.

`api.fault_injection` now wires the REAL Orchestrator/EventBus/
OptimizationAgent (closing the fault-injection-to-Orchestrator gap — see
docs/api_contracts.md's Day 9 notes). Both Sentinel's NIM embedding calls
and Triage's Nemotron/Groq calls are already fully unit-tested in isolation
(Day 2 and Day 8, respectively). Without the two autouse fixtures below,
every test that hits POST /demo/inject would make real, slow,
network-dependent calls to NIM/Nemotron/Groq (observed ~20s for a test
file that should run in under a second, and separately a flaky Day-9
integration test failing its <5s assertion on ~12s of real NIM latency,
since no real API keys are set in this environment) just to re-prove logic
already covered elsewhere. Autouse so no test accidentally depends on live
third-party network access.
"""

import os
import socket
import subprocess
import sys
import time
from pathlib import Path
from unittest.mock import MagicMock

import httpx
import pytest

from api import fault_injection

WRAPPER_DIR = Path(__file__).resolve().parents[2] / "wrapper"


@pytest.fixture(autouse=True)
def deterministic_sentinel_embeddings_for_fault_injection(monkeypatch):
    """Same problem as the Triage fixture below, different agent: the
    shared `_sentinel` singleton's NIM client has no valid key in this
    environment, so every /demo/inject call was making a REAL network
    round-trip to integrate.api.nvidia.com before falling back to local
    sentence-transformers. That round-trip's latency is genuinely variable
    (observed anywhere from ~1s to 12s+ across runs), which made the Day-9
    integration tests' <5s timing assertions flaky — not a production bug,
    a test-isolation gap. Force the NIM call to fail instantly so the
    fallback to sentence-transformers (fast, local, already-loaded model)
    is what actually runs, matching what Day 2's fallback-chain tests
    already cover in isolation."""
    def _instant_failure(_text):
        raise RuntimeError("NIM disabled in tests — forced instant fallback")

    monkeypatch.setattr(fault_injection._sentinel.nim_client, "embed", _instant_failure)


@pytest.fixture(autouse=True)
def deterministic_triage_for_fault_injection():
    """Swaps the real TriageAgent's network calls for a fixed diagnosis on
    the shared fault_injection Orchestrator singleton, then restores it —
    keeps integration tests fast and offline-safe without changing
    production wiring (api.main still builds the real TriageAgent)."""
    real_triage_agent = fault_injection._orchestrator.triage_agent

    mock_triage = MagicMock()
    mock_triage.diagnose.return_value = {
        "root_cause": "Tax_ID missing",
        "fix_type": "SCHEMA_MISMATCH",
        "affected_field": "Tax_ID",
        "confidence": 0.9,
        "fallback_used": False,
        "fallback_origin": None,
    }
    fault_injection._orchestrator.triage_agent = mock_triage

    yield mock_triage

    fault_injection._orchestrator.triage_agent = real_triage_agent


@pytest.fixture(scope="module")
def live_wrapper_primary_mode():
    """Boots the REAL wrapper_service.py (Shreshtha's owned code) as a
    live subprocess in PRIMARY mode (NEMOCLAW_MODE=nemoclaw). This machine
    has no real `nemoclaw` binary, so PRIMARY mode here genuinely exercises
    the auto-fallback path end-to-end -- the actual point of Day 9's
    integration test, not a simulation of one. Used by Nipun's and Nipun's
    Day 9 tests, which each drive their own owned layer (Orchestrator /
    fault injection) against this one real, shared wrapper process.

    Port is picked dynamically rather than hardcoded — this fixture is
    module-scoped, so test_day9_nipun_integration.py and
    test_day9_rashi_integration.py each get their OWN subprocess instance.
    A fixed port risked a bind race between one module's teardown and the
    next module's setup if teardown didn't fully release the port in time."""
    wrapper_python = WRAPPER_DIR / ".venv" / "bin" / "python"
    python_bin = str(wrapper_python) if wrapper_python.exists() else sys.executable

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]

    env = os.environ.copy()
    env["NEMOCLAW_MODE"] = "nemoclaw"
    proc = subprocess.Popen(
        [python_bin, "-m", "uvicorn", "wrapper_service:app",
         "--host", "127.0.0.1", "--port", str(port)],
        cwd=str(WRAPPER_DIR), env=env,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    base_url = f"http://127.0.0.1:{port}"
    try:
        for _ in range(50):
            if proc.poll() is not None:
                pytest.fail(
                    f"wrapper subprocess exited early with code {proc.returncode}: "
                    f"{proc.stderr.read().decode(errors='replace')}"
                )
            try:
                r = httpx.get(f"{base_url}/v1/status", timeout=0.5)
                if r.status_code == 200:
                    break
            except httpx.HTTPError:
                pass
            time.sleep(0.2)
        else:
            proc.terminate()
            pytest.skip("live wrapper subprocess did not come up in time")

        yield base_url
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()

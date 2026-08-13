# backend/tests/test_remediation.py
"""
Remediation Agent tests. Wrapper HTTP calls are mocked via httpx's
MockTransport — tests confirm agent behavior, not wrapper behavior
(wrapper itself is tested separately, already verified working).
"""

import pytest
import httpx

from sentinel.agents.remediation_agent import RemediationAgent


DIAGNOSIS = {
    "root_cause": "Tax_ID missing",
    "fix_type": "SCHEMA_MISMATCH",
    "affected_field": "Tax_ID",
    "confidence": 0.9,
}


def make_mock_transport(response_json: dict, status_code: int = 200):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code, json=response_json)
    return httpx.MockTransport(handler)


@pytest.mark.asyncio
async def test_generate_patch_schema_mismatch():
    agent = RemediationAgent()
    patch = agent.generate_patch("SCHEMA_MISMATCH", "Tax_ID")
    assert "Tax_ID" in patch
    assert "optional" in patch.lower()


@pytest.mark.asyncio
async def test_generate_patch_type_error():
    agent = RemediationAgent()
    patch = agent.generate_patch("TYPE_ERROR", "amount")
    assert "amount" in patch
    assert "coercion" in patch.lower()


@pytest.mark.asyncio
async def test_generate_patch_unknown_fix_type_falls_back_generic():
    agent = RemediationAgent()
    patch = agent.generate_patch("SOME_NEW_TYPE", "field_x")
    assert "field_x" in patch


@pytest.mark.asyncio
async def test_remediate_success(monkeypatch):
    agent = RemediationAgent()

    mock_response = {
        "verified": True,
        "output": "Patch applied successfully",
        "sandbox_log": "[MOCK] ...",
        "mode": "mock",
        "flagged": False,
    }

    async def mock_post(self, url, json=None, **kwargs):
        request = httpx.Request("POST", url)
        return httpx.Response(200, json=mock_response, request=request)

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    result = await agent.remediate(DIAGNOSIS)

    assert result["verified"] is True
    assert result["mode"] == "mock"


@pytest.mark.asyncio
async def test_remediate_timeout_handled_gracefully(monkeypatch):
    agent = RemediationAgent()

    async def mock_post_timeout(self, url, json=None, **kwargs):
        raise httpx.TimeoutException("simulated timeout")

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post_timeout)

    result = await agent.remediate(DIAGNOSIS)

    assert result["verified"] is False
    assert result["flagged"] is True
    assert result["mode"] == "timeout"


@pytest.mark.asyncio
async def test_remediate_circuit_breaker_opens_after_failures(monkeypatch):
    agent = RemediationAgent()

    async def mock_post_fail(self, url, json=None, **kwargs):
        raise httpx.ConnectError("simulated connection failure")

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post_fail)

    # 3 failures should open the circuit
    for _ in range(3):
        await agent.remediate(DIAGNOSIS)

    assert agent.circuit_breaker.is_closed() is False

    # 4th call should skip the HTTP call entirely (circuit open)
    result = await agent.remediate(DIAGNOSIS)
    assert result["mode"] == "unavailable"


@pytest.mark.asyncio
async def test_wrapper_timeout_is_configurable(monkeypatch):
    """Day 13: made the hardcoded 30s wrapper timeout a constructor
    param so the real stress test could exercise genuine (not mocked)
    timeouts against the real wrapper under load, without needing a
    30s wait per request to observe one."""
    captured_timeouts = []

    class FakeAsyncClient:
        """Day 13: RemediationAgent now holds one persistent client
        (created once in __init__) rather than opening/closing a new one
        per remediate() call — no context-manager protocol needed here
        since it's called directly, not via `async with`."""

        def __init__(self, timeout):
            captured_timeouts.append(timeout)

        async def post(self, url, json=None, **kwargs):
            raise httpx.TimeoutException("simulated")

    monkeypatch.setattr(httpx, "AsyncClient", FakeAsyncClient)

    agent = RemediationAgent(wrapper_timeout=2.5)
    result = await agent.remediate(DIAGNOSIS)

    assert captured_timeouts == [2.5]
    assert result["mode"] == "timeout"
    assert "2.5" in result["output"]


@pytest.mark.asyncio
async def test_agent_code_identical_for_mock_and_real_mode(monkeypatch):
    """
    Confirms agent doesn't branch on wrapper mode — same call, same code
    path, regardless of what mode string comes back in the response.
    """
    agent = RemediationAgent()

    for mode in ["mock", "nemoclaw"]:
        mock_response = {
            "verified": True, "output": "ok", "sandbox_log": "",
            "mode": mode, "flagged": False,
        }

        async def mock_post(self, url, json=None, **kwargs):
            request = httpx.Request("POST", url)
            return httpx.Response(200, json=mock_response, request=request)

        monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)
        result = await agent.remediate(DIAGNOSIS)
        assert result["mode"] == mode  # agent just passes through whatever wrapper says
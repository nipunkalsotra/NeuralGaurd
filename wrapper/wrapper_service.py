# wrapper/wrapper_service.py
"""
NemoClaw Wrapper — thin FastAPI app that mode-switches between mock and real.
"""

import os

from fastapi import FastAPI
from pydantic import BaseModel

from mock.mock_wrapper import mock_remediate
from real.nemoclaw_adapter import nemoclaw_remediate

app = FastAPI()

NEMOCLAW_MODE = os.getenv("NEMOCLAW_MODE", "mock")


class RemediateRequest(BaseModel):
    patch: str
    test_fixture: str


class RemediateResponse(BaseModel):
    verified: bool
    output: str
    sandbox_log: str
    mode: str
    flagged: bool


@app.get("/v1/status")
def status():
    return {"status": "ok", "mode": NEMOCLAW_MODE}


@app.post("/v1/remediate", response_model=RemediateResponse)
async def remediate(request: RemediateRequest):
    if NEMOCLAW_MODE == "nemoclaw":
        try:
            result = await nemoclaw_remediate(request.patch, request.test_fixture)
            return RemediateResponse(**result)
        except Exception as e:
            # Auto-fallback: nemoclaw failed, switch to mock for this request
            result = await mock_remediate(
                request.patch, request.test_fixture,
                flagged=True, reason="nemoclaw_cli_failed"
            )
            return RemediateResponse(**result)

    # mock mode (default)
    result = await mock_remediate(request.patch, request.test_fixture)
    return RemediateResponse(**result)
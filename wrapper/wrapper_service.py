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
    worker_id: str = "worker-unknown"


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
            result = await nemoclaw_remediate(
                request.patch, request.test_fixture, worker_id=request.worker_id
            )
            return RemediateResponse(**result)
        except Exception as e:
            print(f"[wrapper] nemoclaw_remediate failed: {e}")
            result = await mock_remediate(
                request.patch, request.test_fixture,
                flagged=True, reason=f"nemoclaw_cli_failed: {e}"
            )
            return RemediateResponse(**result)

    result = await mock_remediate(request.patch, request.test_fixture)
    return RemediateResponse(**result)

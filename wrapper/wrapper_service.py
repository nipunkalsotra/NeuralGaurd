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


# wrapper/wrapper_service.py
# Update the /v1/remediate endpoint's nemoclaw branch

@app.post("/v1/remediate", response_model=RemediateResponse)
async def remediate(request: RemediateRequest):
    if NEMOCLAW_MODE == "nemoclaw":
        try:
            result = await nemoclaw_remediate(request.patch, request.test_fixture)
            return RemediateResponse(**result)
        except Exception as e:
            # Day 5: log and fall through to mock for now.
            # Day 8: full auto-fallback logic with specific reason codes lands here.
            print(f"[wrapper] nemoclaw_remediate failed: {e}")
            result = await mock_remediate(
                request.patch, request.test_fixture,
                flagged=True, reason=f"nemoclaw_cli_failed: {e}"
            )
            return RemediateResponse(**result)

    result = await mock_remediate(request.patch, request.test_fixture)
    return RemediateResponse(**result)

    # mock mode (default)
    result = await mock_remediate(request.patch, request.test_fixture)
    return RemediateResponse(**result)
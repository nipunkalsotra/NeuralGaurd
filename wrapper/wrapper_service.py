from fastapi import FastAPI
app = FastAPI()

@app.get("/v1/status")
def status():
    return {"status": "ok", "mode": "mock"}# wrapper/wrapper_service.py
"""
NemoClaw Mock Wrapper — Day 1
Simulates the real NemoClaw CLI adapter (Shreshtha builds the real one, Days 8-9).
Same HTTP contract as the real wrapper, so RemediationAgent code is identical either way.
"""

import asyncio
from datetime import datetime, timezone

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()


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
    return {"status": "ok", "mode": "mock"}


@app.post("/v1/remediate", response_model=RemediateResponse)
async def remediate(request: RemediateRequest):
    # Simulate sandbox execution time (real NemoClaw exec is not instant either)
    await asyncio.sleep(2)

    timestamp = datetime.now(timezone.utc).isoformat()

    # sandbox_log styled after real nemoclaw CLI output patterns
    # (banner line + exec output, per Shreshtha's nemoclaw_cli.md)
    sandbox_log = (
        f"[MOCK] ✓ Active gateway set to 'nemoclaw'\n"
        f"[MOCK] Sandbox: ai-factory-sentinel-mock\n"
        f"[MOCK] Applying patch: {request.patch}\n"
        f"[MOCK] Running test_fixture: {request.test_fixture}\n"
        f"[MOCK] Patch verification: PASS\n"
        f"[MOCK] Timestamp: {timestamp}"
    )

    return RemediateResponse(
        verified=True,
        output=f"Patch '{request.patch}' applied and verified successfully (mock mode).",
        sandbox_log=sandbox_log,
        mode="mock",
        flagged=False,
    )
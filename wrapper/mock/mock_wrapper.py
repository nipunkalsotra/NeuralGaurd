# wrapper/mock/mock_wrapper.py
"""
Mock NemoClaw wrapper — simulates the real CLI adapter's HTTP contract.
"""

import asyncio
from datetime import datetime, timezone


async def mock_remediate(patch: str, test_fixture: str, flagged: bool = False, reason: str = None) -> dict:
    await asyncio.sleep(2)  # simulate sandbox execution time

    timestamp = datetime.now(timezone.utc).isoformat()
    sandbox_log = (
        f"[MOCK] ✓ Active gateway set to 'nemoclaw'\n"
        f"[MOCK] Sandbox: ai-factory-sentinel-mock\n"
        f"[MOCK] Applying patch: {patch}\n"
        f"[MOCK] Running test_fixture: {test_fixture}\n"
        f"[MOCK] Patch verification: PASS\n"
        f"[MOCK] Timestamp: {timestamp}"
    )
    if flagged:
        sandbox_log += f"\n[MOCK] Flagged reason: {reason}"

    return {
        "verified": True,
        "output": f"Patch '{patch}' applied and verified successfully (mock mode).",
        "sandbox_log": sandbox_log,
        "mode": "mock",
        "flagged": flagged,
    }
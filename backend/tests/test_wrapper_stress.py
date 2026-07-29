# backend/tests/test_wrapper_stress.py
"""
Day 8 — Mock wrapper stress test. Confirms it handles concurrent
requests without crashing.
"""

import asyncio
import time

import httpx
import pytest


WRAPPER_URL = "http://localhost:8081"
CONCURRENT_REQUESTS = 20


@pytest.mark.asyncio
async def test_mock_wrapper_handles_concurrent_load():
    """
    Requires the wrapper to be running locally in mock mode:
        cd wrapper && uvicorn wrapper_service:app --port 8081
    Skipped automatically if wrapper isn't reachable.
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            await client.get(f"{WRAPPER_URL}/v1/status")
        except Exception:
            pytest.skip("Wrapper not running on localhost:8081 — start it to run this test")

        start = time.time()
        tasks = [
            client.post(
                f"{WRAPPER_URL}/v1/remediate",
                json={"patch": f"patch-{i}", "test_fixture": f"fixture-{i}.json"},
            )
            for i in range(CONCURRENT_REQUESTS)
        ]
        responses = await asyncio.gather(*tasks, return_exceptions=True)
        elapsed = time.time() - start

        errors = [r for r in responses if isinstance(r, Exception)]
        successes = [r for r in responses if not isinstance(r, Exception)]

        print(f"\n{CONCURRENT_REQUESTS} concurrent requests in {elapsed:.2f}s")
        print(f"Successes: {len(successes)}, Errors: {len(errors)}")

        assert len(errors) == 0, f"{len(errors)} requests failed: {errors[:3]}"
        for r in successes:
            assert r.status_code == 200
            body = r.json()
            assert body["verified"] is True
            assert body["mode"] == "mock"
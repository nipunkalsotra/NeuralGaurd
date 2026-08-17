#!/usr/bin/env python3
"""
Pre-Demo Smoke Check — Day 14 (Shreshtha + Nipun).

Both guides list an overlapping set of "run this 30-60 min before the
demo" checks:
  Shreshtha: "Test /health endpoint, test WebSocket connection, test
              one remediate call"
  Nipun:     "Fault injection endpoint responds... Audit logger is
              writing... Hash chain verification script passes"

This script runs every one of those that's actually a server-side,
scriptable check. It deliberately does NOT try to check the items that
are inherently visual (see the printed section at the end) — a script
claiming to verify "the Circuit Breaker Panel shows green" without a
real browser would be a false assurance, not a real check.

Usage:
    python scripts/pre_demo_check.py
    python scripts/pre_demo_check.py --backend http://192.168.1.42:8000 --wrapper http://192.168.1.42:8081

Exit code 0 if every scriptable check passes, 1 otherwise.
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path

import httpx

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

EXPECTED_CIRCUIT_SERVICES = {"NIM", "Nemotron", "cuOpt", "Groq", "NemoClaw"}
EXPECTED_METRICS_KEYS = {
    "time_to_detect", "tokens_saved", "throughput_maintained",
    "fixes_applied", "escalations", "fallbacks_triggered",
}

results = []


def check(name):
    def decorator(fn):
        async def wrapper(*args, **kwargs):
            try:
                detail = await fn(*args, **kwargs)
                results.append((name, True, detail or "ok"))
            except Exception as e:
                results.append((name, False, str(e)))
        return wrapper
    return decorator


@check("Backend GET /health")
async def check_health(backend_url, client):
    r = await client.get(f"{backend_url}/health")
    assert r.status_code == 200, f"status {r.status_code}"
    assert r.json().get("status") == "ok", r.json()
    return "200 OK"


@check("Backend WebSocket /ws/stream reachable")
async def check_websocket(backend_url, client):
    import websockets
    ws_url = backend_url.replace("http://", "ws://").replace("https://", "wss://") + "/ws/stream"
    async with websockets.connect(ws_url, open_timeout=5) as ws:
        await ws.close()
    return "connected and closed cleanly"


@check("Backend POST /demo/inject (fault injection endpoint)")
async def check_fault_injection(backend_url, client):
    r = await client.post(
        f"{backend_url}/demo/inject",
        json={"target": "worker-predemo-check", "fault_type": "schema_corruption", "payload": {"field": "Tax_ID"}},
        timeout=60.0,
    )
    assert r.status_code == 200, f"status {r.status_code}"
    body = r.json()
    assert body.get("injected") is True, body
    return f"loop_detected={body['details'].get('loop_detected')}"


@check("Backend GET /api/circuit-status (all 5 services present)")
async def check_circuit_status(backend_url, client):
    r = await client.get(f"{backend_url}/api/circuit-status")
    assert r.status_code == 200, f"status {r.status_code}"
    services = {s["service"] for s in r.json()["services"]}
    assert services == EXPECTED_CIRCUIT_SERVICES, f"got {services}"
    return "5/5 services present (colors are a visual check, not this one)"


@check("Backend GET /api/metrics (Report Card data ready)")
async def check_metrics(backend_url, client):
    r = await client.get(f"{backend_url}/api/metrics")
    assert r.status_code == 200, f"status {r.status_code}"
    keys = set(r.json().keys())
    assert keys == EXPECTED_METRICS_KEYS, f"got {keys}"
    return "all 6 ReportCardMetrics fields present"


@check("Audit logger is writing (file exists, non-empty)")
async def check_audit_log_writing(backend_url, client):
    from sentinel.audit.trustchain_logger import TrustChainLogger
    log_path = Path(TrustChainLogger().log_file)
    assert log_path.exists(), f"{log_path} does not exist"
    size = log_path.stat().st_size
    assert size > 0, "file exists but is empty"
    return f"{log_path}, {size} bytes"


@check("Hash chain verification script passes")
async def check_hash_chain(backend_url, client):
    from sentinel.audit.trustchain_logger import TrustChainLogger
    logger = TrustChainLogger()
    assert logger.verify_chain(), "chain is broken — run scripts/verify_audit_chain.py for details"
    return "chain intact"


@check("Wrapper GET /v1/status")
async def check_wrapper_status(wrapper_url, client):
    r = await client.get(f"{wrapper_url}/v1/status")
    assert r.status_code == 200, f"status {r.status_code}"
    return r.json()


@check("Wrapper POST /v1/remediate (one real call)")
async def check_wrapper_remediate(wrapper_url, client):
    r = await client.post(
        f"{wrapper_url}/v1/remediate",
        json={"patch": "pre-demo smoke check", "test_fixture": "default_fixture.json", "worker_id": "worker-predemo-check"},
        timeout=15.0,
    )
    assert r.status_code == 200, f"status {r.status_code}"
    body = r.json()
    assert body.get("verified") is True, body
    return f"mode={body.get('mode')}"


VISUAL_CHECKS_NOT_SCRIPTED = [
    "Similarity Graph shows live data",
    "Circuit Breaker Panel dots are actually green (this script only confirms the endpoint responds with the right 5 services, not their color)",
    "Health Indicators show all agents healthy",
    "Audit Log Stream renders recent events",
    "Post-Heal Report Card opens and displays correctly",
]


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", default="http://localhost:8000")
    parser.add_argument("--wrapper", default="http://localhost:8081")
    args = parser.parse_args()

    async with httpx.AsyncClient() as client:
        await check_health(args.backend, client)
        await check_websocket(args.backend, client)
        await check_fault_injection(args.backend, client)
        await check_circuit_status(args.backend, client)
        await check_metrics(args.backend, client)
        await check_audit_log_writing(args.backend, client)
        await check_hash_chain(args.backend, client)
        await check_wrapper_status(args.wrapper, client)
        await check_wrapper_remediate(args.wrapper, client)

    print(f"\n{'CHECK':<50} {'RESULT'}")
    print("-" * 75)
    all_passed = True
    for name, passed, detail in results:
        status = "PASS" if passed else "FAIL"
        if not passed:
            all_passed = False
        print(f"{name:<50} {status:<6} {detail}")

    print("\nNOT scriptable — confirm these visually in a real browser before demo:")
    for item in VISUAL_CHECKS_NOT_SCRIPTED:
        print(f"  - {item}")

    print()
    if all_passed:
        print(f"All {len(results)} scriptable checks PASSED.")
        sys.exit(0)
    else:
        failed = sum(1 for _, p, _ in results if not p)
        print(f"{failed}/{len(results)} scriptable checks FAILED — fix before demo.")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())

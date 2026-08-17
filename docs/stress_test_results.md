# Wrapper Stress Test Results — Day 13

**Owners:** Shreshtha + Nipun (both individual guides assign this exact same task —
40 concurrent `/v1/remediate` requests, same targets — so it was run once, for
real, rather than duplicated.)

## Environment note

The guide assumes 16GB RAM. This machine has **7.5GB total**, with only
~570MB free and swap already at ~3.3/4GB used *before* either test ran
(pre-existing load from this session, not caused by the test). Both
tests below completed cleanly anyway — memory usage was essentially flat
across both runs — but the numbers below are from a more constrained box
than the guide's assumption, worth noting if these numbers get compared
to someone else's run on beefier hardware.

## Test 1 — Real load, real wrapper (mock mode), no artificial timeout

40 concurrent `POST /v1/remediate` requests via a real asyncio+httpx
client against a real running `wrapper_service.py` (mock mode — no
`nemoclaw` binary in this environment, same as every other day's testing).

```
Total wall time for 40 concurrent requests: 2.06s
Successful: 40/40, Errors/crashes: 0
P50: 2.05s | P95: 2.05s | P99: 2.05s
Min: 2.03s | Max: 2.05s
Auto-fallbacks (flagged=true): 0
```

All 40 requests completed in essentially the mock wrapper's own fixed
2s simulated sandbox delay — the async event loop absorbed all 40
concurrent connections with no queuing overhead. Well under every
target (P50 <3s, P95 <8s, P99 <15s). Memory/swap unchanged before vs.
after (`free -h` diff was noise-level).

**Zero auto-fallbacks here is expected, not a gap**: the mock wrapper has
no way to simulate a slow/hanging response via request parameters — it
always takes exactly 2s and always succeeds. That's why Test 2 exists.

## Test 2 — Real timeouts under real load

The guide's other requirement — "verify auto-fallback triggers correctly
for timed-out requests" — needs an actual timeout to happen, which the
mock wrapper can't produce on its own. Made `RemediationAgent`'s
previously-hardcoded 30s wrapper timeout configurable
(`wrapper_timeout` constructor param) specifically to test this for
real: pointed 40 concurrent `RemediationAgent.remediate()` calls at the
real wrapper (still taking its real, unmodified 2s) with the client-side
timeout set to 1s — i.e. every single one of these 40 concurrent calls
*genuinely* times out, not a mocked exception.

```
Total wall time: 1.04s
Results: 40/40, timed_out(mode=timeout, flagged=True): 40, non-dict/crashed: 0
All flagged=True on timeout: True
Circuit breaker state after: is_closed=False
```

All 40 concurrent real timeouts correctly produced `mode: "timeout",
flagged: True` — no crashes, no hangs, no unhandled exceptions — and the
circuit breaker correctly opened afterward (40 failures far exceeds the
3-failure threshold). This is the actual resilience property the guide
cares about, verified with real timeouts instead of asserting it in
isolation and hoping it holds under concurrency too.

## Performance tuning applied

1. **`backend/Dockerfile`: removed `--reload` from the uvicorn CMD.**
   `--reload` runs a continuous file-system watcher — a dev-only
   feature with real overhead that has no business in the image used
   for the live demo.
2. **Deliberately did NOT add `--workers N>1`.** `SentinelAgent`,
   `TriageAgent`'s circuit breakers, `EmbeddingCache`/`DiagnosisCache`,
   `circuit_registry`, and `TokenCounter` are all in-memory singletons
   at module scope. Multiple uvicorn worker *processes* would each get
   an independent copy of every one of them — a dashboard client could
   see a different circuit breaker state than the one that actually
   served its request. Adding workers here would be a correctness bug,
   not a performance win — staying at 1 worker is the correct tuning
   decision given this architecture, not an oversight.
3. **`RemediationAgent` was opening and closing a brand-new
   `httpx.AsyncClient` (and its own new TCP connection) on every single
   `remediate()` call.** httpx.AsyncClient's entire purpose is to be
   created once and reused so it can pool/keep-alive connections across
   requests — the old code defeated that on every call. Now holds one
   persistent client for the agent's lifetime. Re-ran both stress tests
   after this change to confirm no regression (see numbers above,
   already reflect the fix).

## Not fixed, documented instead

`TriageAgent.diagnose()` and the Nemotron/Groq/NIM clients underneath it
make **synchronous, blocking** HTTP calls (`httpx.post`, not
`httpx.AsyncClient`) from inside code that's ultimately invoked from an
async context (`Orchestrator.on_loop_suspected`, without `await`, since
`diagnose()` itself isn't `async def`). A slow real Nemotron/Groq
response would block the entire single-threaded event loop for its
duration — no other WebSocket messages or requests could be served
concurrently during that window. This is real, but converting three
client classes to async would touch their entire existing test suite
(multiple files mock `.chat()`/`.embed()` synchronously) for a
condition that doesn't actually show up in the demo's real usage
pattern (one fault injection, one worker, not 40 concurrent Triage
calls) — the wrapper stress test above specifically exercises the parts
of the system that ARE async and DO see real concurrent load. Documented
as a known Phase 2 concern rather than either silently ignored or
over-fixed this close to demo day.

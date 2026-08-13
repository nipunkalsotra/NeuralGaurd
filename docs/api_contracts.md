# API Contracts

## POST /v1/remediate (Mock Wrapper Contract)
**Owner:** Nipun | **Locked:** Day 1 | **Consumed by:** Shreshtha (real adapter, Days 8-9)

### Request
```json
{
  "patch": "string — description of the fix to apply",
  "test_fixture": "string — identifier or path to test data"
}
```

### Response
```json
{
  "verified": true,
  "output": "string — human-readable result summary",
  "sandbox_log": "string — [MOCK]-prefixed multi-line execution log",
  "mode": "mock",
  "flagged": false
}
```

### Notes for real adapter (Shreshtha)
- `mode` must switch to `"nemoclaw"` when running real CLI, stays `"mock"` for fallback
- `flagged: true` (+ a `reason` field) expected when NemoClaw CLI fails and wrapper auto-falls-back to mock mid-request
- `sandbox_log` should mirror real CLI banner style — `✓ Active gateway set to 'nemoclaw'` followed by command output — per `/docs/nemoclaw_cli.md`

## ReroutePlan (Optimization Agent output)
**Owner:** Rashi | **Locked:** Day 3 (scaffold) | **Consumed by:** Nipun (Orchestrator, Day 6)

```json
{
  "assignments": [{"item_id": "item-1", "worker_id": "worker-2"}],
  "excluded_workers": ["worker-3"],
  "projected_throughput_pct": 97.0
}
```
Day 3 note: `solve()` is a stub — returns empty `assignments`, real solver
(cuOpt -> OR-Tools -> greedy) lands Day 4-6.

## Audit Log Event Format (for dashboard)
**Owner:** Rashi/Nipun (logger) | **Consumed by:** Tushar (Audit Log Stream UI)

```json
{
  "timestamp": "2026-07-28T10:00:00Z",
  "worker_id": "worker-3",
  "from_state": "HEALTHY",
  "to_state": "LOOP_SUSPECTED",
  "trigger_event": "LOOP_SUSPECTED",
  "agent_name": "SentinelAgent",
  "confidence_score": null,
  "fallback_used": false,
  "fallback_origin": null,
  "previous_hash": "abc123...",
  "current_hash": "def456..."
}
```
Suggested color coding by `to_state`: green=HEALTHY/RESUMED,
amber=LOOP_SUSPECTED, blue=DIAGNOSING, orange=REMEDIATING,
violet=VERIFYING, rose=ESCALATED — matches master doc Section 11.3 palette.

## Orchestrator State Transitions (Day 5, Updated)
**Owner:** Nipun | For: Tushar's Workflow DAG animations

Live end-to-end today: HEALTHY → LOOP_SUSPECTED → DIAGNOSING → REMEDIATING,
with Optimization Agent dispatched genuinely in parallel (not stubbed).
**Day 9 correction:** the `test_optimization_and_triage_dispatch_in_parallel`
test named here was never actually added to the repo — parallel dispatch
was real (both agents subscribe to the same EventBus topic) but unproven
until Day 9's `test_fault_injection_drives_sentinel_and_optimization_in_parallel_via_orchestrator`
(`backend/tests/test_day9_rashi_integration.py`), which exercises it for
real through the live `/demo/inject` endpoint.

REMEDIATING → VERIFYING → RESUMED/ESCALATED remains stubbed — Remediation
Agent is Nipun's Day 7 task, does not exist yet. Full end-to-end test
(HEALTHY through RESUMED) is not possible until then.

Every transition writes an immutable, hash-chained audit record via
TrustChainLogger.

## Optimization Agent — Solver Status (Days 4-5)
**Decision:** cuOpt SKIPPED for this project — hosted REST API access was
never confirmed working (see earlier investigation: no stable public
endpoint found, `HTTP 000` on attempted calls, likely requires
self-hosted NIM container or restricted trial access not available to us).

**Practical fallback chain implemented:** OR-Tools (primary) -> greedy
round-robin (last resort). This still satisfies the master doc's
resilience philosophy (Section 9.3) — OR-Tools was always meant to be a
fallback FOR cuOpt, so using it as practical primary is a reasonable,
honest scope adjustment, not a missing feature.

ReroutePlan format (unchanged, locked):
```json
{
  "assignments": [{"item_id": "item-1", "worker_id": "worker-2"}],
  "excluded_workers": ["worker-3"],
  "projected_throughput_pct": 97.0,
  "solver_used": "or-tools" | "greedy_round_robin"
}
```

## Circuit Breaker Service List (Day 6, for Tushar's Panel UI)
**Owner:** Nipun | **Consumed by:** Tushar (Circuit Breaker Panel)

Services with independent circuit breakers:
| Service | Used by | States |
|---|---|---|
| NIM (embeddings) | Sentinel Agent | closed / half-open / open |
| Nemotron | Triage Agent | closed / half-open / open |
| Groq | Triage Agent (fallback) | closed / half-open / open |
| NemoClaw | Wrapper Service | closed / half-open / open |
| Wrapper (Remediation->wrapper HTTP call) | Remediation Agent | closed / half-open / open |

Status colors: green=closed (healthy), yellow=half-open (recovering),
red=open (failed). Each breaker: 3 consecutive failures -> opens for 60s
-> half-open probe -> closes on success or reopens on failure.

## Day 7 Status Note
WebSocket schema sign-off with Tushar and all Sandbox Terminal / [MOCK MODE]
banner verification is DEFERRED — UI work is paused until backend
(Nipun/Rashi/Shreshtha) reaches Day 8. Schema itself (docs/websocket_schema.md,
locked by Shreshtha Day 3) is unaffected by this deferral — it will be
verified against real dashboard code once UI work resumes.

## Day 6-7 Status (Rashi, covered)
- cuOpt circuit breaker added to OR-Tools solve chain — closes remaining
  Day 6 gap (cuOpt itself remains explicitly skipped, per earlier decision).
- Fault Injection Backend (POST /demo/inject) complete, all 4 fault types
  tested. Confirmed feeding into Sentinel's real detect_loop().
- DEFERRED (UI phase): Health Indicators UI, 'Break It' button, WebSocket
  streaming of fault events to dashboard. Backend fault injection API is
  fully functional and ready for Tushar to wire up once UI work resumes.

## Day 8 Status (Rashi, UI portion)
- Audit Log Stream UI: color-coding, expand-to-JSON, auto-scroll all
  confirmed working via mock data generator (real backend->UI wiring
  pending Day 9-10, since /demo/inject doesn't yet call Sentinel/
  Orchestrator directly — see integration gap noted after Day 7).
- Color scheme uses to_state-based mapping (existing implementation),
  functionally equivalent to today's spec's transition-pair mapping —
  no code change needed, same colors produced for every real transition.
- Hash chain integrity: backend verify_chain() tested (Day 3). Client-side
  chain display (verifyHashChain() in AuditLogStream.tsx) does structural
  validation only (not full crypto recompute, per its own code comment) —
  acceptable for a visual indicator, documented as intentional limitation.
- Joint auto-fallback UI test with Shreshtha: DEFERRED to Day 9-10
  integration, since it requires the fault-injection-to-Orchestrator
  wiring that doesn't exist yet.

## Day 8 — Fallback Chain Test Summary
| Chain | Status |
|---|---|
| Sentinel: NIM -> sentence-transformers -> hash | ✅ Tested |
| Triage: Nemotron -> Groq (+JSON repair) -> heuristic | ✅ Tested |
| Optimization: OR-Tools -> greedy round-robin | ✅ Tested (cuOpt skipped, see Day 4-5 note) |
| Remediation: wrapper timeout -> flagged mock, no crash | ✅ Tested |
| Orchestrator: nvidia-nat -> asyncio | N/A — nvidia-nat never integrated |

Mock wrapper stress test: 20 concurrent requests, 0 errors, 2.05s total — confirms genuine parallelism (not serialized, given each request includes a 2s simulated delay)

## Day 9 Status (Shreshtha) — Integration Day
**Scope note:** this pass covers only Shreshtha's Day 9 (Infra & NemoClaw
Specialist). Nipun/Rashi/Tushar's Day 9 items (fallback-chain unit test
review, real-API integration checks, dashboard-to-backend connection) are
tracked separately and not claimed done here.

Blueprint Day 9 blocker: "Switch ALL services to PRIMARY mode on your
machine ... Test auto-fallback: Kill NemoClaw mid-request, verify mock
takes over in <5 seconds." This dev machine has no real `nemoclaw` binary
installed, so PRIMARY mode (`NEMOCLAW_MODE=nemoclaw`) here genuinely
exercises the fallback path rather than the happy path — which is exactly
the condition Day 9 is supposed to prove is safe.

New coverage added: `wrapper/tests/test_nemoclaw_adapter.py` (6 tests,
all passing), exercising `real/nemoclaw_adapter.py` and the wrapper's
`/v1/remediate` + `/v1/status` HTTP contract directly, using real killable
OS subprocesses standing in for the nemoclaw CLI (not mocked coroutines) —
kills propagate through asyncio's subprocess machinery exactly as they
would for a real nemoclaw process:

| Test | Result |
|---|---|
| `nemoclaw` binary missing (real condition on this host) → mock fallback, contract intact | ✅ PASS |
| **Killed mid-request → mock fallback** | ✅ PASS — measured **0.303s** (blocker: <5s), returncode `-9` (SIGKILL) correctly routed to the fallback branch |
| Non-zero exit, no kill → real patch failure (`verified: false`, NOT a fallback — fixed, see `docs/nemoclaw_cli.md` Day 9 note) | ✅ PASS |
| Exit code 137 (Docker OOM-kill signature), no kill → mock fallback | ✅ PASS |
| `/v1/status` reports `mode: "nemoclaw"` in PRIMARY mode | ✅ PASS |
| `/v1/remediate` full HTTP round-trip in PRIMARY mode → mock contract (`verified`, `flagged`, `mode`, `reason`) | ✅ PASS |

Full state machine (HEALTHY → LOOP_SUSPECTED → DIAGNOSING → REMEDIATING →
VERIFYING → RESUMED) with audit hash-chain integrity remains covered by
`backend/tests/test_orchestrator.py::test_full_fsm_verified_true_reaches_resumed`
(`audit_logger.verify_chain()` asserted `True`) — re-run clean as part of
this pass (68 passed, 2 skipped, 0 failed across the full backend suite).

All Day 9 blocker checks for Shreshtha's scope pass. Dashboard-side
verification (Tushar connecting to this backend) and cross-machine network
setup (ngrok/local-IP, moot on a single-machine build) are out of scope for
this pass.

## Day 9 Status (Nipun) — Integration Test on Shreshtha's Machine
**Scope note:** covers Nipun's Day 9 only (SDK Lead & Fallback Architect —
owns Orchestrator, TriageAgent, RemediationAgent). Tushar's Day 9
(dashboard-to-backend connection) remains out of scope.

Closed a real gap first: `api/fault_injection.py`'s `/demo/inject`
endpoint used to fake the LOOP_SUSPECTED transition with a single direct
`broadcast_state_change` call — it never actually drove the Orchestrator,
so Triage/Remediation/Optimization never ran for an injected fault. This
was the "fault-injection-to-Orchestrator wiring" gap the Day 8 status note
above flagged as deferred to Day 9-10. It's now wired to a real, shared
`EventBus` + `Orchestrator` + `OptimizationAgent` (module-level
singletons, same pattern as the existing `_sentinel` singleton).

New coverage: `backend/tests/test_day9_nipun_integration.py` drives the
full FSM (HEALTHY → LOOP_SUSPECTED → DIAGNOSING → REMEDIATING → VERIFYING
→ RESUMED) against the REAL, live `wrapper_service.py` (Shreshtha's owned
code) started as a subprocess in PRIMARY mode by a shared
`live_wrapper_primary_mode` fixture in `backend/tests/conftest.py` — not
mocked at the httpx boundary like the Day 5-8 orchestrator tests. Result:
RESUMED reached, audit hash chain verified intact, fallback correctly
recorded, full round-trip in well under the 5s blocker.

Also added `backend/tests/conftest.py`'s `deterministic_triage_for_fault_injection`
autouse fixture — without it, every test hitting `/demo/inject` made real
network calls to Nemotron/Groq (observed ~20s for a test file that should
run in under a second, since no real API keys are set in this
environment) to re-prove logic Day 8 already unit-tests in isolation.
Full backend suite dropped from ~14s to ~4s as a result.

## Day 9 Status (Rashi) — Integration Test on Shreshtha's Machine
**Scope note:** covers Rashi's Day 9 only (Algorithms & Optimization —
owns SentinelAgent's detection algorithm, OptimizationAgent, Fault
Injection Backend, and jointly the audit fields). Tushar's Day 9 remains
out of scope.

New coverage: `backend/tests/test_day9_rashi_integration.py` hits the
real `POST /demo/inject` HTTP endpoint (via the live wrapper, same fixture
as Nipun's test above) and confirms, for the first time through the
actual live endpoint rather than a direct unit test:
- Sentinel's real `detect_loop()` fires from the injected fault.
- The Optimization Agent is dispatched **concurrently** with
  Triage/Remediation (`asyncio.gather` inside `EventBus.publish`) — this
  closes out the "parallel dispatch" claim in the Day 5 note above
  (`test_optimization_and_triage_dispatch_in_parallel`, referenced there,
  did not actually exist in the repo; this test is the real version of
  that proof, exercised at the HTTP level).
- The audit record for the resulting RESUMED transition correctly shows
  `fallback_used: true` — NemoClaw isn't available on this host, so the
  wrapper's mock fallback is what actually resolves the worker, and the
  audit trail says so.

Full round-trip (HTTP request in → RESUMED + audit record out) confirmed
under the 5s blocker.

## Day 10 Status — Team-Wide Integration: Contract Audit

**Scope:** Day 10 across all four roles is one shared task — audit the
exact contracts named in each person's Day-10 write-up against the real
running code, fix what's actually broken, verify what isn't. Covers
Nipun/Rashi's named contracts (LOOP_SUSPECTED event, ReroutePlan, Fault
Injection response, Audit Log record) and Tushar's three example drift
patterns (field-name drift, timestamp format drift, type drift).

### Audited clean — no fix needed
| Contract | Result |
|---|---|
| LOOP_SUSPECTED event shape (`worker_id, similarity, consecutive_count, error_hash, embedding_vector, timestamp`) | ✅ `SentinelAgent.detect_loop()` matches exactly |
| Fault Injection response shape (`injected, target, fault_type, timestamp, details`) | ✅ `InjectResponse` matches exactly |
| Audit Log record shape | ✅ Already fixed Day 9 (`audit_event` type-name bug) |
| Unix-epoch vs ISO8601 timestamps | ✅ No epoch timestamps ever sent over the wire — cache/circuit-breaker internals use `time.time()` but never leave the process |
| `worker_id` as int vs string | ✅ Always `str`, enforced by Pydantic on every model |

### Real gaps found and fixed
1. **`OPTIMIZATION_COMPLETE` had zero production subscribers.** Rashi's
   OptimizationAgent computes a real `ReroutePlan` and dispatches it in
   parallel with Triage on every `LOOP_SUSPECTED` — but Nipun's
   Orchestrator never subscribed to it, so the plan was silently
   discarded every single time. This is exactly what both Nipun's and
   Rashi's Day-10 pass criteria required ("Optimization returns
   ReroutePlans consumed by Orchestrator"). Fixed: `Orchestrator` now
   subscribes and stores the latest plan per worker in
   `self.reroute_plans`, logged on receipt. Covered by
   `test_orchestrator_consumes_optimization_complete`.
2. **Triage Report Card was never wired to live data** — a gap flagged
   during Day 9 but left out of scope then. Closed now since Day 10
   explicitly requires "dashboard renders correctly with live data"
   end-to-end. The `audit_event` broadcast on the DIAGNOSING→REMEDIATING/
   ESCALATED transition now additionally carries `root_cause`, `fix_type`,
   `affected_field` (null on every other transition) — additive, not a
   schema break. Dashboard's `App.tsx` opens the Triage Report Card on
   this real data, mapping `confidence_score` → `confidence` (the exact
   class of field-name mapping fix Nipun's Day-10 guide names). Covered
   by an extended `test_full_fsm_verified_true_reaches_resumed` assertion.
3. **`TriageReportCard.tsx`'s `FixType` union didn't match reality.** It
   listed `MISSING_FIELD`/`UNKNOWN`, values TriageAgent never actually
   produces; the real enum (now also the constrained LLM prompt's enum,
   see Day 9's nemoclaw_cli.md-adjacent fix) is `SCHEMA_MISMATCH |
   TYPE_ERROR | MISSING_IMPORT | TIMEOUT | CONNECTION_ERROR |
   RESOURCE_ERROR`. A real value hitting the old union would have missed
   `FIX_TYPE_STYLES` silently. Fixed the union and added a default style
   as defense-in-depth against any future/unrecognized value.

Full backend suite: 71 passed, 2 skipped. Wrapper suite: 6 passed.
Dashboard: clean `tsc -b && vite build`, no new lint issues.

## Day 11 Status — Caching Layer Integration + Circuit Breaker Panel (Shreshtha)

**Scope:** per Shreshtha's Day-11 guide — both caches (`embedding_cache`,
`diagnosis_cache`) and the per-service `circuit_registry` were already
wired into their owning agents ahead of schedule (Days 1, 4, 6, 8; see
`docs/cache_schema.md`). Day 11's real job was closing the two specific
verification gaps her guide calls out as blockers, not building new
integration code.

### Verified
1. `SentinelAgent.detect_loop()` and `TriageAgent.diagnose()` called
   twice with identical input hit the cache the second time — confirmed
   with the actual entry points, not just the lower-level `embed()`/
   `diagnose()` unit tests that already existed. `fallback_origin`
   survives correctly on the cached (second) call, not just the first.
2. `GET /api/circuit-status` reflects real backend failures live —
   OPEN after 3 failures, HALF_OPEN after the 60s window, CLOSED after a
   successful probe — verified through the actual HTTP layer the
   dashboard polls, not just the `CircuitBreaker` class in isolation.
   `CircuitBreakerPanel.tsx` already polls this endpoint every 2s and
   overrides `cuOpt` to a static "Unused" card, consistent with the
   project-wide decision to skip cuOpt.

### Real gap found and fixed
**Re-injecting a fault on a worker already in `ESCALATED` crashed the
`/demo/inject` endpoint (500) instead of starting a fresh incident.**
`ESCALATED` is a deliberate terminal state in `VALID_TRANSITIONS` (no
retry loop, by design), but `Orchestrator.on_loop_suspected` tried to
transition straight to `LOOP_SUSPECTED` again regardless of the worker's
current state, which is illegal from `ESCALATED` and raised inside
`EventBus.publish`'s `asyncio.gather`, uncaught. Since `App.tsx`'s BREAK
IT button always targets the same hardcoded `worker-3`, this was directly
reachable in the live demo: escalate once, press BREAK IT again, crash.
Fixed by treating a new fault injection as an implicit reset to `HEALTHY`
for any worker not already in `HEALTHY`/`RESUMED`, before the normal
`HEALTHY -> LOOP_SUSPECTED` transition — a fresh fault starts a fresh
incident. Caught by
`test_repeated_fault_injection_still_detects_loop_with_cache_warm` in
`backend/tests/test_day11_cache_circuit_integration.py`.

Rashi's Day-11 cuOpt schema verification (30-min mandatory check against
the live NVIDIA API) is N/A for this project — cuOpt is already skipped
project-wide per the Day 4-5 decision above; nothing to verify there.

Full backend suite: 80 passed, 2 skipped.
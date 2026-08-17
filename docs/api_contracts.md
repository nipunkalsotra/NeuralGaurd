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
**Owner:** Nipun | **Locked:** Day 3 (scaffold) | **Consumed by:** Nipun (Orchestrator, Day 6)

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
**Owner:** Nipun/Nipun (logger) | **Consumed by:** Shreshtha (Audit Log Stream UI)

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
**Owner:** Nipun | For: Shreshtha's Workflow DAG animations

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

## Circuit Breaker Service List (Day 6, for Shreshtha's Panel UI)
**Owner:** Nipun | **Consumed by:** Shreshtha (Circuit Breaker Panel)

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
WebSocket schema sign-off with Shreshtha and all Sandbox Terminal / [MOCK MODE]
banner verification is DEFERRED — UI work is paused until backend
(Nipun/Nipun/Shreshtha) reaches Day 8. Schema itself (docs/websocket_schema.md,
locked by Shreshtha Day 3) is unaffected by this deferral — it will be
verified against real dashboard code once UI work resumes.

## Day 6-7 Status (Nipun, covered)
- cuOpt circuit breaker added to OR-Tools solve chain — closes remaining
  Day 6 gap (cuOpt itself remains explicitly skipped, per earlier decision).
- Fault Injection Backend (POST /demo/inject) complete, all 4 fault types
  tested. Confirmed feeding into Sentinel's real detect_loop().
- DEFERRED (UI phase): Health Indicators UI, 'Break It' button, WebSocket
  streaming of fault events to dashboard. Backend fault injection API is
  fully functional and ready for Shreshtha to wire up once UI work resumes.

## Day 8 Status (Nipun, UI portion)
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
Specialist). Nipun/Nipun/Shreshtha's Day 9 items (fallback-chain unit test
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
verification (Shreshtha connecting to this backend) and cross-machine network
setup (ngrok/local-IP, moot on a single-machine build) are out of scope for
this pass.

## Day 9 Status (Nipun) — Integration Test on Shreshtha's Machine
**Scope note:** covers Nipun's Day 9 only (SDK Lead & Fallback Architect —
owns Orchestrator, TriageAgent, RemediationAgent). Shreshtha's Day 9
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

## Day 9 Status (Nipun) — Integration Test on Shreshtha's Machine
**Scope note:** covers Nipun's Day 9 only (Algorithms & Optimization —
owns SentinelAgent's detection algorithm, OptimizationAgent, Fault
Injection Backend, and jointly the audit fields). Shreshtha's Day 9 remains
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
Nipun/Nipun's named contracts (LOOP_SUSPECTED event, ReroutePlan, Fault
Injection response, Audit Log record) and Shreshtha's three example drift
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
1. **`OPTIMIZATION_COMPLETE` had zero production subscribers.** Nipun's
   OptimizationAgent computes a real `ReroutePlan` and dispatches it in
   parallel with Triage on every `LOOP_SUSPECTED` — but Nipun's
   Orchestrator never subscribed to it, so the plan was silently
   discarded every single time. This is exactly what both Nipun's and
   Nipun's Day-10 pass criteria required ("Optimization returns
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

Nipun's Day-11 cuOpt schema verification (30-min mandatory check against
the live NVIDIA API) is N/A for this project — cuOpt is already skipped
project-wide per the Day 4-5 decision above; nothing to verify there.

Full backend suite: 80 passed, 2 skipped.

## Day 11 Status — Fallback Chain Unit Tests + Caching Integration (Nipun & Nipun)

**Scope:** Nipun's guide names 4 exact malformed-Groq-JSON shapes as the
mandatory blocker check for Day 11 ("fix ALL failures before Day 12"):
missing closing brace, markdown code block, plain text, nested markdown
fence. Nipun's guide's other Day-11 item (cuOpt live schema verification)
is documented as N/A above and in `docs/cuopt_schema_verified.md`; her
Circuit Breaker Panel UI item is also N/A here — Shreshtha already owns and
built `CircuitBreakerPanel.tsx` (Day 6); building a second one would be a
duplicate, not a fix. Both guides converge on the same real work: run and
harden `test_fallback_chains.py`.

### Real gap found and fixed
**`repair_json()` couldn't actually repair the "missing closing brace"
case** — the exact shape the guide names first (`{"root_cause": "...",
"confidence": 0.91` — LLM output truncated before the closing brace,
e.g. hit `max_tokens` mid-response). Checked directly against the real
implementation: it raised `ValueError` instead of repairing, silently
discarding the LLM's actual diagnosis and falling all the way through to
the generic rule-based heuristic. Not a crash (the outer `try/except` in
`TriageAgent.diagnose()` already catches this), but a real quality
regression the guide explicitly calls for fixing. Added a brace-balancing
repair layer to `sentinel/fallback/json_repair.py` — counts `{` vs `}`
and appends what's missing before falling through to the markdown/blob
extraction layers. Verified against all 4 named shapes directly:

| Malformed shape | Before fix | After fix |
|---|---|---|
| Missing closing brace | Raised → heuristic (real diagnosis lost) | Repaired → real diagnosis recovered |
| Markdown code block (` ```json `) | Already worked | Unchanged |
| Plain text, no JSON | Raised → heuristic (correct by design) | Unchanged |
| Nested/untagged fence (` ``` ` no `json` tag) | Already worked | Unchanged |

Added dedicated tests for all 4 shapes to `test_fallback_chains.py`
(`test_triage_groq_missing_closing_brace_is_repaired`,
`test_triage_groq_plain_text_falls_through_to_heuristic`,
`test_triage_groq_nested_markdown_fence_is_repaired`, plus the
pre-existing markdown-fence test) — each against a distinct `worker_id`
so the 30-min diagnosis cache can't mask a real repair failure behind a
cache hit from an earlier test.

### Verified, no fix needed
- Sentinel fallback (NIM -> sentence-transformers -> hash), Optimization
  fallback (OR-Tools -> greedy round-robin), Remediation fallback
  (wrapper timeout -> flagged mock) — all already covered and passing.
- Caching layer integration at the real entry points (`detect_loop()`,
  `diagnose()` called twice with identical input hits the cache, second
  call makes zero API calls, `fallback_origin` survives on the cached
  hit) — covered by `test_day11_cache_circuit_integration.py` (added
  during Shreshtha's Day 11, same shared codebase).
- Circuit Breaker Panel real-time status from the live backend — same
  file, same verification; nothing Nipun/Nipun-specific left to check
  beyond what's already confirmed.

Full backend suite: 84 passed, 2 skipped (`test_fallback_chains.py`:
10 passed, 1 skipped by design — no nvidia-nat integration exists to
fall back from).

### One manual step remaining
Everything above is verified against the local backend directly. The one
piece that's inherently a visual check, not something completable from
here: with the dashboard actually connected to Shreshtha's live backend
over LAN (same `.env.local` setup from Day 9/10), open the Circuit
Breaker Panel in a browser and confirm the 5 service dots render the
right colors in real time — green/closed at rest, red/open after 3
induced failures on a service, yellow/half-open after the 60s window,
back to green after a successful probe. The backend-side correctness of
every one of those transitions is already proven by
`test_day11_cache_circuit_integration.py`'s 4 circuit-status tests; this
step is only confirming the browser renders what the endpoint already
correctly reports.

## Day 11 Status — Circuit Breaker Panel Complete + Dashboard Polish (Shreshtha)

**Scope:** per Shreshtha's guide — verify the panel against real failures
(not directly-poked breaker objects), performance tuning (React.memo,
bundle size), and a visual polish pass on Days 9-10's remaining UI.

### The guide's end-of-day blocker is a two-person physical test
"Ask Nipun to block NIM URL in his hosts file... ask Nipun to trigger a
Nemotron rate-limit... watch the panel." That requires two machines and
real network conditions, and can't be run from here. What the physical
test is actually checking, though, is that a *real* agent-level failure
(not a directly-poked `CircuitBreaker` object, which is all
`test_circuit_breaker.py` and even `test_day11_cache_circuit_integration.py`
exercised) reaches the dashboard-facing `circuit_registry`. Checked that
specific gap directly rather than assuming it: added
`test_day11_tushar_panel_verification.py`, which fails
`SentinelAgent.embed()` for real (mocked `nim_client.embed` raising, 3x,
distinct inputs so the cache can't hide a repeat failure) and confirms
`GET /api/circuit-status` shows NIM `OPEN` with the real exception
message as `last_failure` — and does the same for `TriageAgent.diagnose()`
with a mocked Nemotron 429, confirming both the Nemotron breaker opens
*and* the returned diagnosis carries `fallback_used: true,
fallback_origin: "groq"` (the data the Groq-fallback banner depends on).
Both pass. This closes the agent-to-registry half of the chain from
code; the registry-to-endpoint half was already closed on Shreshtha's
side. The only thing left is the browser-rendering step noted above —
genuinely visual, not a code gap.

One naming note: Shreshtha's guide describes the Groq fallback as a
*pulsing yellow halo on the Triage node in the Workflow DAG* — that
specific visual doesn't exist yet. It's not a Day-11 gap: the same
guide's own Day-12 section ("Fallback Indicators") lists building
exactly this halo as that day's work, so Day 11 verifying it against a
UI element Day 12 hasn't built yet is an ordering inconsistency in the
guide, not a missed task today. `TriageReportCard`'s existing "Fallback
Active" badge already surfaces the same underlying data in the interim.

### Real gaps found and fixed
1. **Bundle size was 852.93 kB minified, over the guide's 500 kB
   threshold.** `recharts` (used only by `SimilarityGraph`, which is
   hidden behind a toggle button, off by default) was bundled into the
   main chunk regardless. Code-split it via `React.lazy` + `Suspense` in
   `App.tsx` (also applied to `HealthIndicators`, same pattern) — main
   chunk dropped to 491.52 kB, with the 361 kB `recharts` chunk now only
   fetched if a user actually opens the Similarity Graph.
2. **`CircuitBreakerPanel`'s `ServiceCard` had no `React.memo`**, unlike
   `AgentOrb` and `AuditLogStream`'s `LogRow`, which the guide explicitly
   names alongside it. Since the panel polls every 2s and rebuilds the
   `services` array with fresh object references every time regardless
   of whether anything changed, a plain `memo()` would never have bailed
   out anyway (default shallow comparison fails on the new reference
   every poll) — added a custom comparator on the actual fields instead,
   so an unchanged card (the common case: usually 4 of 5 services are
   unchanged on any given poll) actually skips re-rendering.
3. **`AuditLogStream` failed the project's own lint config**
   (`react-hooks/set-state-in-effect`) on its auto-scroll effect, which
   called `setHasNew` synchronously alongside a DOM `scrollTo`. Traced
   the actual logic and found `hasNew` was never really derived from
   `entries` at all — the effect's condition only ever looked at
   `autoScroll`, making `hasNew` exactly equal to `!autoScroll` in every
   case. Replaced the state+effect with a plain derived `const hasNew =
   !autoScroll`, removing the lint violation and the redundant render
   pass at the same time, not just silencing the rule.
4. **`CircuitBreakerPanel`'s `DetailModal` had backdrop-blur but no
   Escape-to-close**, unlike `TriageReportCard`'s modal — the guide's
   polish checklist explicitly asks for both on every modal. Added the
   same `keydown` listener pattern `TriageReportCard` already uses.
5. **The "New events ↓" jump-to-bottom button in `AuditLogStream` had no
   hover state at all** — the guide's checklist item "ensure all buttons
   have hover states" was checked against every button in the dashboard;
   this was the one real miss (everything else either already had a
   hover class or inherited one from a hover-styled parent row). Added
   `hover:bg-amber-300 transition-colors`.

`npm run lint` and `npm run build` (`tsc -b && vite build`): clean, zero
errors. Full backend suite: 86 passed, 2 skipped.

### Verified, no fix needed
- Panel already polls the real endpoint every 2s, already overrides
  cuOpt to a static "Unused" card, already shows hover tooltips with
  last-failure reason/time on every card (Nipun's/Shreshtha's Day 6/11
  work) — all confirmed still correct.
- Screen-size and Chrome/Safari cross-browser testing from the guide's
  polish checklist are inherently manual/visual — noted, not something
  to fake a pass on from here.

## Day 12 Status — Report Card Backend, Chaos Testing, Fallback Indicators, Demo Script

**Scope:** all four Day-12 write-ups converge on one shared deliverable
— the Post-Heal Report Card and the fallback-visibility work underneath
it — plus two person-specific pieces (Nipun's chaos-scenario timing,
Nipun's demo script). Covered together since the backend metrics work
(Shreshtha) is a hard dependency for validating it (Nipun) and for what
the card eventually renders (Shreshtha).

### Shreshtha — Token Counter + Throughput Tracker + Report Card backend
New: `sentinel/metrics/{token_counter,throughput_tracker,report_card}.py`,
`GET /api/metrics/tokens`, `GET /api/metrics/throughput`, `GET /api/metrics`.
Per the guide's own critical note ("must be REAL, not hardcoded"):
- `time_to_detect`: real delta between a worker's LOOP_SUSPECTED and
  REMEDIATING/ESCALATED audit timestamps (DIAGNOSIS_COMPLETE itself is
  an EventBus event, not a persisted record — the transition it causes
  is the real, persisted proxy).
- `tokens_saved`: real Nemotron/Groq token usage now captured from each
  response's actual `usage.total_tokens` field; cache-hit savings
  estimated from the last real cost observed for that service (there's
  no response to measure on a hit — using a made-up constant would be
  less honest than reusing real, recently-observed data).
- `throughput_maintained`: tied to `OptimizationAgent`'s real solver
  output (`reroute_plans`), not the guide's illustrative 71%/97%
  narrative numbers — no item-processing pipeline exists in this
  codebase to measure "items/minute" against, so inventing one just to
  hit those exact figures would be fabricated data, not a real metric.
  Documented as a deliberate, honest scope decision in
  `sentinel/metrics/throughput_tracker.py`'s module docstring.
- `fixes_applied`/`escalations`/`fallbacks_triggered`: direct counts
  from the real audit log — no judgment calls needed.
- Soft-limit enforcement (guide's "force fallback methods" requirement):
  `TriageAgent.diagnose()` now skips Nemotron once its hourly token
  budget is exhausted, same as an open circuit breaker.

### Nipun — Fault Injection Testing (End-to-End)
**Real bug found by actually writing the end-to-end test, not assuming
it worked:** every one of the 4 fault types' synthetic log lines failed
to match `RuleBasedHeuristic`'s regex patterns at all — `fault_injection.py`
degraded to a bare keyword (e.g. `"Error: latency (fault: latency)"`)
instead of a real error message. Harmless whenever an LLM is reachable
(natural language parses fine), but if BOTH Nemotron and Groq are down
during a live demo — exactly the resilience path this test exists to
validate — every fault type would misdiagnose as "unknown" and escalate
with a useless diagnosis instead of one a human could actually act on.
Fixed: each `Fault` class now carries a realistic `log_message`; also
relaxed the SCHEMA_MISMATCH pattern to not require a literal "field"
prefix (real messages often just say "X not found"). Verified all 4
fault types now classify correctly end-to-end through the real
`/demo/inject` endpoint with Nemotron+Groq both mocked down (confidence
0.65 still correctly escalates rather than remediating — that's the
heuristic's own designed ceiling, not a bug — but the escalation now
carries an accurate diagnosis instead of "unknown"). Also fixed a real
test-isolation leak this same file introduced: one of its tests reaches
REMEDIATING against the shared production `RemediationAgent` singleton's
default (dead-in-this-environment) wrapper URL, which was tripping that
singleton's circuit breaker open and leaking into an unrelated, later
test file — added a reset fixture, same pattern as existing
`_reset_circuit_registry` fixtures elsewhere.

### Shreshtha — Fallback Indicators + Post-Heal Report Card shell
The dashboard already had full UI plumbing for a generic fallback badge
(`fallbackActive: boolean` in the Zustand store, rendered by AgentOrb/
WorkflowDAG/HealthIndicators) that nothing had ever set to `true` — real
backend data was never wired through. Replaced with `fallbackOrigin:
string | null` and wired it from the real `audit_event` stream, closing
2 real backend gaps found in the process:
1. `LOOP_SUSPECTED`'s audit record never carried which embedding source
   (NIM / sentence-transformers / hash) detected the loop — no signal to
   drive the Sentinel node's ring at all. `SentinelAgent` now tracks
   `last_embed_origin`; `detect_loop()`'s returned event carries it.
2. `on_optimization_complete`'s own docstring claimed it "writes it to
   the audit trail... same as every other real transition" — it never
   did, only logged to console. Optimization has no `WorkerState` of its
   own, so it now writes directly via `audit_logger` + broadcasts (not
   through `self.transition()`, which would enforce FSM legality against
   a state that doesn't apply here) using the worker's current state for
   both from/to — a side-channel event, not a fake FSM move.

Also closed a 3rd, smaller gap for consistency: the rule-based
heuristic's confidence (always 0.65) is always below the escalation
threshold, so `fallback_origin="rule_based_heuristic"` could only ever
occur on the ESCALATED (low-confidence) branch — which never forwarded
`fallback_origin` at all before this fix, meaning that value could never
actually reach the frontend.

Verified live against the real (non-mocked) backend, not just unit
tests: injected a real fault through a running `uvicorn` instance and
read the resulting audit log directly — confirmed `sentence-transformers`
(Sentinel), `or-tools` (Optimization), and `rule_based_heuristic` (Triage,
via the ESCALATED path) all appear correctly, end to end, with real NIM/
Nemotron/Groq calls genuinely failing in this environment (no API keys
configured) rather than being mocked to fail.

`PostHealReportCard.tsx`: modal shell per the guide (backdrop blur,
max-width 700px, Escape-to-close, 6 metrics in a grid, staggered
spring-physics animated counters). Backend wiring is explicitly Day 13
scope per the guide ("placeholder values for now") — a demo button
("Show Post-Heal Report Card") triggers it with placeholder data for
now, matching the existing "Show Mock Triage Card" pattern. Used a
custom canvas confetti burst instead of adding the `canvas-confetti`
dependency the guide names — it explicitly allows either, and a ~15KB
new dependency for one 2s effect isn't worth it. Lazy-loaded the new
component (same Day-11 pattern as SimilarityGraph/HealthIndicators) —
adding it pushed the main bundle to 505.74kB, back over the 500kB
threshold Day 11 fixed; lazy-loading brought it to 485.37kB.

Nipun's own guide separately describes her building a competing "Report
Card Modal" component — same class of duplicate-ownership inconsistency
as Day 11's Circuit Breaker Panel; Shreshtha's version is the one that
exists in the real codebase, consistent with that precedent.

### Nipun — Demo Script + validation
Wrote `docs/demo_script.md` — the 6-act narrative with exact timestamps
per the guide's template, using real, already-implemented UI copy
(toast text, button labels, modal titles quoted verbatim from the actual
code) rather than paraphrasing. Cross-checked the two integration points
the guide names:
- `ReportCardMetrics`' 6 fields (backend `report_card.py` vs frontend
  `PostHealReportCard.tsx`'s interface) match exactly — no drift.
- Nipun's chaos-scenario fix (above) and Shreshtha's metrics tests
  (above) both pass, reviewed as part of this same pass rather than as
  separate, redundant validation tests.

**Manual step (Nipun's guide's own critical note):** rehearsing the
script out loud at least once — reading timing back to a teammate is
how an awkward beat or a narration line that runs long gets caught, and
that can't be done from here.

Full backend suite: 110 passed, 2 skipped. Dashboard: clean
`npm run lint` and `npm run build`, main bundle 485.37kB (under the
500kB threshold).

## Day 13 Status — Report Card Backend Wiring, Wrapper Stress Test, Backup Plans, Timing Lock

**Scope:** Nipun's and Shreshtha's individual guides both assign the
exact same wrapper stress test (same command, same targets) — the same
duplicate-ownership pattern seen on Days 11-12 — run once for real
rather than twice. Nipun's guide also separately claims she completes
"Report Card Modal... backend wiring," which is the same component
Shreshtha already owns (`PostHealReportCard.tsx`, built Day 12); that
wiring is covered under Shreshtha's section below, not duplicated.

### Shreshtha — Report Card Backend Wiring + Animation Polish
`App.tsx`'s `state_change` handler now fetches `GET /api/metrics` and
populates `PostHealReportCard` for real when `trigger_event ===
"REMEDIATION_SUCCESS"` arrives — the exact event the guide names,
reusing the same "react to the event that caused the change" pattern
Day 10's Triage Report Card auto-open already established. Verified
live against a real (non-test) backend: connected a raw WebSocket
client, injected a real fault, and confirmed `state_change` events
deliver correctly in real time end-to-end.

Two real animation gaps found while cross-checking the demo script's
Act 2 against actual code (not assumed correct): the toast had **no
animation at all** (plain conditional render, guide names an explicit
0.3s slide-in), and the BREAK IT button's press animation used Tailwind's
default 150ms transition instead of the spec'd 0.1s. Both fixed. Full
timing cross-check (every act, verified against real code, not copied
from the guide unverified) documented in the new `docs/demo_timing.md` —
including one gap NOT fixed today: the demo script's Acts 1/3/5 all
narrate a persistent live throughput counter that doesn't exist as a
standalone UI element anywhere except inside the Post-Heal Report Card
(only visible at the very end). Flagged rather than built unasked —
it's real new UI work, not "polish" or "timing lock."

### Shreshtha + Nipun — Wrapper Stress Test + Performance Tuning
Ran for real, not simulated: 40 concurrent `/v1/remediate` requests
against a live `wrapper_service.py` (mock mode). **Normal load**: 40/40
succeeded, P50/P95/P99 all ~2.05s (well under the 3s/8s/15s targets),
memory/swap flat before vs. after. **The guide's other requirement —
"verify auto-fallback triggers for timed-out requests" — needed an
actual timeout to happen**, which the mock wrapper can't produce via
its request parameters (fixed 2s delay, always succeeds). Made
`RemediationAgent`'s previously-hardcoded 30s timeout a constructor
parameter specifically to test this for real (not mocked): 40
concurrent calls with a 1s client timeout against the real (still 2s)
wrapper — all 40 genuinely timed out and all 40 correctly returned
`mode: "timeout", flagged: True`, zero crashes, circuit breaker
correctly opened afterward. Full results, including the environment
caveat (this machine has 7.5GB RAM, not the guide's assumed 16GB, and
swap was already near its cap before either test — noted since it
affects how these numbers compare to a run on different hardware) in
the new `docs/stress_test_results.md`.

Performance tuning applied, each verified real and re-tested rather
than assumed safe:
1. Removed `--reload` from `backend/Dockerfile`'s CMD — a dev-only
   flag with real overhead that has no business in the demo image.
2. **Deliberately did not add `--workers N>1`** — `SentinelAgent`,
   `TriageAgent`'s circuit breakers, both caches, `circuit_registry`,
   and `TokenCounter` are all in-memory singletons at module scope;
   multiple worker processes would each get an independent copy of
   every one of them, silently breaking the shared-state model a
   dashboard client depends on. Explicitly staying at 1 worker is the
   correct call given this architecture, not an oversight.
3. `RemediationAgent` was opening and closing a brand-new
   `httpx.AsyncClient` (and a new TCP connection) on every single
   `remediate()` call, defeating connection pooling/keep-alive
   entirely. Now holds one persistent client for its lifetime. Re-ran
   both stress tests after this change to confirm no regression.

Documented, not fixed: `TriageAgent.diagnose()` and the Nemotron/Groq/
NIM clients underneath it make synchronous, blocking HTTP calls from
inside code invoked from an async context — a slow real LLM response
would block the whole event loop. Real, but fixing it means converting
three client classes (and their existing test suites, which mock them
synchronously) to async for a condition that doesn't show up in the
demo's actual usage pattern (one fault injection, not 40 concurrent
Triage calls) — noted as a Phase 2 concern rather than over-fixed this
close to demo day.

### Nipun — Backup Plan Documentation
Wrote `docs/backup_plans.md` — Plans A/B/C per the guide's template,
with Plan B's "auto-fallback in <5s" claim backed by today's actual
stress test numbers rather than asserted on faith. Plan C (mock-mode
video) correctly deferred to Shreshtha's Day 14, per the guide.

### Manual steps (all four guides converge on the same one)
Every guide's real Day-13 blocker is the same: **rehearse with the team,
out loud, timing every beat against Nipun's narration** (Nipun's guide:
"rehearsed 3+ times"; Shreshtha's guide: "final run-through with Nipun
narrating... if timing is off, adjust and re-test until perfect"). That
can't be done from here — it requires an actual person speaking and a
teammate operating the dashboard in response, in real time. Everything
each guide assigned that could be verified from code, a real running
server, or a document has been; this rehearsal is the one genuine
gate before Day 14.

Full backend suite: 111 passed, 2 skipped. Dashboard: clean
`npm run lint` and `npm run build`, main bundle 485.58kB.

## Day 14 Status — Demo Day Rehearsal support

**Scope:** Day 14 across all four guides is overwhelmingly a live,
multi-person, multi-machine rehearsal (Nipun narrating, Shreshtha
hosting, Shreshtha operating the dashboard, Nipun monitoring) — none of
that is something to build. Two genuinely scriptable gaps existed in
the guides' pre-demo checklists, both closed:

### `scripts/verify_audit_chain.py` (Nipun)
Her checklist names "Hash chain verification script passes" as a
pre-demo check, but no standalone script existed — `verify_chain()` was
only ever called from inside the test suite. Built one: loads the real
audit log via `TrustChainLogger`, reports PASS/FAIL, and on failure
walks the chain independently to report exactly which record (line,
worker_id, timestamp) broke it — a bare bool wouldn't be enough to
debug anything 30 minutes before a demo.

**Running it immediately found a real, reproducible chain fork** — not
a hypothetical. Root-caused properly rather than assumed: wrote a
targeted repro driving genuine concurrent multi-worker dispatch through
the real `Orchestrator`/`OptimizationAgent` (the actual "Day 5
concurrency guarantee" pattern) with an artificial delay to force a real
`await` gap — that repro produced a **valid** chain, ruling out an
async/concurrency bug in the application code itself. The real cause:
`test_orchestrator.py`'s `orchestrator` fixture, and two tests in
`test_day12_shreshtha_metrics.py`, constructed `Orchestrator()` without
passing `audit_logger=...` — silently falling through to the same
*default* file the real `fault_injection._orchestrator` singleton also
writes to. That singleton caches its own `previous_hash` in memory and
has no way to know another instance advanced the file's actual tail in
the meantime — so its next write forks. Not a production bug (there's
only ever one real Orchestrator instance in the actual app), but a real
test-isolation gap, same class as the Day 9 port race and Day 12
circuit-breaker leak. Fixed both call sites to use `tmp_path`-isolated
loggers like every other test already does; confirmed with 4 consecutive
full suite runs, chain intact every time. The corrupted local
`audit_logs/audit.jsonl` (gitignored, never committed — purely this
machine's accumulated test/rehearsal noise) was archived, not deleted,
each time it was found broken.

### `scripts/pre_demo_check.py` (Shreshtha + Nipun)
Both guides list an overlapping set of "run this 30-60 min before demo"
checks. Consolidated the ones that are genuinely server-side/scriptable
into one script, run for real against live backend + wrapper processes:
`/health`, WebSocket reachability, `/demo/inject`, `/api/circuit-status`
(presence of all 5 services — not their color), `/api/metrics`, audit
log is non-empty, the hash chain script above, wrapper `/v1/status`, and
one real `/v1/remediate` call. All 9 passed on a clean run. The script
also prints, rather than silently omits, the checklist items that are
inherently visual and can't be scripted (Similarity Graph rendering,
Circuit Breaker Panel dot *colors*, Health Indicators, Audit Log Stream,
Report Card modal) — a script claiming to verify those without a real
browser would be a false assurance, not a real check.

### Everything else — genuinely manual
Full dress rehearsal, backup-plan live test (kill NemoClaw mid-run,
confirm the team reacts correctly), the 30s mock-mode backup video,
1-hour stability soak with `htop`, and final DevTools checks all require
an actual browser, actual screen recording, actual multiple people on
actual separate machines. Nothing here was skipped by oversight — it's
categorically outside what a single assistant session can do, and no
guide assigns it as anything other than a live team exercise.

Full backend suite: 111 passed, 2 skipped (verified across 4 consecutive
runs for the audit-chain fix specifically). Dashboard: clean
`npm run lint` and `npm run build`.

## Day 15 Status — Polish, Documentation & v1.0 (Phase 1 complete)

**Scope:** all four guides converge on one shared deliverable set —
README, API docs, architecture diagrams, resume bullets, two grep
verifications, a clean-machine docker-compose test, and the v1.0 tag —
plus one person-specific piece (Shreshtha's dashboard code cleanup).

### Verification greps
Zero `agentiq` matches anywhere. Zero real `openai` matches — the two
textual hits (`token_counter.py`'s "OpenAI-compatible" comment describing
API shape, and Groq's own real endpoint path
`api.groq.com/openai/v1/...`) are both legitimate; neither is a leftover
reference to actually using OpenAI's service, and no `openai` package
appears in any requirements file.

### Shreshtha — dashboard code cleanup
Removed the two plain `console.log` calls that weren't error/warning
diagnostics (kept every `console.warn`/`console.error`, which are real
diagnostic signal, not debug noise). `tsc --noEmit` and
`eslint src/ --ext .ts,.tsx` both already ran clean. The "mock dev
toolbar buttons" the guide names ("Show Mock Triage Card", "Show
Fallback Variant", "Show Post-Heal Report Card") were hidden behind a
new `VITE_DEBUG_CONTROLS` flag rather than deleted — they're Day 13's
documented Backup Plan mechanism, and removing them outright would have
regressed that.

### Docker-compose clean-build test (Shreshtha's blocker, run for real)
Ran `docker compose --profile full-stack build` and `up` for real, not
assumed. Two genuine findings:
1. **Build succeeded but took 10:12**, 12 seconds over the guide's
   <10-minute target — dominated by installing torch/transformers/
   sentence-transformers (~191s alone). Real number from this machine;
   not fabricated to fit the target.
2. **The backend container failed to start on the first attempt** —
   `SentenceTransformer("all-MiniLM-L6-v2")` downloads from
   huggingface.co at process-startup time (no weights baked into the
   image), and that hostname failed to resolve from inside a container
   in this environment specifically (confirmed by testing: Docker Hub
   itself resolved fine from a throwaway container, `huggingface.co`
   didn't — and the same hostname resolved fine from the host directly,
   outside Docker). Fixed by adding explicit DNS servers
   (`dns: [8.8.8.8, 1.1.1.1]`) to the backend service in
   `docker-compose.yml` — confirmed by rebuilding and re-testing: all 3
   containers started, and a real fault injection ran end-to-end through
   the actual containerized stack (not the bare-metal dev setup used for
   every previous day's testing).

Full findings, plus the architectural question this surfaced (eager
model loading gives a *fallback* the same network dependency as the
thing it's supposed to fall back from) in the README's Future Work
section.

### Documentation written
- `README.md` — full rewrite: architecture/workflow/fallback-chain/data-flow
  diagrams (Mermaid, each one individually rendered with `mermaid-cli`
  to confirm it actually parses, not just visually inspected — found
  and fixed 2 real syntax errors this way: a `par` block missing its
  `and` separator, and a participant alias `Opt` colliding with
  Mermaid's reserved `opt` keyword), setup instructions, project
  structure, API summary, team, known limitations, and Future Work.
- `docs/architecture.md` — the full diagram set the README summarizes.
- `docs/api_reference.md` — every real endpoint (backend + wrapper +
  WebSocket envelope), every example response captured from an actual
  running instance, not guessed.
- `docs/resume_bullets.md` — all 4 people, cross-checked against what's
  actually in the repo.
- `docs/release_notes_v1.0.md` — drafted for the GitHub release; not
  published (that's the tag push, see below).
- `dashboard/README.md` — setup, component table, remote-backend
  connection steps, demo flow, troubleshooting table.
- `docs/assets/hero-animation.svg` — a real, custom-built animated SVG
  (SMIL, no external dependency) showing the FSM's actual state colors
  cycling through a healing loop. Not a fabricated demo recording —
  this repo has no actual screen capture of a live demo run to show,
  and claiming otherwise would be dishonest; the animation is clearly
  a diagram, not a recording.

### v1.0 tag — prepared, not pushed
Per this session's standing convention, all commits/tags/pushes are the
user's own action. Prepared and left ready:
```
git tag -a v1.0 -m "Phase 1 complete"
git push origin v1.0
```
Release notes drafted in `docs/release_notes_v1.0.md`, ready to paste
into the GitHub release UI after the tag is pushed.

Full backend suite: 111 passed, 2 skipped. Dashboard: clean
`npm run lint` and `npm run build`, bundle 484.60kB. All 7 Mermaid
diagrams individually validated. Real docker-compose clean-build +
full-stack-up + end-to-end fault injection all confirmed working.
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
with Optimization Agent dispatched genuinely in parallel (not stubbed —
confirmed via test_optimization_and_triage_dispatch_in_parallel).

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

New coverage added: `wrapper/tests/test_nemoclaw_adapter.py` (5 tests,
all passing), exercising `real/nemoclaw_adapter.py` and the wrapper's
`/v1/remediate` + `/v1/status` HTTP contract directly, using real killable
OS subprocesses standing in for the nemoclaw CLI (not mocked coroutines) —
kills propagate through asyncio's subprocess machinery exactly as they
would for a real nemoclaw process:

| Test | Result |
|---|---|
| `nemoclaw` binary missing (real condition on this host) → mock fallback, contract intact | ✅ PASS |
| **Killed mid-request → mock fallback** | ✅ PASS — measured **0.303s** (blocker: <5s), returncode `-9` (SIGKILL) correctly routed to the fallback branch |
| Non-zero exit (no kill) → mock fallback | ✅ PASS |
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
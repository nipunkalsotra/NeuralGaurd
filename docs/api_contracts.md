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

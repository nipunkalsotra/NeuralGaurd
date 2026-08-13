# API Reference

Every example below is a real captured response from the running
services (backend on `:8000`, wrapper on `:8081`), not a guessed shape —
verified live during Day 15's clean docker-compose test, not copied
from planning docs.

## Backend — `http://localhost:8000`

### `GET /health`
Liveness check.

```json
{"status": "ok"}
```

### `POST /demo/inject`
Injects a synthetic fault into a worker, driving the real detection →
diagnosis → remediation → optimization pipeline end-to-end (not a fake
broadcast — this genuinely publishes onto the same `EventBus` the
Orchestrator and OptimizationAgent subscribe to).

**Request**
```json
{
  "target": "worker-3",
  "fault_type": "schema_corruption",
  "payload": { "field": "Tax_ID" }
}
```

`fault_type` — one of `schema_corruption`, `latency`, `error_signature`,
`resource_pressure`. `payload` is fault-specific:

| fault_type | payload fields |
|---|---|
| `schema_corruption` | `field` (default `"Tax_ID"`) |
| `latency` | `delay_ms` (default `5000`) |
| `error_signature` | `error` (default `"Tax_ID not found"`) |
| `resource_pressure` | `memory_mb` (default `512`) |

**Response**
```json
{
  "injected": true,
  "target": "worker-3",
  "fault_type": "schema_corruption",
  "timestamp": "2026-08-13T10:26:59.912371+00:00",
  "details": { "removed_field": "Tax_ID", "loop_detected": true }
}
```

### `GET /api/circuit-status`
Per-service circuit breaker state — what `CircuitBreakerPanel.tsx`
polls every 2s.

```json
{
  "services": [
    { "service": "NIM", "status": "CLOSED", "failure_count": 0, "last_failure": null },
    { "service": "Nemotron", "status": "CLOSED", "failure_count": 0, "last_failure": null },
    { "service": "cuOpt", "status": "CLOSED", "failure_count": 0, "last_failure": null },
    { "service": "Groq", "status": "CLOSED", "failure_count": 0, "last_failure": null },
    { "service": "NemoClaw", "status": "CLOSED", "failure_count": 0, "last_failure": null }
  ]
}
```
`status` is `CLOSED` (healthy) / `OPEN` (failing, 60s cooldown) /
`HALF_OPEN` (probing after cooldown). cuOpt is always rendered as a
static "Unused" card by the dashboard regardless of this value — it's
skipped project-wide, see `docs/architecture.md` §4.

### `GET /api/metrics`
The Post-Heal Report Card's data source — real aggregation from the
audit log + live `OptimizationAgent` output, not hardcoded (see
`sentinel/metrics/report_card.py`).

```json
{
  "time_to_detect": 0.8,
  "tokens_saved": 12,
  "throughput_maintained": 97.0,
  "fixes_applied": 1,
  "escalations": 0,
  "fallbacks_triggered": 1
}
```

### `GET /api/metrics/tokens`
```json
{
  "usage": [
    { "agent": "TriageAgent", "service": "Nemotron", "hour": 476532, "tokens": 340, "over_budget": false }
  ],
  "hourly_budget": 100000,
  "total_saved": 180
}
```

### `GET /api/metrics/throughput`
```json
{ "throughput_pct": 100.0 }
```

### `WebSocket /ws/stream`
Locked envelope schema — full spec in `docs/websocket_schema.md`.
Every message shares one shape regardless of `type`:

```json
{
  "type": "state_change",
  "event_type": "LOOP_SUSPECTED",
  "worker_id": "worker-3",
  "payload": "{\"from_state\":\"HEALTHY\",\"to_state\":\"LOOP_SUSPECTED\",\"trigger_event\":\"LOOP_SUSPECTED\"}",
  "timestamp": "2026-07-27T14:32:00.000Z"
}
```
`type` is one of `stdout` / `stderr` / `mock_banner` / `state_change` /
`audit_event` (plus `ping`/`pong`/`error` for the control plane).
`payload` is always a JSON-stringified string, never a nested object.

## Wrapper — `http://localhost:8081`

### `GET /v1/status`
```json
{ "status": "ok", "mode": "mock" }
```
`mode` is `mock` or `nemoclaw`, set via the `NEMOCLAW_MODE` env var.

### `POST /v1/remediate`
Called by `RemediationAgent` — never called directly by the dashboard.

**Request**
```json
{
  "patch": "Make field 'Tax_ID' optional with default null",
  "test_fixture": "default_fixture.json",
  "worker_id": "worker-3"
}
```

**Response**
```json
{
  "verified": true,
  "output": "Patch 'Make field '\''Tax_ID'\'' optional with default null' applied and verified successfully (mock mode).",
  "sandbox_log": "[MOCK] ✓ Active gateway set to 'nemoclaw'\n[MOCK] Sandbox: ai-factory-sentinel-mock\n...",
  "mode": "mock",
  "flagged": false
}
```
`mode` — `mock` (wrapper's own fallback), `nemoclaw` (real CLI
succeeded), `timeout` / `error` / `unavailable` (the agent-level
`RemediationAgent` fallback states, added on top of the wrapper's
response — see `sentinel/agents/remediation_agent.py`).

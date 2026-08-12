# WebSocket Stream Schema — `/ws/stream`

**Owner:** Shreshtha (Person 3)
**Consumer:** Tushar (Person 4) — dashboard WebSocket client
**Status:** DRAFT — lock by Day 7. Do not change field names/types after lock without a standup sync; Tushar's components bind directly to this shape.

---

## 1. Envelope (every message sent over the socket)

Every message — from backend to dashboard, in either direction — is a single JSON object with this shape:

```json
{
  "type": "stdout",
  "event_type": "sandbox_output",
  "worker_id": "worker-3",
  "payload": "Running patch against synthetic fixture...",
  "timestamp": "2026-07-27T14:32:01.123Z"
}
```

| Field        | Type   | Required | Description                                                                 |
|--------------|--------|----------|-------------------------------------------------------------------------------|
| `type`       | string | yes      | Top-level message kind. One of the enum values below. Drives which dashboard component renders it. |
| `event_type` | string | yes      | Sub-classification within `type`, used for routing to the right handler/component. Free-ish string, but keep it snake_case and stable (see §3). |
| `worker_id`  | string | yes      | Which worker this message concerns (e.g. `"worker-3"`). Use `"system"` for messages not tied to a specific worker (e.g. circuit breaker status). |
| `payload`    | string | yes      | The actual content. Always a **string** at this layer — if the content is structured (e.g. a diagnosis JSON), it is JSON-**stringified** into this field, not nested as an object. This keeps the envelope parsing trivial and consistent regardless of payload shape. See §4 for per-type payload shapes. |
| `timestamp`  | string | yes      | ISO 8601, UTC, millisecond precision. Format: `YYYY-MM-DDTHH:MM:SS.sssZ`. Generated server-side at emit time, not client-side. |

### Why `payload` is always a string
Different `type`s need very different payload shapes (raw CLI text vs. structured JSON vs. a bare state name). Rather than making the envelope's shape conditional on `type` (which makes Tushar write different parsers per message), we keep the envelope **fixed** and let each `type` define what's *inside* the string. Dashboard components `JSON.parse()` the payload only when they know it's structured (see §4).

---

## 2. `type` enum (top-level, drives component routing)

| `type`         | Meaning                                                              | Rendered by (dashboard)      |
|----------------|-----------------------------------------------------------------------|-------------------------------|
| `stdout`       | Line(s) of stdout from the NemoClaw CLI subprocess                   | Sandbox Terminal              |
| `stderr`       | Line(s) of stderr from the NemoClaw CLI subprocess                   | Sandbox Terminal (styled red) |
| `mock_banner`  | Wrapper has fallen back to mock mode for this job                    | Sandbox Terminal banner + Circuit Breaker Panel |
| `state_change` | Orchestrator FSM transition (e.g. `HEALTHY` → `LOOP_SUSPECTED`)      | Workflow DAG, Health Indicators |
| `audit_event`  | Immutable audit log record (mirrors what's written to `audit_logs`)  | Audit Log Stream              |

Additional control-plane types (not part of the Day 3 contract, already implemented in the websocket skeleton — documented here for completeness):

| `type`  | Meaning              |
|---------|----------------------|
| `ping`  | Client keepalive     |
| `pong`  | Server keepalive ack |
| `error` | Malformed message / unknown type sent by client |

---

## 3. `event_type` values (routing key within a `type`)

| `type`         | `event_type` values                                                                 |
|----------------|----------------------------------------------------------------------------------------|
| `stdout`       | `sandbox_output`                                                                        |
| `stderr`       | `sandbox_output`                                                                         |
| `mock_banner`  | `fallback_activated`, `fallback_reset`                                                  |
| `state_change` | `HEALTHY`, `LOOP_SUSPECTED`, `DIAGNOSING`, `REMEDIATING`, `VERIFYING`, `RESUMED`, `ESCALATED`, `MOCK_VERIFICATION` (the **new** state being entered) |
| `audit_event`  | `transition_logged`                                                                      |

---

## 4. `payload` shape per `type` (JSON-stringified into the `payload` field)

### `stdout` / `stderr`
```json
"Running patch against synthetic fixture...\n"
```
Plain text, not JSON. Pass through raw CLI output line-by-line or in small chunks — do not buffer the entire run before sending (defeats the point of streaming to the terminal UI).

### `mock_banner`
```json
"{\"reason\": \"nemoclaw_cli_failed\", \"message\": \"Sandbox auto-fallback active — demo continuing with simulated execution.\"}"
```
Parsed shape (after `JSON.parse(payload)`):
```json
{ "reason": "nemoclaw_cli_failed", "message": "Sandbox auto-fallback active — demo continuing with simulated execution." }
```

### `state_change`
```json
"{\"from_state\": \"LOOP_SUSPECTED\", \"to_state\": \"DIAGNOSING\", \"trigger_event\": \"DIAGNOSIS_STARTED\"}"
```

### `audit_event`
```json
"{\"from_state\": \"HEALTHY\", \"to_state\": \"LOOP_SUSPECTED\", \"trigger_event\": \"LOOP_SUSPECTED\", \"agent_name\": \"SentinelAgent\", \"confidence_score\": null, \"fallback_used\": false, \"fallback_origin\": null, \"root_cause\": null, \"fix_type\": null, \"affected_field\": null, \"previous_hash\": \"a1b2...\", \"current_hash\": \"c3d4...\"}"
```
Mirrors the audit log record structure defined in the master doc §5.3 — same field names, so Tushar can reuse one type definition for both the live stream and any historical audit log fetch.

**Day 10 addition (additive, non-breaking):** `root_cause`, `fix_type`,
`affected_field` — null on every transition except the one into
`REMEDIATING` or `ESCALATED` (where Triage's diagnosis actually exists).
This closes a real gap found during team-wide integration: the Triage
Report Card only ever opened from two manual demo buttons, never from
live backend data, because no broadcast carried the full diagnosis.
Reusing the already-broadcast `audit_event` for the DIAGNOSING→REMEDIATING
transition (rather than inventing a new locked `type`) keeps this
backward-compatible — old clients that don't read these three new keys
are unaffected.

---

## 5. Example message sequence (one healing cycle, abbreviated)

```jsonc
{"type": "state_change", "event_type": "LOOP_SUSPECTED", "worker_id": "worker-3", "payload": "{\"from_state\":\"HEALTHY\",\"to_state\":\"LOOP_SUSPECTED\",\"trigger_event\":\"LOOP_SUSPECTED\"}", "timestamp": "2026-07-27T14:32:00.000Z"}
{"type": "audit_event", "event_type": "transition_logged", "worker_id": "worker-3", "payload": "{...}", "timestamp": "2026-07-27T14:32:00.010Z"}
{"type": "stdout", "event_type": "sandbox_output", "worker_id": "worker-3", "payload": "nemoclaw sandbox exec --patch '...'\n", "timestamp": "2026-07-27T14:32:05.200Z"}
{"type": "stderr", "event_type": "sandbox_output", "worker_id": "worker-3", "payload": "WARN: image cache miss, pulling...\n", "timestamp": "2026-07-27T14:32:06.500Z"}
{"type": "mock_banner", "event_type": "fallback_activated", "worker_id": "worker-3", "payload": "{\"reason\":\"nemoclaw_cli_failed\",\"message\":\"...\"}", "timestamp": "2026-07-27T14:32:36.500Z"}
{"type": "state_change", "event_type": "RESUMED", "worker_id": "worker-3", "payload": "{\"from_state\":\"VERIFYING\",\"to_state\":\"RESUMED\",\"trigger_event\":\"REMEDIATION_SUCCESS\"}", "timestamp": "2026-07-27T14:32:40.000Z"}
```

---

## 6. Backend implementation note

The Day 2 `websocket.py` router skeleton (`route_message`) currently dispatches on a bare `type` field for **inbound** client messages (`ping`/`pong` only, so far). This schema governs **outbound** server→dashboard broadcasts via `manager.broadcast(...)`. Both directions share the same envelope shape for simplicity — Tushar's client and this backend can use one shared type definition.

## 7. Sign-off

- [x] Shared with Tushar in standup — Day 3
- [x] Tushar acknowledges he can build Triage Report Card / Sandbox Terminal / Audit Log Stream against this shape
- [x] Locked (no breaking changes without team sync) — Day 7, confirmed 2026-07-28

**Status: LOCKED — Day 7 ✅**
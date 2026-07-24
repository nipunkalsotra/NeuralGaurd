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

# Caching Strategy Schema
**Owner:** Nipun | **Locked:** Day 4 | **Implemented by:** Shreshtha (Day 8, wired into backend)

Two in-memory caches reduce redundant API calls to NIM/Nemotron/Groq.
Both already exist as classes in `backend/sentinel/cache/` and are wired
into their respective agents. This doc defines their contract for when
Shreshtha integrates them into the production backend flow on Day 8.

---

## Embedding Cache
**File:** `sentinel/cache/embedding_cache.py`
**Used by:** `SentinelAgent.embed()` — wired in Day 1

| Field | Type | Description |
|---|---|---|
| Key | `string` | SHA-256 hash of the output text being embedded |
| Value | `list[float]` | The embedding vector |
| TTL | `3600s` (1 hour) | |
| `fallback_origin` | `"NIM"` \| `"sentence-transformers"` \| `"hash"` | Which method produced this embedding |

### Behavior
- Cache checked first, before any API call.
- On miss: tries NIM → sentence-transformers → hash exact-match, in order.
- On hit: returns cached embedding immediately, zero API calls.

---

## Diagnosis Cache
**File:** `sentinel/cache/diagnosis_cache.py`
**Used by:** `TriageAgent.diagnose()` — wired in Day 4

| Field | Type | Description |
|---|---|---|
| Key | `string` | SHA-256 hash of `(last_50_log_lines + error_signature)` |
| Value | `dict` | Full diagnosis JSON: `{root_cause, fix_type, affected_field, confidence, fallback_used}` |
| TTL | `1800s` (30 minutes) | |
| `fallback_origin` | `"nemotron"` \| `"groq"` | Which LLM produced this diagnosis |

### Behavior
- Cache checked first, before any LLM call.
- On miss: tries Nemotron → Groq, in order (rule-based heuristic fallback is a Day 3+ TODO, not yet cached).
- On hit: returns cached diagnosis immediately, zero API calls.

---

## Shared Interface
Both caches expose the same two methods:

```python
cache.get(key: str) -> value | None   # None if missing or expired
cache.set(key: str, value, fallback_origin: str = "...") -> None
```

Internally: `{key: (value, expires_at, fallback_origin)}`, expiry checked lazily on `get()`.

## Notes for Shreshtha (Day 8 integration)
- Both caches are currently **in-memory, per-process** — they reset if the
  backend restarts. Persistence across restarts is a Phase 2 concern
  (see master doc Section 20), not in scope for Day 8.
- Cache hit means **zero API call**. Dashboard could show a subtle
  "cached" indicator using `fallback_origin` if useful for demo polish —
  not required, just a nice-to-have if time allows.
- No cache invalidation beyond TTL expiry — deliberately simple for
  Phase 1 scope, matches master doc's "production-grade patterns, not
  production-ready system" framing.

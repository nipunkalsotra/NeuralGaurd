# AI Factory Sentinel — Dashboard

React 18 + Vite + TypeScript control plane for the self-healing
orchestrator. Renders live agent state, audit trail, circuit breakers,
sandbox output, and the post-heal report card — all driven off one
WebSocket connection to the backend, with manual demo controls as an
offline fallback.

## Setup

```bash
npm install
npm run dev        # starts Vite dev server on :3000
```

### Environment variables

Copy the pattern already in `.env.local` (gitignored — each machine's
own):

```bash
VITE_WS_URL=ws://localhost:8000/ws/stream
VITE_BACKEND_URL=http://localhost:8000
```

Point these at a remote backend's LAN IP instead of `localhost` to
connect to a teammate's machine (see "Connecting to a remote backend"
below). If `VITE_WS_URL` is unset, the dashboard runs with its manual
demo buttons as the only way to see state changes — no automatic mock
feed fights with them for the same UI state.

Optional: `VITE_DEBUG_CONTROLS=true` re-enables the 3 "Show Mock ..."
buttons in the header (hidden by default since Day 15 — they're a
rehearsal/backup-plan tool, not something that belongs in the live
demo's UI).

## Component architecture

| Component | Responsibility |
|---|---|
| `App.tsx` | Owns the WebSocket connection, routes `state_change`/`audit_event` messages into the Zustand store, renders the BREAK IT control and toast |
| `views/WorkflowDAG.tsx` | React Flow graph of the 5 agents, edges animate on the active FSM transition |
| `components/AgentOrb.tsx` | Individual agent node — state-colored glow, fallback ring + badge (Groq/sentence-transformers/OR-Tools/mock) |
| `views/HealthIndicators.tsx` | Compact per-agent status grid, same fallback styling as `AgentOrb` |
| `views/SimilarityGraph.tsx` | Recharts line chart of embedding similarity over time, 0.92 threshold line |
| `components/AuditLogStream.tsx` | Real-time hash-chained audit feed, filterable by agent |
| `components/CircuitBreakerPanel.tsx` | Polls `/api/circuit-status` every 2s, 5 services, hover detail, click-through modal |
| `components/SandboxTerminal.tsx` | Live NemoClaw CLI stdout/stderr stream, `[MOCK MODE]` banner |
| `components/TriageReportCard.tsx` | Opens automatically on a real diagnosis (`audit_event` with `root_cause`), or via the debug buttons |
| `components/PostHealReportCard.tsx` | Fetches `/api/metrics` on `REMEDIATION_SUCCESS`, animated counters + confetti |
| `store/dashboardStore.ts` | Zustand store — per-agent FSM state, fallback origin, active edge |
| `hooks/useWebSocket.ts` | Reusable WS hook with reconnect + optional mock-fallback generator |

State flow: **WebSocket message → `App.tsx` handler → Zustand store
action → React re-render** in whichever components subscribe to that
slice of the store. `CircuitBreakerPanel` and `PostHealReportCard` are
the two exceptions — they poll/fetch their own REST endpoints directly
rather than going through the WebSocket, since their data isn't part
of the FSM transition stream.

## Connecting to a remote backend

If the backend is running on a teammate's machine instead of
`localhost` (the actual Day 9-14 rehearsal setup — Shreshtha hosts,
everyone else connects over LAN):

1. Get that machine's LAN IP (`ip addr show` on Linux, or `ifconfig` /
   System Settings → Wi-Fi on Mac).
2. Set `.env.local`:
   ```bash
   VITE_WS_URL=ws://<their-ip>:8000/ws/stream
   VITE_BACKEND_URL=http://<their-ip>:8000
   ```
3. Restart `npm run dev` (Vite only reads `.env.local` at startup).
4. If the machine changes networks (moved laptop, different Wi-Fi),
   the IP likely changed too — repeat step 1-3.

## Demo flow

1. `npm run dev`, open `http://localhost:3000`.
2. Confirm all 5 agent orbs are green (HEALTHY) and the Circuit Breaker
   Panel shows all 5 services (cuOpt always renders as a static
   "Unused" card).
3. Click **BREAK IT** — injects a real `schema_corruption` fault on
   `worker-3` via `POST /demo/inject`.
4. Watch the Workflow DAG animate through the FSM live: Sentinel
   (amber) → Triage (blue, Report Card opens automatically) →
   Remediation (orange → purple) → back to green (RESUMED), or the
   Triage node stays highlighted with an ESCALATED badge if confidence
   was too low to auto-remediate.
5. Post-Heal Report Card opens automatically on `RESUMED` with real
   metrics from `/api/metrics`.
6. If the live backend is unreachable, the manual buttons (enable with
   `VITE_DEBUG_CONTROLS=true`) drive the same UI with placeholder data
   — this is Day 13's documented Backup Plan mechanism, not a
   workaround.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Nothing updates after BREAK IT | `VITE_WS_URL` unset, or points at the wrong IP | Check browser console for a WS connection error; verify the backend's `/health` responds from this machine |
| CORS error in console | Dashboard origin not in the backend's `allow_origins` list | Add it in `backend/api/main.py`'s `CORSMiddleware` config |
| WebSocket connects then immediately drops | Backend restarted (e.g. `--reload` picked up a file change) | Reconnect is automatic; if it doesn't recover, refresh the page |
| Circuit Breaker Panel always says "(offline)" | `VITE_BACKEND_URL` wrong, or backend not running | `curl $VITE_BACKEND_URL/health` from the dashboard machine to confirm reachability |
| Audit Log Stream shows fake-looking short hashes | That's the local mock generator — it runs automatically when the WS is disconnected and stops as soon as it reconnects | Not a bug; confirms the offline fallback is active |
| Bundle warning about chunk size on `npm run build` | `SimilarityGraph` (recharts) and `PostHealReportCard` are intentionally lazy-loaded to stay under it — check `App.tsx`'s `lazy()` imports are still in place | See `docs/api_contracts.md`'s Day 11/12 notes |

## Testing

```bash
npm run build   # tsc -b && vite build — must be zero TypeScript errors
npm run lint    # eslint . — must be zero errors
```

No dedicated component test suite exists yet — see the main
[README](../README.md)'s Future Work section.

# AI Factory Sentinel — Dashboard

Real-time React control plane for the self-healing agentic workflow orchestrator.

## Run locally

```bash
npm install
npm run dev
```
Opens on `http://localhost:3000`.

## WebSocket connection

Configured via `.env.local` (gitignored — create your own):
```bash
VITE_WS_URL=ws://localhost:8000/ws/stream
VITE_BACKEND_URL=http://localhost:8000
```
For integration testing against a teammate's backend, point these at
their LAN IP or ngrok URL instead.

## Tech stack

React 18 + TypeScript + Vite, Tailwind CSS, React Flow (DAG), Recharts
(charts), Framer Motion (animations), Zustand (state), Lucide (icons).

## Project structure

```
src/
├── components/   # AgentOrb, AuditLogStream, CircuitBreakerPanel,
│                 # SandboxTerminal, TriageReportCard, PanelShell
├── views/        # WorkflowDAG, SimilarityGraph, HealthIndicators
├── hooks/        # useWebSocket — connection + reconnect + typed events
├── store/        # dashboardStore.ts — Zustand global state
├── App.tsx       # Main layout shell
```

## Layout (locked Day 2)

```
┌─────────────────────────────────────────┐
│  Top bar (system status, Break It button) │
├──────────────────────┬────────────────────┤
│                       │                    │
│   Workflow DAG (60%)  │  Audit Log (40%)   │
│                       │                    │
├───────────────┬───────────────────────────┤
│ Circuit        │  Sandbox Terminal          │
│ Breaker Panel  │                            │
└───────────────┴───────────────────────────┘
```
Minimum width: 1280px. Overlay panels (Similarity Graph, Health
Indicators) toggle via header buttons.

## Status

**Day 1-2 (complete):** Scaffold, WebSocket client (reconnect + backoff),
Zustand store, full layout shell, PanelShell shared wrapper.

**Day 4-7 (complete):**
- Workflow DAG — 5 agent orb nodes, click-to-detail panel, animated
  demo trigger buttons (Full Heal Sequence / Escalation / Reset)
- Similarity Graph — threshold line at 0.92, red fill above threshold,
  per-worker lines, mock data fallback
- Triage Report Card — confidence bar, fix_type badge, fallback pulse
- Audit Log Stream — filter by agent, hash chain display, auto-scroll +
  jump-to-new button
- Health Indicators — 5 per-agent status cards with glowing orbs,
  pulsing yellow fallback halo
- Circuit Breaker Panel — 5 service cards, hover tooltip, detail modal,
  polls `/api/circuit-status` (REST, not WebSocket — no `circuit_breaker`
  WS type exists in the locked schema)
- Sandbox Terminal — real-time stdout/stderr, [MOCK MODE] banner
- Break It button — real POST to `/demo/inject`, toast, 5s cooldown

**Day 8 (complete):**
- Agent orb pulse rate now reflects state urgency (2s calm / 1s active /
  0.5s escalated), continuous not single-flash
- `docs/animation_timing.md` — locked timing reference for demo script

## Known gaps (honest, going into Day 9+ integration)

- **WebSocket broadcast wiring**: Orchestrator state transitions and
  Sentinel loop detections don't push to `/ws/stream` yet — only the
  fault-injection path does. Panels currently show live data only via
  that path or mock fallback. This is backend work (Nipun/Rashi), not
  a dashboard bug.
- **Circuit registry**: exists and is polled correctly, but individual
  agents' own circuit breakers (Sentinel/Triage/Remediation/Optimization)
  don't yet report into the shared registry — so real failures won't
  show up in the panel until that backend wiring lands.
- **Post-Heal Report Card**: not built (Day 12 per plan).
- **Workflow DAG traveling-dot edge animation, spring throughput
  counter, confetti**: not implemented — documented in
  `animation_timing.md`, deferred as polish.
- **Accessibility (WCAG) pass**: not done.
- **cuOpt**: intentionally shown as red/"Unused" in Circuit Breaker
  Panel — API access was never confirmed working for this project,
  OR-Tools is the practical primary solver (see backend
  `docs/api_contracts.md`).

## Next up: Day 9-10 (team integration)

All 4 connect simultaneously to Shreshtha's backend. This is where the
WebSocket/circuit-registry wiring gaps above get closed, contract
formats get cross-checked, and the dashboard gets its first real
multi-machine test.
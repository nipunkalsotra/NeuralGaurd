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
```
Defaults to `ws://localhost:8000/ws/stream` if unset. For integration
testing against a teammate's backend, point this at their LAN IP or
ngrok URL instead.

## Tech stack

React 18 + TypeScript + Vite, Tailwind CSS, React Flow (DAG), Recharts
(charts), Framer Motion (animations), Zustand (state).

## Project structure

```
src/
├── components/   # Reusable UI pieces (PanelShell, AuditLogStream, etc.)
├── views/        # Page-level views (WorkflowDAG)
├── hooks/        # useWebSocket — connection + reconnect + typed events
├── store/        # dashboardStore.ts — Zustand global state
├── App.tsx       # Main layout shell
```

## Layout (locked Day 2)

```
┌─────────────────────────────────────────┐
│              Top bar (system status)      │
├──────────────────────┬────────────────────┤
│                       │                    │
│   Workflow DAG (60%)  │  Audit Log (40%)   │
│                       │                    │
├───────────────┬───────────────────────────┤
│ Circuit        │  Sandbox Terminal          │
│ Breaker Panel  │                            │
└───────────────┴───────────────────────────┘
```
Minimum width: 1280px.

## Status

**Day 1 (complete):**
- Vite + React + TypeScript + Tailwind scaffold
- `useWebSocket.ts` — connects to `/ws/stream`, exponential backoff
  reconnect (capped 30s), typed message parsing, 500-event in-memory cap
- `dashboardStore.ts` — Zustand store: workers, auditLog, circuitBreakers,
  throughput, currentView
- `App.tsx` renders React Flow canvas

**Day 2 (complete):**
- Full layout shell locked: top bar, 60/40 left-right split
  (Workflow DAG / Audit Log Stream), 20%-height bottom row
  (Circuit Breaker Panel / Sandbox Terminal)
- `PanelShell.tsx` — shared wrapper component (title bar + scrollable body)
  used by all panel components
- Placeholder components for Audit Log Stream, Circuit Breaker Panel,
  Sandbox Terminal — each stubbed with a "wired on Day N" placeholder,
  real data wiring lands as backend WebSocket events become available
- Custom color palette (`--status-*` CSS vars) matching master doc
  Section 11.3: healthy/suspected/remediating/escalated/verifying/fallback

**Not yet wired (pending backend integration):**
- Live WebSocket data flowing into components (backend `/ws/stream`
  exists and is tested — dashboard-side consumption lands as each view
  is built out)
- Workflow DAG node/edge rendering (currently empty canvas)
- 'Break It' button (Day 7)
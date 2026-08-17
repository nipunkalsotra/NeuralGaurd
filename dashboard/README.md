# NeuralGuard — Dashboard

React 19 + Vite + TypeScript control-plane site for the self-healing
orchestrator. Six routes — a landing/case-study front end plus the live
Control Plane — all driven off one shared data connection, and fully
explorable with **no backend required**: a from-scratch TypeScript port
of the whole orchestration core runs in the browser whenever a real
backend isn't reachable.

## Setup

```bash
npm install
npm run dev        # starts Vite dev server on :3000
```

### Environment variables

```bash
VITE_WS_URL=ws://localhost:8000/ws/stream
VITE_BACKEND_URL=http://localhost:8000
```

Both are optional. If unset, or if the backend at `VITE_BACKEND_URL`
doesn't answer `/health` within ~2 seconds, the app runs entirely on the
in-browser simulator instead — this is what makes the deployed site
usable without anyone running the Python backend. Point them at a
teammate's LAN IP to connect to a real remote backend instead of
localhost.

Vite inlines these at **build time**, not runtime — see
`Dockerfile`/`../docker-compose.yml`'s `build.args` if deploying via
Docker.

## Architecture

```
src/
├── app/            Router, layouts, SourceProvider (the one live connection), error boundary
├── pages/           The 6 routes
├── sim/             In-browser port of the orchestration core (FSM, event bus, TrustChain, agents)
├── data/            DataSource abstraction — LiveBackendSource vs. SimulatedSource, one shared connection
├── store/           Single Zustand store; ingestEnvelope() is the one place a message is parsed
├── design/          Design tokens (mirrors index.css's @theme block)
├── components/
│   ├── primitives/  PanelShell, GrainOverlay
│   ├── viz/         AgentOrb and other data-driven visuals
│   ├── panels/      The Control Plane's real panels (audit log, circuit breakers, sandbox, etc.)
│   └── marketing/   Landing/case-study page building blocks
└── hooks/           useReducedMotion, useScrollReveal, useFocusTrap
```

Every panel reads from the store; nothing but `SourceProvider` ever
opens a connection. This replaced an earlier version where three
different components each opened their own WebSocket to the same
endpoint.

## Testing

```bash
npm run test      # Vitest — src/sim/'s FSM, hash chain, circuit breakers, agent fallback ladders
npm run build      # tsc -b && vite build
npm run lint       # eslint .
```

## Troubleshooting

- **Stuck on "Connecting"** — the backend health probe has a ~2s
  timeout; the app falls back to the simulator automatically. If it
  doesn't, check `VITE_BACKEND_URL` and the backend's CORS
  `CORS_ALLOWED_ORIGINS` env var includes this origin.
- **Badge says "Simulated" but a backend is running** — confirm
  `/health` actually returns 200 from a browser tab at that exact
  origin (not just curl — CORS is origin-specific).

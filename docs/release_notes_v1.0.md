# v1.0 — Phase 1 Complete

**AI Factory Sentinel** — a self-healing agentic workflow orchestrator,
built by a 4-person team in 15 days, entirely on free-tier
infrastructure, across physically separate machines connected over LAN.

## Highlights

- 4 autonomous agents (Sentinel, Triage, Remediation, Optimization)
  coordinated by a 7-state FSM orchestrator over an async event bus.
- 4 independent fallback chains — every external dependency degrades
  gracefully instead of crashing, visible live on the dashboard.
- Immutable, SHA-256 hash-chained audit log for every state transition.
- Real-time React dashboard: Workflow DAG, Health Indicators, Similarity
  Graph, Circuit Breaker Panel, Sandbox Terminal, Audit Log Stream,
  Triage Report Card, and an animated Post-Heal Report Card.
- 4 chaos-engineering fault types for interactive self-healing demos.
- 100+ backend tests, real (not simulated) cross-machine LAN
  integration testing, and a real 40-concurrent-request wrapper stress
  test.

## By the numbers

- 4 engineers, 15 days, $0 budget.
- Zero `agentiq` references, zero `openai` references (Groq/NIM/Nemotron
  throughout) — verified by grep, not assumed.
- Clean `docker-compose --profile full-stack up --build` on a fresh
  machine: all 3 services start, dashboard reachable, demo runs
  end-to-end.

## Known limitations (see README's "Known limitations" section)

cuOpt is intentionally skipped — hosted API access was never confirmed
working; OR-Tools is the practical primary solver. In-memory state
(caches, circuit breakers, audit log) resets on restart — this is a
single-process demo system, not a production deployment.

## What's next

See the README's [Future Work](../README.md#future-work) section —
async LLM clients, a persistent live throughput counter, a dashboard
test suite, and the Phase 2 roadmap (Kubernetes, auth, observability,
CI/CD).

---

**Full changelog:** first tagged release — this is the baseline.

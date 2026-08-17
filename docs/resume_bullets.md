# Resume Bullets

Per the master doc's Section 22 language, cross-checked against what's
actually in the repo — not copied blind from the planning guides.

## Nipun — SDK Lead & Fallback Architect
- Architected a 7-state finite-state-machine orchestrator coordinating
  4 autonomous agents over an async event bus, with every transition
  writing to an immutable, SHA-256 hash-chained audit log.
- Designed and implemented 4 independent fallback chains (embeddings,
  diagnosis, optimization, remediation) so the system degrades
  gracefully at every failure point instead of crashing.
- Built the demo's fault-injection-to-healing pipeline end-to-end,
  closing real integration gaps found during cross-machine testing
  (event-bus wiring, WebSocket schema mismatches, wrapper networking)
  rather than assuming components worked together.

## Nipun — Algorithms & Optimization
- Built Sentinel Agent with a 3-tier fallback chain (NVIDIA NIM →
  sentence-transformers → hash exact-match) achieving sub-second loop
  detection via a dual-condition trigger (cosine similarity + repeated
  error signature).
- Formulated a constrained optimization problem for dynamic workload
  rerouting, solved via Google OR-Tools (practical primary solver after
  cuOpt's hosted API access proved unavailable), excluding remediating
  workers while maintaining throughput.
- Designed a fault-injection backend supporting 4 distinct chaos
  scenarios (schema corruption, latency, forced error signature,
  resource pressure) for interactive self-healing demos.

## Shreshtha — Infrastructure & NemoClaw Specialist
- Built the real-vs-mock NemoClaw wrapper service so remediation-agent
  code is completely agnostic to which backend is running underneath
  it — same HTTP contract either way.
- Owned the Docker Compose multi-service deployment (backend, wrapper,
  dashboard) including fixing real cross-container networking and
  build issues found during live testing (Python version mismatches,
  DNS resolution failures inside containers, service-name vs
  `localhost` routing).
- Built the Token Counter, Throughput Tracker, and Report Card
  aggregation APIs, computing every metric from real audit-log events
  rather than hardcoded placeholder values.

## Shreshtha — Control Plane Interface
- Built a real-time React 18 dashboard with WebSocket streaming, Framer
  Motion animations, and an interactive React Flow DAG visualizing a
  self-healing agent workflow live.
- Designed a dark-themed control plane with circuit breaker panels,
  live audit log streams, a sandbox terminal, and an animated post-heal
  report card wired to real backend metrics.
- Implemented fallback visual indicators (pulsing halos, static rings,
  status badges) mapped to the specific fallback source active per
  agent, so system degradation is visible in real time during a demo
  rather than silent.

## Shared / team
- Shipped a 4-person, fully asynchronous multi-agent system in 15 days
  on a zero-budget, free-tier-only stack, coordinating across
  physically separate machines over LAN with no shared cloud
  infrastructure.

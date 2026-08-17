// src/sim/index.ts
// SentinelSimulator — the single integration point src/data/SimulatedSource
// uses. Wires the ported FSM, event bus, TrustChain, circuit breakers, and
// all 4 agents together, and mirrors backend/api/fault_injection.py's
// POST /demo/inject handler: apply a fault, feed it through detectLoop()
// 4 times (same as the real endpoint simulating a worker repeating itself),
// and publish LOOP_SUSPECTED once a loop is confirmed.
import { sharedClock } from "./clock";
import { CircuitBreakerRegistry } from "./circuitBreaker";
import { applyFault, FAULT_LABELS, type FaultPayload } from "./faults";
import { Orchestrator } from "./orchestrator";
import { OptimizationAgent } from "./agents/optimization";
import { RemediationAgent } from "./agents/remediation";
import { SentinelAgent } from "./agents/sentinel";
import { TriageAgent } from "./agents/triage";
import { ServiceHealthRegistry } from "./serviceHealth";
import type { AuditRecord, CircuitStatus, FaultType, ServiceName, WorkerState, WsEnvelope } from "./types";

export { FAULT_LABELS };
export type { FaultType, ServiceName, WorkerState, WsEnvelope, AuditRecord, CircuitStatus };

type EnvelopeListener = (envelope: WsEnvelope) => void;

export class SentinelSimulator {
  readonly health = new ServiceHealthRegistry();
  readonly circuits = new CircuitBreakerRegistry();
  readonly clock = sharedClock;

  private sentinelAgent = new SentinelAgent(this.health);
  private triageAgent = new TriageAgent(this.health);
  private remediationAgent: RemediationAgent;
  private optimizationAgent = new OptimizationAgent(this.health);
  private orchestrator: Orchestrator;
  private listeners = new Set<EnvelopeListener>();

  constructor() {
    this.remediationAgent = new RemediationAgent(
      this.health,
      (kind, line) => this.emit("stdout" === kind ? "stdout" : "stderr", "sandbox_output", "worker-3", line),
      () => this.emit("mock_banner", "fallback_activated", "worker-3", JSON.stringify({
        reason: "nemoclaw_cli_failed",
        message: "Sandbox auto-fallback active — demo continuing with simulated execution.",
      }))
    );
    this.orchestrator = new Orchestrator(
      this.triageAgent,
      this.remediationAgent,
      this.optimizationAgent,
      (envelope) => this.dispatch(envelope)
    );
  }

  subscribe(listener: EnvelopeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private dispatch(envelope: WsEnvelope): void {
    this.listeners.forEach((l) => l(envelope));
  }

  private emit(type: WsEnvelope["type"], eventType: string, workerId: string, payload: string): void {
    this.dispatch({ type, event_type: eventType, worker_id: workerId, payload, timestamp: new Date().toISOString() });
  }

  getWorkerState(workerId: string): WorkerState {
    return this.orchestrator.getState(workerId);
  }

  getAuditRecords(): AuditRecord[] {
    return this.orchestrator.audit.getRecords();
  }

  async verifyChain() {
    return this.orchestrator.audit.verifyChain();
  }

  tamperRecord(index: number, field: keyof AuditRecord, value: unknown): void {
    this.orchestrator.audit.tamperRecord(index, field, value);
  }

  getCircuitStatuses(): CircuitStatus[] {
    return this.circuits.allStatuses();
  }

  /** Mirrors report_card.py's tokens_saved: cache hits * the same
   * default-estimate constant the real TokenCounter uses. */
  getTokensSaved(): number {
    return this.triageAgent.cacheHits * 250;
  }

  /** Mirrors the fixed throughput_tracker.py: 100% baseline whenever
   * nothing is actively degraded right now, else the real reroute plan
   * belonging to whichever worker is still actively open. Previously
   * this only ever looked at the LAST plan ever produced, so throughput
   * stayed pinned at whatever the solver returned (typically 97%)
   * forever, even long after every worker had fully RESUMED — the same
   * staleness bug the Python backend had, ported along with everything
   * else. RESUMED/HEALTHY count as settled (fully healed); ESCALATED
   * does not (still broken, waiting on a human). */
  private static readonly SETTLED_STATES = new Set<WorkerState>(["HEALTHY", "RESUMED"]);

  getThroughputPct(): number {
    const entries = Array.from(this.orchestrator.reroutePlans.entries()).reverse();
    for (const [workerId, plan] of entries) {
      const state = this.orchestrator.workerStates.get(workerId);
      // No explicit state at all means this worker's FSM transitions
      // were never exercised (e.g. a plan recorded in isolation) —
      // treat it as still open rather than discard it, same as the
      // Python fix.
      if (state !== undefined && SentinelSimulator.SETTLED_STATES.has(state)) continue;
      return plan.projected_throughput_pct;
    }
    return 100;
  }

  killService(service: ServiceName): void {
    this.health.kill(service);
    this.circuits.get(service).forceOpen(`${service} manually killed (demo)`);
  }

  reviveService(service: ServiceName): void {
    this.health.revive(service);
    this.circuits.get(service).recordSuccess();
  }

  isServiceUp(service: ServiceName): boolean {
    return this.health.isUp(service);
  }

  subscribeHealth(listener: () => void): () => void {
    return this.health.subscribe(listener);
  }

  reset(workerId?: string): void {
    this.orchestrator.reset();
    if (workerId) this.sentinelAgent.reset(workerId);
  }

  /** Mirrors POST /demo/inject: apply the fault, replay its log line 4x
   * through detectLoop() (same as the real endpoint simulating a worker
   * repeating its failure), publish LOOP_SUSPECTED once confirmed. */
  async injectFault(targetWorkerId: string, faultType: FaultType, payload: FaultPayload = {}): Promise<boolean> {
    const fault = applyFault(faultType, payload);
    const logLine = `Error: ${fault.log_message} (fault: ${fault.type})`;

    let loopEvent = null;
    for (let i = 0; i < 4; i++) {
      loopEvent = this.sentinelAgent.detectLoop(targetWorkerId, logLine, fault.error_signature);
      this.emit("stdout", "sandbox_output", targetWorkerId, `[${targetWorkerId}] ${logLine}`);
      await this.clock.sleep(120);
    }

    if (loopEvent) {
      this.emit("similarity", "similarity_sample", targetWorkerId, JSON.stringify({
        worker_id: targetWorkerId,
        similarity: loopEvent.similarity,
        time: Date.now(),
      }));
      await this.orchestrator.bus.publish("LOOP_SUSPECTED", { ...loopEvent, log_lines: [logLine] });
      return true;
    }
    return false;
  }
}

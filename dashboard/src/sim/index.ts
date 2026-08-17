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

  /** Mirrors throughput_tracker.py: 100% baseline with no active
   * incident, else the most recent real reroute plan's projected figure. */
  getThroughputPct(): number {
    const plans = Array.from(this.orchestrator.reroutePlans.values());
    const latest = plans[plans.length - 1];
    return latest ? latest.projected_throughput_pct : 100;
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

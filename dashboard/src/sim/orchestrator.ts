// src/sim/orchestrator.ts
// Port of backend/sentinel/agents/orchestrator.py — the FSM driver.
// Same transition legality (fsm.ts), same confidence-escalation
// threshold (0.7), same "re-injecting a fault resets a terminal/mid-cycle
// worker back to HEALTHY first" behavior, same fallback_origin routing
// per branch. Every transition is written to a real hash-chained
// TrustChainLogger record and emitted as the same envelope shape
// broadcast_state_change/broadcast_audit_event produce on the wire.
import { EventBus } from "./eventBus";
import { CONFIDENCE_ESCALATION_THRESHOLD, VALID_TRANSITIONS, IllegalTransitionError } from "./fsm";
import { TrustChainLogger } from "./trustChain";
import { OptimizationAgent, type OptItem, type OptWorker } from "./agents/optimization";
import { RemediationAgent } from "./agents/remediation";
import { TriageAgent } from "./agents/triage";
import type { AuditRecord, LoopEvent, ReroutePlan, WorkerState, WsEnvelope } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

// A small fixed synthetic factory queue so OptimizationAgent has
// something concrete to route around the failing worker — same shape
// (id/weight/distances, capacity) formulate_problem() expects.
function demoQueue(excluded: string): { items: OptItem[]; workers: OptWorker[] } {
  const allWorkers: OptWorker[] = [
    { id: "worker-1", capacity: 4 },
    { id: "worker-2", capacity: 4 },
    { id: "worker-3", capacity: 4 },
  ];
  const items: OptItem[] = Array.from({ length: 6 }, (_, i) => ({
    id: `item-${i + 1}`,
    weight: 1,
    distances: Object.fromEntries(allWorkers.map((w) => [w.id, w.id === excluded ? 99 : 1 + (i % 3)])),
  }));
  return { items, workers: allWorkers };
}

export class Orchestrator {
  workerStates = new Map<string, WorkerState>();
  reroutePlans = new Map<string, ReroutePlan>();
  audit = new TrustChainLogger();
  bus = new EventBus();

  private triageAgent: TriageAgent;
  private remediationAgent: RemediationAgent;
  private optimizationAgent: OptimizationAgent;
  private onEnvelope: (envelope: WsEnvelope) => void;

  constructor(
    triageAgent: TriageAgent,
    remediationAgent: RemediationAgent,
    optimizationAgent: OptimizationAgent,
    onEnvelope: (envelope: WsEnvelope) => void
  ) {
    this.triageAgent = triageAgent;
    this.remediationAgent = remediationAgent;
    this.optimizationAgent = optimizationAgent;
    this.onEnvelope = onEnvelope;
    this.bus.subscribe<LoopEvent>("LOOP_SUSPECTED", (e) => this.onLoopSuspected(e));
    this.bus.subscribe<LoopEvent>("LOOP_SUSPECTED", (e) => this.onOptimizationDispatch(e));
    this.bus.subscribe("DIAGNOSIS_COMPLETE", (e) => this.onDiagnosisComplete(e as never));
  }

  getState(workerId: string): WorkerState {
    return this.workerStates.get(workerId) ?? "HEALTHY";
  }

  reset(): void {
    this.workerStates.clear();
    this.reroutePlans.clear();
    this.audit.reset();
  }

  private broadcast(type: WsEnvelope["type"], eventType: string, workerId: string, payload: unknown): void {
    this.onEnvelope({
      type,
      event_type: eventType,
      worker_id: workerId,
      payload: typeof payload === "string" ? payload : JSON.stringify(payload),
      timestamp: nowIso(),
    });
  }

  async transition(
    workerId: string,
    toState: WorkerState,
    triggerEvent: string,
    agentName: string,
    extra: Partial<Pick<AuditRecord, "confidence_score" | "fallback_used" | "fallback_origin" | "root_cause" | "fix_type" | "affected_field">> = {}
  ): Promise<AuditRecord> {
    const current = this.getState(workerId);
    if (!VALID_TRANSITIONS[current].includes(toState)) {
      throw new IllegalTransitionError(current, toState);
    }
    this.workerStates.set(workerId, toState);

    const record = await this.audit.logTransition({
      worker_id: workerId,
      from_state: current,
      to_state: toState,
      trigger_event: triggerEvent,
      agent_name: agentName,
      ...extra,
    });

    this.broadcast("state_change", toState, workerId, {
      from_state: current,
      to_state: toState,
      trigger_event: triggerEvent,
    });
    this.broadcast("audit_event", "transition_logged", workerId, record);
    return record;
  }

  async onLoopSuspected(event: LoopEvent): Promise<void> {
    const workerId = event.worker_id;
    const current = this.getState(workerId);
    if (current !== "HEALTHY" && current !== "RESUMED") {
      this.workerStates.set(workerId, "HEALTHY");
    }

    const origin = event.embedding_origin;
    await this.transition(workerId, "LOOP_SUSPECTED", "LOOP_SUSPECTED", "SentinelAgent", {
      fallback_used: origin !== "NIM",
      fallback_origin: origin !== "NIM" ? origin : null,
    });
    await this.transition(workerId, "DIAGNOSING", "DIAGNOSIS_STARTED", "Orchestrator");

    const diagnosis = await this.triageAgent.diagnose(event, event.log_lines);
    await this.bus.publish("DIAGNOSIS_COMPLETE", { worker_id: workerId, ...diagnosis });
  }

  async onOptimizationDispatch(event: LoopEvent): Promise<void> {
    const workerId = event.worker_id;
    const { items, workers } = demoQueue(workerId);
    const problem = this.optimizationAgent.formulateProblem(workerId, items, workers);
    const plan = this.optimizationAgent.solve(problem);
    this.reroutePlans.set(workerId, plan);
    this.broadcast("audit_event", "reroute_computed", workerId, {
      timestamp: nowIso(),
      worker_id: workerId,
      trigger_event: "OPTIMIZATION_COMPLETE",
      agent_name: "OptimizationAgent",
      solver_used: plan.solver_used,
      projected_throughput_pct: plan.projected_throughput_pct,
      excluded_workers: plan.excluded_workers,
    });
  }

  private async onDiagnosisComplete(event: { worker_id: string } & Record<string, unknown>): Promise<void> {
    const workerId = event.worker_id;
    const confidence = (event.confidence as number) ?? 0;
    const common = {
      confidence_score: confidence,
      fallback_used: (event.fallback_used as boolean) ?? false,
      fallback_origin: (event.fallback_origin as string | null) ?? null,
      root_cause: (event.root_cause as string) ?? null,
      fix_type: (event.fix_type as string) ?? null,
      affected_field: (event.affected_field as string) ?? null,
    };

    if (confidence < CONFIDENCE_ESCALATION_THRESHOLD) {
      await this.transition(workerId, "ESCALATED", "LOW_CONFIDENCE", "Orchestrator", common);
      return;
    }

    await this.transition(workerId, "REMEDIATING", "DIAGNOSIS_COMPLETE", "TriageAgent", common);

    const remediationResult = await this.remediationAgent.remediate({
      root_cause: event.root_cause as string,
      fix_type: event.fix_type as never,
      affected_field: event.affected_field as string,
      confidence,
      fallback_used: common.fallback_used,
      fallback_origin: common.fallback_origin,
      worker_id: workerId,
    });

    await this.transition(workerId, "VERIFYING", "REMEDIATION_ATTEMPTED", "RemediationAgent");

    const remediationFallbackOrigin = remediationResult.mode === "mock" ? "mock" : null;

    if (remediationResult.verified) {
      await this.transition(workerId, "RESUMED", "REMEDIATION_SUCCESS", "RemediationAgent", {
        fallback_used: remediationResult.flagged ?? false,
        fallback_origin: remediationFallbackOrigin,
      });
    } else {
      await this.transition(workerId, "ESCALATED", "REMEDIATION_FAILED", "RemediationAgent", {
        fallback_used: remediationResult.flagged ?? false,
        fallback_origin: remediationFallbackOrigin,
      });
    }
  }
}

// src/data/simulatedSource.ts
// Adapts SentinelSimulator to the same DataSource interface the live
// backend implements. fetchMetrics mirrors report_card.py's
// build_report_card() field-for-field, computed from the simulator's own
// real (in-memory) hash-chained audit trail — not invented numbers.
import { SentinelSimulator } from "../sim";
import type { AuditRecord } from "../sim/types";
import type { CircuitStatusEntry, DataSource, ReportCardMetrics, WsEnvelope } from "./types";

function latestTimeToDetect(records: AuditRecord[]): number | null {
  const loopSuspectedAt = new Map<string, string>();
  const completed: [string, string][] = [];

  for (const r of records) {
    if (r.to_state === "LOOP_SUSPECTED") {
      loopSuspectedAt.set(r.worker_id, r.timestamp);
    } else if ((r.to_state === "REMEDIATING" || r.to_state === "ESCALATED") && loopSuspectedAt.has(r.worker_id)) {
      completed.push([loopSuspectedAt.get(r.worker_id)!, r.timestamp]);
      loopSuspectedAt.delete(r.worker_id);
    }
  }

  if (completed.length === 0) return null;
  const [loopTs, completeTs] = completed[completed.length - 1];
  const deltaMs = new Date(completeTs).getTime() - new Date(loopTs).getTime();
  return Math.round((deltaMs / 1000) * 1000) / 1000;
}

export class SimulatedSource implements DataSource {
  readonly kind = "simulated" as const;

  public readonly sim: SentinelSimulator;
  constructor(sim: SentinelSimulator = new SentinelSimulator()) {
    this.sim = sim;
  }

  connect(onEnvelope: (e: WsEnvelope) => void, onStatus?: (connected: boolean) => void): () => void {
    onStatus?.(true);
    return this.sim.subscribe(onEnvelope as never);
  }

  async injectFault(target: string, faultType: string, payload: Record<string, unknown> = {}): Promise<boolean> {
    return this.sim.injectFault(target, faultType as never, payload);
  }

  async fetchMetrics(): Promise<ReportCardMetrics> {
    const records = this.sim.getAuditRecords();
    return {
      time_to_detect: latestTimeToDetect(records),
      tokens_saved: this.sim.getTokensSaved(),
      throughput_maintained: this.sim.getThroughputPct(),
      fixes_applied: records.filter((r) => r.to_state === "RESUMED").length,
      escalations: records.filter((r) => r.to_state === "ESCALATED").length,
      fallbacks_triggered: records.filter((r) => r.fallback_used).length,
    };
  }

  async fetchCircuitStatus(): Promise<CircuitStatusEntry[]> {
    return this.sim.getCircuitStatuses().map((c) => ({
      service: c.service,
      status: c.status,
      failure_count: c.failure_count,
      last_failure: c.last_failure,
    }));
  }

  async fetchAuditLog(): Promise<unknown[]> {
    return this.sim.getAuditRecords();
  }

  reset(): void {
    this.sim.reset();
  }
}

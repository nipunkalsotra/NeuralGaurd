// src/data/types.ts
// The one interface both the live backend and the in-browser simulator
// implement. Every component in the app talks to a DataSource, never to
// a WebSocket or the simulator directly — this is what collapses the
// three independent WebSocket connections the old dashboard opened
// (App, AuditLogStream, SandboxTerminal each ran their own useWebSocket)
// into exactly one live connection, shared through context.
import type { WorkerState } from "../sim/types";

export interface WsEnvelope {
  type: "stdout" | "stderr" | "mock_banner" | "state_change" | "audit_event" | "similarity";
  event_type: string;
  worker_id: string;
  payload: string;
  timestamp: string;
}

export interface ReportCardMetrics {
  time_to_detect: number | null;
  tokens_saved: number;
  throughput_maintained: number;
  fixes_applied: number;
  escalations: number;
  fallbacks_triggered: number;
}

export interface CircuitStatusEntry {
  service: string;
  status: "closed" | "open" | "half-open" | "CLOSED" | "OPEN" | "HALF_OPEN";
  failure_count: number;
  last_failure: string | null;
}

export type ConnectionKind = "live" | "simulated" | "connecting";

export interface DataSource {
  readonly kind: "live" | "simulated";
  connect(onEnvelope: (e: WsEnvelope) => void, onStatus?: (connected: boolean) => void): () => void;
  injectFault(target: string, faultType: string, payload?: Record<string, unknown>): Promise<boolean>;
  fetchMetrics(): Promise<ReportCardMetrics>;
  fetchCircuitStatus(): Promise<CircuitStatusEntry[]>;
  fetchAuditLog(limit?: number): Promise<unknown[]>;
  reset(): void;
}

export type { WorkerState };

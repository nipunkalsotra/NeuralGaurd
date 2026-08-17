// src/sim/types.ts
// Shared types for the in-browser simulator. Envelope shapes mirror
// docs/websocket_schema.md exactly, so LiveBackendSource and
// SimulatedSource (src/data/) can hand identical objects to the rest of
// the app — no component needs to know or care which source produced them.

export type WorkerState =
  | "HEALTHY"
  | "LOOP_SUSPECTED"
  | "DIAGNOSING"
  | "REMEDIATING"
  | "VERIFYING"
  | "RESUMED"
  | "ESCALATED";

export type ServiceName = "NIM" | "Nemotron" | "cuOpt" | "Groq" | "NemoClaw";

export type FixType =
  | "SCHEMA_MISMATCH"
  | "TYPE_ERROR"
  | "MISSING_IMPORT"
  | "TIMEOUT"
  | "CONNECTION_ERROR"
  | "RESOURCE_ERROR"
  | "unknown";

export interface WsEnvelope {
  type: "stdout" | "stderr" | "mock_banner" | "state_change" | "audit_event" | "similarity";
  event_type: string;
  worker_id: string;
  payload: string;
  timestamp: string;
}

export interface AuditRecord {
  timestamp: string;
  worker_id: string;
  from_state: WorkerState;
  to_state: WorkerState;
  trigger_event: string;
  agent_name: string;
  confidence_score: number | null;
  fallback_used: boolean;
  fallback_origin: string | null;
  root_cause?: string | null;
  fix_type?: string | null;
  affected_field?: string | null;
  previous_hash: string;
  current_hash: string;
}

export interface LoopEvent {
  worker_id: string;
  similarity: number;
  consecutive_count: number;
  error_hash: string;
  embedding_origin: "NIM" | "sentence-transformers" | "hash";
  log_lines: string[];
  timestamp: string;
}

export interface Diagnosis {
  root_cause: string;
  fix_type: FixType;
  affected_field: string;
  confidence: number;
  fallback_used: boolean;
  fallback_origin: string | null;
}

export interface RemediationResult {
  verified: boolean;
  output: string;
  sandbox_log: string;
  mode: "mock" | "nemoclaw" | "timeout" | "error" | "unavailable";
  flagged?: boolean;
}

export interface ReroutePlan {
  worker_id: string;
  assignments: { item_id: string; worker_id: string }[];
  excluded_workers: string[];
  projected_throughput_pct: number;
  solver_used: "constraint-solver" | "greedy_round_robin";
}

export type FaultType = "schema_corruption" | "latency" | "error_signature" | "resource_pressure";

export interface CircuitStatus {
  service: ServiceName;
  status: "CLOSED" | "OPEN" | "HALF_OPEN";
  failure_count: number;
  last_failure: string | null;
}

// src/sim/faults.ts
// Port of backend/api/fault_injection.py's 4 fault handlers — same
// log_message text generation each one feeds into RuleBasedHeuristic's
// regex patterns (see agents/triage.ts), so an injected fault is
// diagnosable by the same real pattern matching either path uses.
import type { FaultType } from "./types";

export interface FaultPayload {
  field?: string;
  delay_ms?: number;
  error?: string;
  memory_mb?: number;
}

export interface AppliedFault {
  type: FaultType;
  error_signature: string;
  log_message: string;
  details: Record<string, unknown>;
}

export function applyFault(faultType: FaultType, payload: FaultPayload = {}): AppliedFault {
  switch (faultType) {
    case "schema_corruption": {
      const field = payload.field ?? "Tax_ID";
      return {
        type: faultType,
        error_signature: `${field}_missing`,
        log_message: `Field '${field}' not found in invoice schema`,
        details: { removed_field: field },
      };
    }
    case "latency": {
      const delayMs = payload.delay_ms ?? 5000;
      return {
        type: faultType,
        error_signature: "latency_injected",
        log_message: `Operation timed out after ${delayMs}ms waiting for worker response`,
        details: { delay_ms: delayMs },
      };
    }
    case "error_signature": {
      const error = payload.error ?? "Tax_ID not found";
      return {
        type: faultType,
        error_signature: error,
        log_message: error,
        details: { forced_error: error },
      };
    }
    case "resource_pressure": {
      const memoryMb = payload.memory_mb ?? 512;
      return {
        type: faultType,
        error_signature: "oom_pressure",
        log_message: `Worker ran out of memory (OOM) after consuming ${memoryMb}MB`,
        details: { consumed_memory_mb: memoryMb },
      };
    }
  }
}

export const FAULT_LABELS: Record<FaultType, string> = {
  schema_corruption: "Schema Corruption",
  latency: "Latency Spike",
  error_signature: "Forced Error",
  resource_pressure: "Resource Pressure (OOM)",
};

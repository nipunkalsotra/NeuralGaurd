// src/components/panels/auditStreamUtils.ts
// Split out of AuditStream.tsx purely so that file exports only the
// component — mixing a plain function export in breaks react-refresh's
// fast-refresh boundary.
import type { AuditRecord } from "../../sim/types";

/** A single honest one-line summary of a record, derived only from
 * fields the record actually carries — never invented text. */
export function describeRecord(r: AuditRecord): string {
  if (r.root_cause) return `${r.fix_type ?? "unknown"} · confidence ${r.confidence_score?.toFixed(2) ?? "—"}`;
  if (r.to_state === "LOOP_SUSPECTED" && r.confidence_score !== null) return `similarity ${r.confidence_score.toFixed(2)}`;
  if (r.fallback_used && r.fallback_origin) return `fallback → ${r.fallback_origin}`;
  return `${r.worker_id} → ${r.to_state}`;
}

/** Maps an AgentId (the store's own id space) to the agent_name string
 * AuditRecord actually carries — the inverse of the store's internal
 * AGENT_NAME_TO_AGENT_ID, kept here since AuditStream's sidebar filter
 * needs to go the other direction. */
export const AGENT_ID_TO_AUDIT_NAME: Record<string, string> = {
  sentinel: "SentinelAgent",
  triage: "TriageAgent",
  remediation: "RemediationAgent",
  optimization: "OptimizationAgent",
  orchestrator: "Orchestrator",
};

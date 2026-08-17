// src/sim/trustChain.ts
// Direct port of backend/sentinel/audit/trustchain_logger.py — a genuine
// SHA-256 hash-chained append-only log, computed with the browser's own
// Web Crypto API (crypto.subtle.digest), not a fake/random hex string.
// Each record's current_hash = SHA256(previous_hash + JSON(record minus
// current_hash)), exactly like the Python original. tamperRecord() exists
// so the /fallbacks and /architecture pages can demonstrate — for real,
// not for show — that mutating one record breaks every hash after it.
import type { AuditRecord, WorkerState } from "./types";

const GENESIS_HASH = "0".repeat(64);

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Stable stringify — Python's json.dumps(..., sort_keys=True) equivalent.
// Deterministic key order is what makes the hash reproducible/verifiable.
function stableStringify(obj: Record<string, unknown>): string {
  const sortedKeys = Object.keys(obj).sort();
  const entries = sortedKeys.map((k) => `${JSON.stringify(k)}:${JSON.stringify(obj[k])}`);
  return `{${entries.join(",")}}`;
}

export interface TransitionInput {
  worker_id: string;
  from_state: WorkerState;
  to_state: WorkerState;
  trigger_event: string;
  agent_name: string;
  confidence_score?: number | null;
  fallback_used?: boolean;
  fallback_origin?: string | null;
  root_cause?: string | null;
  fix_type?: string | null;
  affected_field?: string | null;
  projected_throughput_pct?: number | null;
}

export class TrustChainLogger {
  private previousHash = GENESIS_HASH;
  private records: AuditRecord[] = [];

  async logTransition(input: TransitionInput): Promise<AuditRecord> {
    const base = {
      timestamp: new Date().toISOString(),
      worker_id: input.worker_id,
      from_state: input.from_state,
      to_state: input.to_state,
      trigger_event: input.trigger_event,
      agent_name: input.agent_name,
      confidence_score: input.confidence_score ?? null,
      fallback_used: input.fallback_used ?? false,
      fallback_origin: input.fallback_origin ?? null,
      root_cause: input.root_cause ?? null,
      fix_type: input.fix_type ?? null,
      affected_field: input.affected_field ?? null,
      projected_throughput_pct: input.projected_throughput_pct ?? null,
      previous_hash: this.previousHash,
    };

    const currentHash = await sha256Hex(this.previousHash + stableStringify(base));
    const record: AuditRecord = { ...base, current_hash: currentHash };

    this.records.push(record);
    this.previousHash = currentHash;
    return record;
  }

  getRecords(): AuditRecord[] {
    return this.records;
  }

  reset(): void {
    this.records = [];
    this.previousHash = GENESIS_HASH;
  }

  /** Demo-only: mutate one field of one record in place, breaking every
   * hash chained after it. Used by /fallbacks + /architecture to prove
   * tamper-evidence live rather than just asserting it in prose. */
  tamperRecord(index: number, field: keyof AuditRecord, value: unknown): void {
    const record = this.records[index] as unknown as Record<string, unknown>;
    if (record) record[field] = value;
  }

  async verifyChain(): Promise<{ valid: boolean; brokenAt: number | null }> {
    let prevHash = GENESIS_HASH;
    for (let i = 0; i < this.records.length; i++) {
      const record = this.records[i];
      // Two independent checks, same as the Python original: the record's
      // own stored previous_hash must actually equal the prior record's
      // current_hash (catches a severed link), AND recomputing the hash
      // from the record's own content must reproduce current_hash
      // (catches content tampering). Either one failing breaks the chain.
      if (record.previous_hash !== prevHash) {
        return { valid: false, brokenAt: i };
      }
      const { current_hash, ...rest } = record;
      const expected = await sha256Hex(prevHash + stableStringify(rest));
      if (expected !== current_hash) {
        return { valid: false, brokenAt: i };
      }
      prevHash = current_hash;
    }
    return { valid: true, brokenAt: null };
  }
}

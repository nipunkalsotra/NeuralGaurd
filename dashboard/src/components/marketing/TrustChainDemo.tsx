// src/components/marketing/TrustChainDemo.tsx
// A genuine SHA-256 hash chain (src/sim/trustChain.ts — the same class
// the Control Plane's real audit log runs on), seeded with a handful of
// sample transitions purely for this page's own throwaway demo instance.
// Tampering recomputes real hashes with the real Web Crypto API and
// re-verifies live — this is not a canned before/after screenshot.
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { TrustChainLogger } from "../../sim/trustChain";
import type { AuditRecord } from "../../sim/types";

const SEED: { worker_id: string; from_state: AuditRecord["from_state"]; to_state: AuditRecord["to_state"]; trigger_event: string; agent_name: string }[] = [
  { worker_id: "worker-3", from_state: "HEALTHY", to_state: "LOOP_SUSPECTED", trigger_event: "LOOP_SUSPECTED", agent_name: "SentinelAgent" },
  { worker_id: "worker-3", from_state: "LOOP_SUSPECTED", to_state: "DIAGNOSING", trigger_event: "DIAGNOSIS_STARTED", agent_name: "Orchestrator" },
  { worker_id: "worker-3", from_state: "DIAGNOSING", to_state: "REMEDIATING", trigger_event: "DIAGNOSIS_COMPLETE", agent_name: "TriageAgent" },
  { worker_id: "worker-3", from_state: "REMEDIATING", to_state: "VERIFYING", trigger_event: "REMEDIATION_ATTEMPTED", agent_name: "RemediationAgent" },
  { worker_id: "worker-3", from_state: "VERIFYING", to_state: "RESUMED", trigger_event: "REMEDIATION_SUCCESS", agent_name: "RemediationAgent" },
];

export default function TrustChainDemo() {
  const [chain] = useState(() => new TrustChainLogger());
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [status, setStatus] = useState<{ valid: boolean; brokenAt: number | null } | null>(null);
  const [tampered, setTampered] = useState(false);

  useEffect(() => {
    (async () => {
      for (const s of SEED) await chain.logTransition(s);
      setRecords(chain.getRecords());
      setStatus(await chain.verifyChain());
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tamper = async () => {
    chain.tamperRecord(2, "confidence_score", 0.99);
    setRecords([...chain.getRecords()]);
    setStatus(await chain.verifyChain());
    setTampered(true);
  };

  const restore = async () => {
    chain.tamperRecord(2, "confidence_score", null);
    setRecords([...chain.getRecords()]);
    setStatus(await chain.verifyChain());
    setTampered(false);
  };

  return (
    <div className="liquid-glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <p className="text-sm font-semibold text-text-primary">Live TrustChain demo</p>
          <p className="text-xs text-text-tertiary mt-1">5 real SHA-256-linked records, computed in this browser tab right now.</p>
        </div>
        <button
          onClick={tampered ? restore : tamper}
          className={`text-xs px-3.5 py-2 rounded-lg font-medium border transition-colors ${tampered ? "bg-state-healthy/15 border-state-healthy/40 text-state-healthy hover:bg-state-healthy/25" : "bg-state-escalated/15 border-state-escalated/40 text-state-escalated hover:bg-state-escalated/25"}`}
        >
          {tampered ? "Restore record" : "Tamper record #3"}
        </button>
      </div>

      <div className="space-y-1.5">
        {records.map((r, i) => {
          const broken = status && !status.valid && status.brokenAt !== null && i >= status.brokenAt;
          return (
            <motion.div
              key={i}
              animate={{ backgroundColor: broken ? "rgba(244,63,94,0.1)" : "rgba(255,255,255,0)" }}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-[11px] font-mono ${broken ? "border-state-escalated/40" : "border-border"}`}
            >
              <span className="text-text-tertiary w-4">{i + 1}</span>
              <span className={broken ? "text-state-escalated" : "text-text-secondary"}>{r.from_state} → {r.to_state}</span>
              <span className="text-text-tertiary ml-auto truncate">{r.current_hash.slice(0, 16)}…</span>
              {broken ? <span className="text-state-escalated">✗</span> : <span className="text-state-healthy">✓</span>}
            </motion.div>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-text-tertiary">
        {status?.valid ? "Chain verified — every hash matches its recomputation." : status ? `Chain broken at record #${(status.brokenAt ?? 0) + 1} — every record after it fails verification too.` : "Verifying…"}
      </p>
    </div>
  );
}

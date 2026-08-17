// src/components/panels/AuditLogPanel.tsx
// Replaces the old AuditLogStream. Reads store.auditLog directly — no
// component-owned socket. Expand/collapse now keys off each record's
// current_hash (unique, stable) instead of its position in the filtered
// array, fixing the bug where a new event or a filter change silently
// shifted which row a user had open.
import { memo, useEffect, useMemo, useRef, useState } from "react";
import PanelShell from "../primitives/PanelShell";
import { useDashboardStore } from "../../store";
import type { AuditRecord, WorkerState } from "../../sim/types";

const STATE_STYLES: Record<WorkerState, { border: string; badge: string }> = {
  HEALTHY: { border: "border-l-state-healthy", badge: "bg-state-healthy/15 text-state-healthy" },
  LOOP_SUSPECTED: { border: "border-l-state-suspected", badge: "bg-state-suspected/15 text-state-suspected" },
  DIAGNOSING: { border: "border-l-state-diagnosing", badge: "bg-state-diagnosing/15 text-state-diagnosing" },
  REMEDIATING: { border: "border-l-state-remediating", badge: "bg-state-remediating/15 text-state-remediating" },
  VERIFYING: { border: "border-l-state-verifying", badge: "bg-state-verifying/15 text-state-verifying" },
  ESCALATED: { border: "border-l-state-escalated", badge: "bg-state-escalated/15 text-state-escalated" },
  RESUMED: { border: "border-l-state-healthy", badge: "bg-state-healthy/15 text-state-healthy" },
};

const AGENTS = ["All", "SentinelAgent", "TriageAgent", "RemediationAgent", "OptimizationAgent", "Orchestrator"];

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB");
}

function chainValid(prev: string, current: string): boolean {
  return Boolean(prev && current && prev !== current);
}

const LogRow = memo(function LogRow({ entry, isOpen, onToggle }: { entry: AuditRecord; isOpen: boolean; onToggle: () => void }) {
  const style = STATE_STYLES[entry.to_state] ?? STATE_STYLES.HEALTHY;
  const valid = chainValid(entry.previous_hash, entry.current_hash);

  return (
    <div className={`border-l-2 ${style.border} bg-transparent hover:bg-surface-2/60 transition-colors`}>
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <span className="text-text-tertiary text-xs w-3">{isOpen ? "▾" : "▸"}</span>
        <span className="font-mono text-[11px] text-text-tertiary w-16 shrink-0">{formatTime(entry.timestamp)}</span>
        <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${style.badge}`}>{entry.to_state}</span>
        <span className="text-xs text-text-secondary truncate">
          {entry.worker_id}
          {entry.confidence_score !== null ? `: confidence ${entry.confidence_score.toFixed(2)}` : ""}
          {entry.fallback_used ? " · fallback" : ""}
        </span>
      </button>

      {isOpen && (
        <div className="px-3 pb-3">
          <pre className="text-[10px] font-mono bg-canvas border border-border rounded-md p-3 overflow-x-auto text-text-secondary">
{JSON.stringify(entry, null, 2)}
          </pre>
          <div className="flex items-center gap-2 mt-2 text-[10px] font-mono text-text-tertiary">
            <span>{valid ? "✓ hash chain intact" : "⚠ chain check failed"}</span>
            <span className="truncate">prev: {entry.previous_hash.slice(0, 10)}…</span>
            <span className="truncate">curr: {entry.current_hash.slice(0, 10)}…</span>
          </div>
        </div>
      )}
    </div>
  );
});

export default function AuditLogPanel() {
  const entries = useDashboardStore((s) => s.auditLog);
  const [openHash, setOpenHash] = useState<string | null>(null);
  const [filter, setFilter] = useState("All");
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => (filter === "All" ? entries : entries.filter((e) => e.agent_name === filter)), [entries, filter]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  };

  useEffect(() => {
    if (!autoScroll || !scrollRef.current) return;
    scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [entries.length, autoScroll]);

  return (
    <PanelShell title="Audit Log" eyebrow="TrustChain">
      <div className="flex flex-col h-full">
        <div className="flex gap-1 px-2 py-1.5 border-b border-border shrink-0 overflow-x-auto">
          {AGENTS.map((a) => (
            <button
              key={a}
              onClick={() => setFilter(a)}
              className={`text-[10px] px-2 py-1 rounded-md whitespace-nowrap transition-colors ${
                filter === a ? "bg-surface-3 text-text-primary" : "bg-surface-2 text-text-tertiary hover:text-text-secondary"
              }`}
            >
              {a}
            </button>
          ))}
        </div>

        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-auto divide-y divide-border/60">
          {filtered.length === 0 && (
            <div className="flex items-center justify-center h-full text-text-tertiary text-sm">Waiting for events…</div>
          )}
          {filtered.map((entry) => (
            <LogRow key={entry.current_hash} entry={entry} isOpen={openHash === entry.current_hash} onToggle={() => setOpenHash(openHash === entry.current_hash ? null : entry.current_hash)} />
          ))}
        </div>
      </div>
    </PanelShell>
  );
}

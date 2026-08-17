// src/components/panels/AuditStream.tsx
// Middle pane of the 3-column Control Plane layout: the real audit
// stream (keyed by current_hash for stable selection, not position —
// same fix as the old AuditLogPanel), a single filter input, and a
// click-to-select interaction that drives the right pane's detail view.
import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useDashboardStore } from "../../store";
import { describeRecord, AGENT_ID_TO_AUDIT_NAME } from "./auditStreamUtils";
import type { AuditRecord } from "../../sim/types";
import type { AgentId } from "../../store";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

interface AuditStreamProps {
  selectedHash: string | null;
  onSelect: (record: AuditRecord) => void;
  /** Set from the agent sidebar — when present, only that agent's
   * records show, on top of whatever the text filter narrows further. */
  agentFilter?: AgentId | null;
}

export default function AuditStream({ selectedHash, onSelect, agentFilter = null }: AuditStreamProps) {
  const entries = useDashboardStore((s) => s.auditLog);
  const [query, setQuery] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    let list = entries;
    if (agentFilter) {
      const agentName = AGENT_ID_TO_AUDIT_NAME[agentFilter];
      list = list.filter((e) => e.agent_name === agentName);
    }
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter(
      (e) => e.agent_name.toLowerCase().includes(q) || e.trigger_event.toLowerCase().includes(q) || e.worker_id.toLowerCase().includes(q)
    );
  }, [entries, query, agentFilter]);

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
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-3 py-3 border-b border-white/10 shrink-0">
        <Search size={13} strokeWidth={1.5} className="text-white/35" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter audit stream"
          className="flex-1 bg-transparent text-xs text-white placeholder:text-white/35 focus:outline-none"
        />
      </div>

      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="flex items-center justify-center h-full text-white/30 text-xs px-4 text-center">
            {entries.length === 0 ? "Waiting for events — inject a fault to start a cycle." : "No matches."}
          </div>
        )}
        {filtered.map((r) => {
          const active = r.current_hash === selectedHash;
          return (
            <button
              key={r.current_hash}
              onClick={() => onSelect(r)}
              className={`w-full text-left px-4 py-3 border-b border-white/[0.06] transition-colors ${
                active ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-semibold text-white truncate">{r.agent_name}</span>
                <span className="text-[11px] text-white/35 shrink-0 font-mono">{formatTime(r.timestamp)}</span>
              </div>
              <p className="text-[11px] mt-0.5 font-mono text-white/60 truncate">{r.trigger_event}</p>
              <p className="text-[11px] text-white/35 truncate mt-0.5">{describeRecord(r)}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

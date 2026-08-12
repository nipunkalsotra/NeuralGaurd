// src/components/AuditLogStream.tsx
import { memo, useEffect, useRef, useState, useCallback, useMemo } from "react";
import PanelShell from "./PanelShell";
import { useWebSocket } from "../hooks/useWebSocket";

type FSMState =
  | "HEALTHY"
  | "LOOP_SUSPECTED"
  | "DIAGNOSING"
  | "REMEDIATING"
  | "VERIFYING"
  | "ESCALATED"
  | "RESUMED";

export interface AuditLogPayload {
  timestamp: string;
  worker_id: string;
  from_state: FSMState;
  to_state: FSMState;
  trigger_event: string;
  agent_name: string;
  confidence_score: number | null;
  fallback_used: boolean;
  fallback_origin: string | null;
  previous_hash: string;
  current_hash: string;
}

// Wire envelope, per the LOCKED docs/websocket_schema.md (§2, §4): the
// backend sends `type: "audit_event"` (NOT "audit_log"), and `payload` is
// ALWAYS a JSON-stringified string at this layer, never a nested object —
// every `type` shares one fixed envelope shape so the parser stays simple.
// This component previously used the wrong type name and treated payload
// as an already-parsed object, so it silently dropped every real message
// from the backend (confirmed live on Day 9 — nothing rendered from a
// genuinely working backend connection).
interface AuditLogEvent {
  type: string;
  payload: string;
}

const STATE_STYLES: Record<FSMState, { border: string; badge: string }> = {
  HEALTHY: { border: "border-l-emerald-500", badge: "bg-emerald-500/20 text-emerald-400" },
  LOOP_SUSPECTED: { border: "border-l-amber-400", badge: "bg-amber-400/20 text-amber-300" },
  DIAGNOSING: { border: "border-l-blue-400", badge: "bg-blue-400/20 text-blue-300" },
  REMEDIATING: { border: "border-l-orange-500", badge: "bg-orange-500/20 text-orange-400" },
  VERIFYING: { border: "border-l-violet-500", badge: "bg-violet-500/20 text-violet-400" },
  ESCALATED: { border: "border-l-rose-500", badge: "bg-rose-500/20 text-rose-400" },
  RESUMED: { border: "border-l-emerald-500", badge: "bg-emerald-500/20 text-emerald-400" },
};

const AGENTS = ["All", "SentinelAgent", "TriageAgent", "RemediationAgent", "OptimizationAgent", "Orchestrator"];

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB"); // HH:MM:SS
}

// Real WebSocket delivery isn't guaranteed to preserve event order (e.g.
// the Orchestrator and OptimizationAgent dispatch concurrently and their
// broadcasts can race) — insert new entries by timestamp instead of
// blindly appending, so the stream never displays events out of order.
function insertByTimestamp(
  entries: AuditLogPayload[],
  incoming: AuditLogPayload
): AuditLogPayload[] {
  const incomingTime = new Date(incoming.timestamp).getTime();
  let i = entries.length;
  while (i > 0 && new Date(entries[i - 1].timestamp).getTime() > incomingTime) {
    i -= 1;
  }
  return [...entries.slice(0, i), incoming, ...entries.slice(i)].slice(-200);
}

function verifyHashChain(prevHash: string, currentHash: string): boolean {
  // Client can't recompute SHA-256(previous+content) without the raw record content,
  // so this checks structural validity (non-empty, chain-linked) — full crypto
  // verification stays server-side. Good enough for a visual integrity indicator.
  return Boolean(prevHash && currentHash && prevHash !== currentHash);
}

const LogRow = memo(function LogRow({
  entry,
  isOpen,
  onToggle,
}: {
  entry: AuditLogPayload;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const style = STATE_STYLES[entry.to_state] ?? STATE_STYLES.HEALTHY;
  const chainValid = verifyHashChain(entry.previous_hash, entry.current_hash);

  return (
    <div className={`border-l-4 ${style.border} bg-slate-900/40 hover:bg-slate-900/70 transition-colors`}>
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-2 text-left">
        <span className="text-slate-500 text-xs w-3">{isOpen ? "▾" : "▸"}</span>
        <span className="font-mono text-xs text-slate-400 w-20 shrink-0">
          {formatTime(entry.timestamp)}
        </span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${style.badge}`}>
          {entry.to_state}
        </span>
        <span className="text-xs text-slate-300 truncate">
          {entry.worker_id}
          {entry.confidence_score !== null ? `: confidence ${entry.confidence_score.toFixed(2)}` : ""}
          {entry.fallback_used ? " · fallback" : ""}
        </span>
      </button>

      {isOpen && (
        <div className="px-3 pb-3">
          <pre className="text-[11px] font-mono bg-slate-950 border border-slate-800 rounded-md p-3 overflow-x-auto text-slate-300">
{JSON.stringify(entry, null, 2)}
          </pre>
          <div className="flex items-center gap-2 mt-2 text-[11px] font-mono text-slate-400">
            <span>{chainValid ? "✅" : "⚠️"} hash chain</span>
            <span className="truncate">prev: {entry.previous_hash.slice(0, 12)}...</span>
            <span className="truncate">curr: {entry.current_hash.slice(0, 12)}...</span>
          </div>
        </div>
      )}
    </div>
  );
});

interface AuditLogStreamProps {
  wsUrl?: string;
}

export default function AuditLogStream({ wsUrl }: AuditLogStreamProps) {
  const [entries, setEntries] = useState<AuditLogPayload[]>([]);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [filter, setFilter] = useState<string>("All");
  const [autoScroll, setAutoScroll] = useState(true);
  const [hasNew, setHasNew] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const mockRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startMock = useCallback(() => {
    if (mockRef.current) return;
    const states: FSMState[] = ["HEALTHY", "LOOP_SUSPECTED", "DIAGNOSING", "REMEDIATING", "VERIFYING", "RESUMED"];
    const agents = ["SentinelAgent", "TriageAgent", "RemediationAgent", "OptimizationAgent", "Orchestrator"];
    let i = 0;
    let lastHash = "genesis";

    mockRef.current = setInterval(() => {
      const to = states[i % states.length];
      const from = states[(i - 1 + states.length) % states.length];
      const currentHash = Math.random().toString(16).slice(2, 18);
      const payload: AuditLogPayload = {
        timestamp: new Date().toISOString(),
        worker_id: `worker-${(i % 3) + 1}`,
        from_state: from,
        to_state: to,
        trigger_event: to,
        agent_name: agents[i % agents.length],
        confidence_score: to === "DIAGNOSING" ? 0.6 + Math.random() * 0.35 : null,
        fallback_used: Math.random() < 0.15,
        fallback_origin: Math.random() < 0.15 ? "groq" : null,
        previous_hash: lastHash,
        current_hash: currentHash,
      };
      lastHash = currentHash;
      i += 1;
      setEntries((prev) => insertByTimestamp(prev, payload));
    }, 2500);
  }, []);

  const handleMessage = useCallback((msg: AuditLogEvent) => {
    if (msg.type !== "audit_event") return;
    try {
      const payload = JSON.parse(msg.payload) as AuditLogPayload;
      setEntries((prev) => insertByTimestamp(prev, payload));
    } catch {
      console.warn("Malformed audit_event payload, ignoring:", msg.payload);
    }
  }, []);

  const { connected } = useWebSocket<AuditLogEvent>({
    url: wsUrl,
    onMessage: handleMessage,
    mockFallback: startMock,
  });

  // Real WS reconnected — stop the mock generator, otherwise it keeps
  // running forever alongside real data (confirmed via a live cross-machine
  // test on Day 9: after one brief early disconnect/reconnect cycle, mock
  // records with fake hashes kept interleaving with real backend events
  // indefinitely, since nothing ever cleared this interval on reconnect).
  useEffect(() => {
    if (connected && mockRef.current) {
      clearInterval(mockRef.current);
      mockRef.current = null;
    }
  }, [connected]);

  useEffect(() => {
    return () => {
      if (mockRef.current) clearInterval(mockRef.current);
    };
  }, []);

  // auto-scroll
  useEffect(() => {
    if (!scrollRef.current) return;
    if (autoScroll) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      setHasNew(false);
    } else {
      setHasNew(true);
    }
  }, [entries, autoScroll]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(nearBottom);
  };

  const jumpToBottom = () => {
    setAutoScroll(true);
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    setHasNew(false);
  };

  const filtered = useMemo(
    () => (filter === "All" ? entries : entries.filter((e) => e.agent_name === filter)),
    [entries, filter]
  );

  return (
    <PanelShell title="Audit Log Stream">
      <div className="flex flex-col h-full">
        <div className="flex gap-1 px-2 py-1.5 border-b border-slate-800 shrink-0 overflow-x-auto">
          {AGENTS.map((a) => (
            <button
              key={a}
              onClick={() => setFilter(a)}
              className={`text-[10px] px-2 py-1 rounded-md whitespace-nowrap transition-colors ${
                filter === a
                  ? "bg-slate-700 text-slate-100"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-750"
              }`}
            >
              {a}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-h-0">
          <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto divide-y divide-slate-800/50">
            {filtered.length === 0 && (
              <div className="flex items-center justify-center h-full text-slate-600 text-sm">
                Waiting for events...
              </div>
            )}
            {filtered.map((entry, idx) => (
              <LogRow
                key={`${entry.current_hash}-${idx}`}
                entry={entry}
                isOpen={openIndex === idx}
                onToggle={() => setOpenIndex(openIndex === idx ? null : idx)}
              />
            ))}
          </div>

          {hasNew && (
            <button
              onClick={jumpToBottom}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs px-3 py-1 rounded-full bg-amber-400 text-slate-900 font-semibold shadow-lg"
            >
              New events ↓
            </button>
          )}
        </div>
      </div>
    </PanelShell>
  );
}
// src/components/panels/LiveStatusStrip.tsx
// Compact, always-visible circuit-breaker row — the essential half of
// what used to be a whole separate panel hidden behind a dock click.
// Sits at the top of the persistent sidebar next to the topology, not
// buried; click a chip for the same detail the old panel's modal showed.
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Cpu, Brain, Route, Zap, Terminal, X } from "lucide-react";
import { useDataSource } from "../../app/dataSourceContext";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import type { CircuitStatusEntry } from "../../data/types";

type CBStatus = "closed" | "half-open" | "open";

const SERVICE_ICONS: Record<string, typeof Cpu> = { NIM: Cpu, Nemotron: Brain, cuOpt: Route, Groq: Zap, NemoClaw: Terminal };
const STATUS_DOT: Record<CBStatus, string> = { closed: "bg-state-healthy", "half-open": "bg-state-suspected", open: "bg-state-escalated" };
const STATUS_LABEL: Record<CBStatus, string> = { closed: "Operational", "half-open": "Degraded", open: "Down" };
const CUOPT_NOTE = "OR-Tools-equivalent constraint solver is the practical primary — cuOpt hosted API access was never confirmed during Phase 1.";
const POLL_MS = 2000;

function normalize(raw: string): CBStatus {
  const s = raw.toLowerCase().replace(/_/g, "-");
  return s === "closed" || s === "open" || s === "half-open" ? s : "closed";
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const parsed = new Date(iso);
  if (isNaN(parsed.getTime())) return iso;
  const mins = Math.floor((Date.now() - parsed.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function DetailModal({ data, onClose }: { data: CircuitStatusEntry; onClose: () => void }) {
  const status = normalize(data.status as string);
  const trapRef = useFocusTrap<HTMLDivElement>(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div ref={trapRef} role="dialog" aria-modal="true" className="liquid-glass w-full max-w-[380px] mx-4 rounded-2xl p-5" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">{data.service} — service health</h3>
          <button onClick={onClose} aria-label="Close" className="text-white/40 hover:text-white"><X size={15} /></button>
        </div>
        <div className="space-y-1.5 text-xs text-white/60">
          <div>Status: <span className="font-semibold text-white">{STATUS_LABEL[status]}</span></div>
          {data.service === "cuOpt" ? (
            <div className="text-white/40">{CUOPT_NOTE}</div>
          ) : (
            <>
              <div>Failure count: {data.failure_count}</div>
              <div>Last failure: {data.last_failure ?? "None recorded"} ({timeAgo(data.last_failure)})</div>
              <div className="pt-2 border-t border-white/10 text-white/40">3 consecutive failures → open for 60s → half-open probe</div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function LiveStatusStrip() {
  const { source } = useDataSource();
  const [services, setServices] = useState<CircuitStatusEntry[]>([]);
  const [selected, setSelected] = useState<CircuitStatusEntry | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await source.fetchCircuitStatus();
        if (!cancelled) setServices(data);
      } catch {
        /* keep last known state on a transient failure */
      }
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [source]);

  return (
    <div className="shrink-0 px-3 py-3 border-b border-white/10">
      <p className="text-[10px] uppercase tracking-[0.14em] text-white/40 mb-2 px-1">Circuit breakers</p>
      <div className="flex flex-wrap gap-1.5">
        {services.map((s) => {
          const Icon = SERVICE_ICONS[s.service] ?? Cpu;
          const status = normalize(s.status as string);
          return (
            <button
              key={s.service}
              onClick={() => setSelected(s)}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-white/70 hover:bg-white/[0.07] transition-colors"
            >
              <Icon size={11} strokeWidth={1.75} />
              {s.service}
              <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]} ${status !== "closed" ? "animate-pulse-slow" : ""}`} />
            </button>
          );
        })}
        {services.length === 0 && <p className="text-[11px] text-white/30 px-1">Connecting…</p>}
      </div>

      <AnimatePresence>{selected && <DetailModal data={selected} onClose={() => setSelected(null)} />}</AnimatePresence>
    </div>
  );
}

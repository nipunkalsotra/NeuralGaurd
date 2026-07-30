// src/components/CircuitBreakerPanel.tsx
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cpu, Brain, Route, Zap, Terminal, X } from "lucide-react";
import PanelShell from "./PanelShell";

type CBStatus = "closed" | "half-open" | "open";

interface ServiceStatus {
  service: string;
  status: CBStatus;
  failure_count: number;
  last_failure: string | null;
}

const SERVICE_ICONS: Record<string, typeof Cpu> = {
  NIM: Cpu,
  Nemotron: Brain,
  cuOpt: Route,
  Groq: Zap,
  NemoClaw: Terminal,
};

const STATUS_CONFIG: Record<CBStatus, { dot: string; label: string; pulse: boolean }> = {
  closed: { dot: "bg-emerald-500", label: "Operational", pulse: false },
  "half-open": { dot: "bg-amber-400", label: "Degraded", pulse: true },
  open: { dot: "bg-rose-500", label: "Down", pulse: false },
};

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
const POLL_INTERVAL_MS = 2000;

const CUOPT_SKIPPED_REASON = "Skipped — API access unresolved, OR-Tools is primary solver";

// Backend returns uppercase/underscore status strings (CLOSED, OPEN,
// HALF_OPEN) from CircuitBreaker.get_status(). Normalize to the
// lowercase/hyphenated CBStatus type this component uses, with a safe
// fallback for anything unexpected so a mismatch can never crash the app.
function normalizeStatus(raw: string): CBStatus {
  const s = raw.toLowerCase().replace(/_/g, "-");
  if (s === "closed" || s === "open" || s === "half-open") return s;
  return "closed";
}

function applyCuOptOverride(services: ServiceStatus[]): ServiceStatus[] {
  return services.map((s) =>
    s.service === "cuOpt"
      ? { ...s, status: "open" as CBStatus, last_failure: CUOPT_SKIPPED_REASON }
      : s
  );
}

const MOCK_SERVICES: ServiceStatus[] = applyCuOptOverride(
  ["NIM", "Nemotron", "cuOpt", "Groq", "NemoClaw"].map((s) => ({
    service: s,
    status: "closed",
    failure_count: 0,
    last_failure: null,
  }))
);

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const parsed = new Date(iso);
  if (isNaN(parsed.getTime())) return iso;
  const diffMs = Date.now() - parsed.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function ServiceCard({
  data,
  index,
  onSelect,
}: {
  data: ServiceStatus;
  index: number;
  onSelect: () => void;
}) {
  const Icon = SERVICE_ICONS[data.service] ?? Cpu;
  const cfg = STATUS_CONFIG[data.status] ?? STATUS_CONFIG.closed; // defensive fallback
  const [hovered, setHovered] = useState(false);
  const isCuOpt = data.service === "cuOpt";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className="relative flex flex-col items-center gap-1.5 p-3 rounded-lg bg-slate-900/40 border border-slate-800 cursor-pointer hover:bg-slate-900/70 transition-colors"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onSelect}
    >
      <Icon size={18} className="text-slate-400" />
      <span className="text-xs font-bold text-slate-100">{data.service}</span>

      <motion.div
        className={`w-4 h-4 rounded-full ${cfg.dot}`}
        animate={cfg.pulse ? { scale: [1, 1.2, 1] } : {}}
        transition={cfg.pulse ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" } : {}}
      />
      <span className="text-[10px] text-slate-400">{isCuOpt ? "Unused" : cfg.label}</span>
      <span className="text-[9px] text-slate-500">{data.failure_count} failures</span>

      {hovered && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-48 p-2 rounded-md bg-slate-800 border border-slate-700 shadow-xl z-10 text-[10px] text-slate-300 space-y-0.5">
          <div>{isCuOpt ? data.last_failure : `Last failure: ${data.last_failure ?? "None recorded"}`}</div>
          {!isCuOpt && <div>{timeAgo(data.last_failure)}</div>}
        </div>
      )}
    </motion.div>
  );
}

function DetailModal({ data, onClose }: { data: ServiceStatus; onClose: () => void }) {
  const isCuOpt = data.service === "cuOpt";
  const cfg = STATUS_CONFIG[data.status] ?? STATUS_CONFIG.closed;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-[420px] mx-4 rounded-xl border border-slate-700 bg-slate-800 text-slate-100 p-6"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">{data.service} — Service Health</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-2 text-xs text-slate-300">
          <div>Status: <span className="font-semibold">{isCuOpt ? "Unused" : cfg.label}</span></div>
          {isCuOpt ? (
            <div className="text-slate-400">{CUOPT_SKIPPED_REASON}</div>
          ) : (
            <>
              <div>Failure count: {data.failure_count}</div>
              <div>Last failure: {data.last_failure ?? "None recorded"} ({timeAgo(data.last_failure)})</div>
              <div className="pt-2 border-t border-slate-700 text-slate-500">
                Config: 3 consecutive failures → open for 60s → half-open probe
              </div>
            </>
          )}
          <div className="text-slate-600 italic pt-1">
            Full state-change history not yet tracked server-side — this
            modal shows current snapshot only (Phase 2 candidate).
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function CircuitBreakerPanel() {
  const [services, setServices] = useState<ServiceStatus[]>(MOCK_SERVICES);
  const [selected, setSelected] = useState<ServiceStatus | null>(null);
  const [isLive, setIsLive] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/circuit-status`);
        if (!res.ok) throw new Error("bad response");
        const data = await res.json();
        const normalized: ServiceStatus[] = data.services.map((s: ServiceStatus) => ({
          ...s,
          status: normalizeStatus(s.status as unknown as string),
        }));
        setServices(applyCuOptOverride(normalized));
        setIsLive(true);
      } catch {
        setIsLive(false);
      }
    };

    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, []);

  return (
    <PanelShell title={`Circuit Breakers${isLive ? "" : " (offline)"}`} className="border-r border-slate-800">
      <div className="flex gap-3 p-3 h-full items-center justify-center flex-wrap">
        {services.map((s, i) => (
          <ServiceCard key={s.service} data={s} index={i} onSelect={() => setSelected(s)} />
        ))}
      </div>

      <AnimatePresence>
        {selected && <DetailModal data={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </PanelShell>
  );
}
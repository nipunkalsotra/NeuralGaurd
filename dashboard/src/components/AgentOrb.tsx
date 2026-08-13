// src/components/AgentOrb.tsx
import { memo } from "react";
import { Handle, Position } from "reactflow";
import { motion } from "framer-motion";

export type WorkerState =
  | "HEALTHY"
  | "LOOP_SUSPECTED"
  | "DIAGNOSING"
  | "REMEDIATING"
  | "VERIFYING"
  | "ESCALATED"
  | "RESUMED";

const STATE_COLOR: Record<WorkerState, string> = {
  HEALTHY: "16,185,129",
  LOOP_SUSPECTED: "251,191,36",
  DIAGNOSING: "96,165,250",
  REMEDIATING: "249,115,22",
  VERIFYING: "139,92,246",
  ESCALATED: "244,63,94",
  RESUMED: "16,185,129",
};

// Pulse rate reflects urgency, per Day 8 animation timing spec:
// calm states pulse slowly, active states pulse faster, escalated is urgent.
const PULSE_DURATION: Record<WorkerState, number> = {
  HEALTHY: 2,
  RESUMED: 2,
  LOOP_SUSPECTED: 1,
  DIAGNOSING: 1,
  REMEDIATING: 1,
  VERIFYING: 1,
  ESCALATED: 0.5,
};

// Day 12: each agent has exactly one "flavor" of fallback per the guide
// — Triage's Groq halo pulses (distinct from state color, urgent-ish);
// Sentinel/Optimization get a static ring (informational, not urgent);
// Remediation gets a static ring + explicit MOCK badge (the guide calls
// this one out by name, unlike the other three which just get a ring).
// Keyed by the real fallback_origin string values the backend actually
// produces (see orchestrator.py's Day 10/12 fallback_origin wiring).
const FALLBACK_STYLES: Record<string, { ringRgb: string; badge: string | null; pulsing: boolean }> = {
  groq: { ringRgb: "250,204,21", badge: "Groq", pulsing: true },
  rule_based_heuristic: { ringRgb: "250,204,21", badge: "Heuristic", pulsing: true },
  "sentence-transformers": { ringRgb: "96,165,250", badge: null, pulsing: false },
  "or-tools": { ringRgb: "249,115,22", badge: null, pulsing: false },
  greedy_round_robin: { ringRgb: "249,115,22", badge: null, pulsing: false },
  mock: { ringRgb: "148,163,184", badge: "MOCK", pulsing: false },
};

export interface AgentOrbData {
  label: string;
  state: WorkerState;
  fallbackOrigin?: string | null;
  onSelect: () => void;
}

interface AgentOrbNodeProps {
  data: AgentOrbData;
}

function AgentOrbNode({ data }: AgentOrbNodeProps) {
  const rgb = STATE_COLOR[data.state];
  const duration = PULSE_DURATION[data.state];
  const fallback = data.fallbackOrigin ? FALLBACK_STYLES[data.fallbackOrigin] : undefined;

  return (
    <div className="flex flex-col items-center gap-1.5" onClick={data.onSelect}>
      <Handle type="target" position={Position.Top} id="top-target" className="opacity-0" />
      <Handle type="source" position={Position.Top} id="top-source" className="opacity-0" />
      <Handle type="target" position={Position.Left} id="left-target" className="opacity-0" />
      <Handle type="source" position={Position.Left} id="left-source" className="opacity-0" />
      <Handle type="target" position={Position.Right} id="right-target" className="opacity-0" />
      <Handle type="source" position={Position.Right} id="right-source" className="opacity-0" />
      <Handle type="target" position={Position.Bottom} id="bottom-target" className="opacity-0" />
      <Handle type="source" position={Position.Bottom} id="bottom-source" className="opacity-0" />

      <div className="relative">
        {fallback && (
          <motion.div
            className="absolute -inset-1.5 rounded-full border-2"
            style={{ borderColor: `rgba(${fallback.ringRgb},0.7)` }}
            animate={fallback.pulsing ? { opacity: [0.4, 1, 0.4] } : { opacity: 1 }}
            transition={fallback.pulsing ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" } : undefined}
          />
        )}
        <motion.div
          key={data.state}
          initial={{ scale: 1 }}
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration, repeat: Infinity, ease: "easeInOut" }}
          className="w-20 h-20 rounded-full cursor-pointer bg-slate-900 border border-slate-700"
          style={{
            boxShadow: `0 0 20px rgba(${rgb},0.3), 0 0 40px rgba(${rgb},0.3), 0 0 60px rgba(${rgb},0.3)`,
          }}
        />
      </div>
      <span className="text-xs text-slate-300 font-medium">{data.label}</span>
      {fallback?.badge && (
        <motion.span
          className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
          style={{
            backgroundColor: `rgba(${fallback.ringRgb},0.2)`,
            borderWidth: 1,
            borderColor: `rgba(${fallback.ringRgb},0.5)`,
            color: `rgb(${fallback.ringRgb})`,
          }}
          animate={fallback.pulsing ? { scale: [1, 1.05, 1] } : {}}
          transition={fallback.pulsing ? { duration: 2, repeat: Infinity } : undefined}
        >
          {fallback.badge}
        </motion.span>
      )}
    </div>
  );
}

export default memo(AgentOrbNode);
// src/components/viz/AgentOrb.tsx
import { memo } from "react";
import { Handle, Position } from "reactflow";
import { motion } from "framer-motion";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import type { WorkerState } from "../../sim/types";
import { stateColor, fallbackColor } from "../../design/tokens";

// Pulse rate reflects urgency per docs/animation_timing.md: calm states
// pulse slowly, active states faster, escalated is urgent.
const PULSE_DURATION: Record<WorkerState, number> = {
  HEALTHY: 2.4,
  RESUMED: 2.4,
  LOOP_SUSPECTED: 1.1,
  DIAGNOSING: 1.1,
  REMEDIATING: 1.1,
  VERIFYING: 1.1,
  ESCALATED: 0.55,
};

// States where the agent is genuinely mid-work get a rotating scan ring
// on top of the pulse — a distinct visual register from "idle and
// healthy" or "terminal and escalated", reinforcing that something is
// actively happening rather than just glowing.
const PROCESSING_STATES = new Set<WorkerState>(["LOOP_SUSPECTED", "DIAGNOSING", "REMEDIATING", "VERIFYING"]);

const FALLBACK_STYLES: Record<string, { badge: string | null; pulsing: boolean }> = {
  groq: { badge: "Groq", pulsing: true },
  rule_based_heuristic: { badge: "Heuristic", pulsing: true },
  "sentence-transformers": { badge: null, pulsing: false },
  hash: { badge: "Hash", pulsing: true },
  "constraint-solver": { badge: null, pulsing: false },
  "or-tools": { badge: null, pulsing: false },
  greedy_round_robin: { badge: "Greedy", pulsing: false },
  mock: { badge: "MOCK", pulsing: false },
};

export interface AgentOrbData {
  label: string;
  state: WorkerState;
  fallbackOrigin?: string | null;
  onSelect: () => void;
  /** The Orchestrator renders as the reactor core: larger, with a
   * standing containment ring, anchoring the radial layout. */
  core?: boolean;
}

function AgentOrbNode({ data }: { data: AgentOrbData }) {
  const reduced = useReducedMotion();
  const rgb = stateColor[data.state];
  const duration = PULSE_DURATION[data.state];
  const fallback = data.fallbackOrigin ? FALLBACK_STYLES[data.fallbackOrigin] : undefined;
  const processing = PROCESSING_STATES.has(data.state);
  const size = data.core ? 108 : 72;

  return (
    <button
      type="button"
      onClick={data.onSelect}
      aria-label={`${data.label}: ${data.state}${data.fallbackOrigin ? `, fallback ${data.fallbackOrigin}` : ""}`}
      className="flex flex-col items-center gap-1.5 bg-transparent border-0 cursor-pointer group"
    >
      <Handle type="target" position={Position.Top} id="top-target" className="opacity-0" />
      <Handle type="source" position={Position.Top} id="top-source" className="opacity-0" />
      <Handle type="target" position={Position.Left} id="left-target" className="opacity-0" />
      <Handle type="source" position={Position.Left} id="left-source" className="opacity-0" />
      <Handle type="target" position={Position.Right} id="right-target" className="opacity-0" />
      <Handle type="source" position={Position.Right} id="right-source" className="opacity-0" />
      <Handle type="target" position={Position.Bottom} id="bottom-target" className="opacity-0" />
      <Handle type="source" position={Position.Bottom} id="bottom-source" className="opacity-0" />

      <div className="relative">
        {/* Outer atmosphere — a wide, very soft bloom beneath everything
            else, the layer that reads as "this thing is lit from within"
            rather than just outlined. */}
        <div
          className="absolute rounded-full blur-2xl transition-opacity duration-500"
          style={{
            inset: data.core ? -34 : -28,
            background: `radial-gradient(circle, ${rgb}${data.core ? "44" : "33"} 0%, transparent 70%)`,
            opacity: processing ? 0.95 : data.core ? 0.75 : 0.55,
          }}
          aria-hidden="true"
        />

        {/* Standing containment ring — the Orchestrator core only, a
            second static ring further out than the pulse, marking it as
            the hub the other four agents orbit. */}
        {data.core && (
          <div
            className="absolute rounded-full border border-white/15"
            style={{ inset: -20 }}
            aria-hidden="true"
          />
        )}

        {/* Rotating scan ring — only for agents genuinely mid-work */}
        {processing && (
          <motion.div
            className="absolute rounded-full"
            style={{
              inset: data.core ? -14 : -14,
              background: `conic-gradient(from 0deg, transparent 0%, ${rgb} 12%, transparent 26%)`,
              WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #fff calc(100% - 2px))",
              mask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #fff calc(100% - 2px))",
            }}
            animate={reduced ? {} : { rotate: 360 }}
            transition={reduced ? undefined : { duration: 2.4, repeat: Infinity, ease: "linear" }}
            aria-hidden="true"
          />
        )}

        {fallback && (
          <motion.div
            className="absolute rounded-full border"
            style={{ inset: -8, borderColor: fallbackColor }}
            animate={fallback.pulsing ? { opacity: [0.35, 0.9, 0.35] } : { opacity: 0.7 }}
            transition={fallback.pulsing ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : undefined}
          />
        )}

        {/* One-shot expanding "ping" — the topology previously only
            updated via a continuous breathing pulse, easy to read as
            static at a glance. Keying this on data.state means React
            mounts a fresh instance (replaying the one-shot animation)
            every time the state actually changes, giving an unmissable
            "something just happened here" flash on top of the ambient
            pulse. */}
        {!reduced && (
          <motion.div
            key={`ping-${data.state}`}
            className="absolute rounded-full border-2 pointer-events-none"
            style={{ borderColor: rgb }}
            initial={{ opacity: 0.9, scale: 1 }}
            animate={{ opacity: 0, scale: 1.9 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            aria-hidden="true"
          />
        )}

        <motion.div
          key={data.state}
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration, repeat: Infinity, ease: "easeInOut" }}
          className="relative rounded-full bg-surface-2 border border-white/15 transition-transform duration-150 group-hover:scale-[1.04] group-active:scale-95"
          style={{ width: size, height: size, boxShadow: `0 0 24px ${rgb}70, 0 0 56px ${rgb}38, inset 0 1px 1px rgba(255,255,255,0.15)` }}
        >
          {/* A small off-center specular highlight — the detail that
              reads as "glass sphere" rather than "flat circle". */}
          <div
            className="absolute left-[22%] top-[18%] h-[26%] w-[26%] rounded-full"
            style={{ background: "radial-gradient(circle, rgba(255,255,255,0.5), transparent 70%)" }}
            aria-hidden="true"
          />
        </motion.div>
      </div>

      <span className={`font-medium text-white/85 ${data.core ? "text-[13px]" : "text-[11px]"}`}>{data.label}</span>
      {/* Live state readout — always visible, no click required. This
          is the piece that used to be hidden behind the detail drawer,
          which is what made the whole graph look inert at a glance. */}
      <span
        className="text-[9px] font-mono uppercase tracking-wider"
        style={{ color: rgb, textShadow: `0 0 8px ${rgb}80` }}
      >
        {data.state}
      </span>
      {fallback?.badge && (
        <span
          className="text-[9px] px-2 py-0.5 rounded-full font-semibold border"
          style={{ backgroundColor: `${fallbackColor}20`, borderColor: `${fallbackColor}60`, color: fallbackColor }}
        >
          {fallback.badge}
        </span>
      )}
    </button>
  );
}

export default memo(AgentOrbNode);

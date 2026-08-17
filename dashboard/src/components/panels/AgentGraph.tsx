// src/components/panels/AgentGraph.tsx
// The Control Plane's main stage. Previously a scattered rectangular
// layout with all five agents given equal visual weight; now a radial
// "reactor core" arrangement — Orchestrator anchored at the center as
// the larger hub, the four working agents orbiting it at compass points
// (Sentinel west, Triage north, Remediation east, Optimization south) —
// which is also topologically honest: Sentinel feeds the Orchestrator,
// which dispatches Triage, which hands off to Remediation, which
// reports back to the Orchestrator, which also drives Optimization.
//
// Cinematic pass: a custom SignalEdge draws a genuine traveling pulse
// along the active edge's own bezier path, AgentOrb carries a rotating
// scan ring while an agent is mid-work AND an always-visible state
// readout (no click required to see what's happening), and the whole
// stage tilts very slightly toward the cursor. All of it respects
// prefers-reduced-motion.
import { useMemo, useRef, useState } from "react";
import ReactFlow, { Background, Controls, type Edge, type Node } from "reactflow";
import "reactflow/dist/style.css";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import AgentOrbNode, { type AgentOrbData } from "../viz/AgentOrb";
import SignalEdge from "../viz/SignalEdge";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { useDashboardStore, AGENT_LABELS, type AgentId } from "../../store";

const nodeTypes = { agentOrb: AgentOrbNode };
const edgeTypes = { signal: SignalEdge };

// Compass layout around a central core.
const CENTER = { x: 400, y: 260 };
const RADIUS = 230;
const POSITIONS: Record<AgentId, { x: number; y: number }> = {
  orchestrator: CENTER,
  sentinel: { x: CENTER.x - RADIUS, y: CENTER.y }, // west
  triage: { x: CENTER.x, y: CENTER.y - RADIUS }, // north
  remediation: { x: CENTER.x + RADIUS, y: CENTER.y }, // east
  optimization: { x: CENTER.x, y: CENTER.y + RADIUS }, // south
};

const EDGE_DEFS = [
  { id: "e1", source: "sentinel", sourceHandle: "right-source", target: "orchestrator", targetHandle: "left-target", label: "LOOP_SUSPECTED" },
  { id: "e2", source: "orchestrator", sourceHandle: "top-source", target: "triage", targetHandle: "bottom-target", label: "DIAGNOSING" },
  { id: "e3", source: "orchestrator", sourceHandle: "bottom-source", target: "optimization", targetHandle: "top-target", label: "REROUTE" },
  { id: "e4", source: "triage", sourceHandle: "right-source", target: "remediation", targetHandle: "top-target", label: "DIAGNOSIS_COMPLETE" },
  { id: "e5", source: "remediation", sourceHandle: "left-source", target: "orchestrator", targetHandle: "right-target", label: "REMEDIATION_SUCCESS" },
] as const;

/** A tiny 4-bar equalizer, replacing the static dot on the "Live
 * topology" pill — reads as "signal", not just "status light". */
function LiveWaveform() {
  const bars = [0.5, 1, 0.65, 0.85];
  return (
    <span className="flex items-end gap-[2px] h-3" aria-hidden="true">
      {bars.map((h, i) => (
        <motion.span
          key={i}
          className="w-[2.5px] rounded-full bg-state-healthy motion-safe-only"
          style={{ height: `${h * 100}%` }}
          animate={{ scaleY: [0.35, 1, 0.35] }}
          transition={{ duration: 1 + i * 0.15, repeat: Infinity, ease: "easeInOut", delay: i * 0.12 }}
        />
      ))}
    </span>
  );
}

/** Decorative containment rings behind the reactor core — screen-space,
 * not flow-space (doesn't track pan/zoom, which is fine: this stage
 * doesn't invite heavy panning and fitView keeps the core roughly
 * centered). Two static rings plus one slow rotating dashed ring. */
function CoreRings({ reduced }: { reduced: boolean }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2" aria-hidden="true">
      <div className="absolute -inset-[150px] rounded-full border border-white/[0.05]" />
      <div className="absolute -inset-[230px] rounded-full border border-white/[0.04]" />
      <div
        className="absolute -inset-[190px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(61,129,227,0.10) 0%, transparent 65%)",
        }}
      />
      {!reduced && (
        <motion.svg
          className="absolute -inset-[190px]"
          width={380}
          height={380}
          viewBox="0 0 380 380"
          animate={{ rotate: 360 }}
          transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
        >
          <circle
            cx={190}
            cy={190}
            r={188}
            fill="none"
            stroke="rgba(0,210,255,0.14)"
            strokeWidth={1}
            strokeDasharray="1 10"
          />
        </motion.svg>
      )}
    </div>
  );
}

export default function AgentGraph() {
  const agents = useDashboardStore((s) => s.agents);
  const activeEdge = useDashboardStore((s) => s.activeEdge);
  const [selected, setSelected] = useState<AgentId | null>(null);
  const reduced = useReducedMotion();

  // Subtle parallax tilt toward the cursor — a real perspective transform
  // on the stage, springed so it settles rather than snapping, and fully
  // inert under reduced motion (rotation stays at 0 always).
  const containerRef = useRef<HTMLDivElement>(null);
  const rawX = useMotionValue(0.5);
  const rawY = useMotionValue(0.5);
  const springX = useSpring(rawX, { stiffness: 60, damping: 18 });
  const springY = useSpring(rawY, { stiffness: 60, damping: 18 });
  const rotateX = useTransform(springY, [0, 1], [2.2, -2.2]);
  const rotateY = useTransform(springX, [0, 1], [-2.5, 2.5]);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduced) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    rawX.set((e.clientX - rect.left) / rect.width);
    rawY.set((e.clientY - rect.top) / rect.height);
  };
  const handlePointerLeave = () => {
    rawX.set(0.5);
    rawY.set(0.5);
  };

  const nodes: Node<AgentOrbData>[] = useMemo(
    () =>
      (Object.keys(POSITIONS) as AgentId[]).map((id) => ({
        id,
        type: "agentOrb",
        position: POSITIONS[id],
        data: {
          label: AGENT_LABELS[id],
          state: agents[id].state,
          fallbackOrigin: agents[id].fallbackOrigin,
          onSelect: () => setSelected(id),
          core: id === "orchestrator",
        },
        draggable: false,
      })),
    [agents]
  );

  const edges: Edge[] = useMemo(
    () =>
      EDGE_DEFS.map((e) => ({
        id: e.id,
        type: "signal",
        source: e.source,
        sourceHandle: e.sourceHandle,
        target: e.target,
        targetHandle: e.targetHandle,
        label: e.label,
        data: { active: activeEdge === e.id },
      })),
    [activeEdge]
  );

  const selectedAgent = selected ? agents[selected] : null;

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="relative h-full w-full overflow-hidden"
      style={{ perspective: 1400 }}
    >
      <CoreRings reduced={reduced} />

      {/* Center-weighted spotlight — pulls focus toward the reactor core
          instead of the stage reading as a flat, uniformly-lit plane. */}
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{ background: "radial-gradient(ellipse 55% 55% at 50% 48%, transparent 35%, rgba(0,0,0,0.3) 100%)" }}
        aria-hidden="true"
      />

      {/* Floating eyebrow — replaces the old boxed PanelShell title bar */}
      <div className="liquid-glass pointer-events-none absolute left-4 top-4 z-10 flex items-center gap-2.5 rounded-full px-3 py-1.5">
        <LiveWaveform />
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/80 text-glow-white">Live topology</span>
      </div>

      <motion.div
        className="relative z-[2] h-full w-full"
        style={reduced ? undefined : { rotateX, rotateY, transformStyle: "preserve-3d" }}
      >
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView proOptions={{ hideAttribution: true }} nodesDraggable={false}>
          <Background color="rgba(255,255,255,0.06)" gap={28} />
          <Controls showInteractive={false} className="!bottom-24 sm:!bottom-6 !left-4 [&>button]:!bg-white/5 [&>button]:!border-white/10 [&>button]:!fill-white [&>button:hover]:!bg-white/10" />
        </ReactFlow>
      </motion.div>

      <AnimatePresence>
        {selected && selectedAgent && (
          <motion.div
            role="dialog"
            aria-label={`${AGENT_LABELS[selected]} detail`}
            className="liquid-glass absolute right-4 top-4 bottom-4 z-20 w-[280px] rounded-2xl p-4"
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            transition={{ type: "tween", duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">{AGENT_LABELS[selected]}</h3>
              <button onClick={() => setSelected(null)} aria-label="Close" className="text-white/40 hover:text-white transition-colors">
                ✕
              </button>
            </div>
            <p className="text-xs text-white/40 mb-1">Current state</p>
            <p className="text-sm text-white mb-4 font-mono">{selectedAgent.state}</p>
            <p className="text-xs text-white/40 mb-1">Last 3 events</p>
            <ul className="text-xs text-white/70 space-y-1 mb-4">
              {selectedAgent.events.length === 0 && <li className="text-white/30">No events yet</li>}
              {selectedAgent.events.map((ev, i) => (
                <li key={i} className="truncate font-mono">• {ev}</li>
              ))}
            </ul>
            <p className="text-xs text-white/40 mb-1">Fallback status</p>
            <p className="text-sm text-white font-mono">{selectedAgent.fallbackOrigin ?? "None — primary path"}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

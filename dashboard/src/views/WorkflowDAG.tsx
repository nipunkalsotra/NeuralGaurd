// src/views/WorkflowDAG.tsx
import { useCallback, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, type Edge, type Node } from "reactflow";
import "reactflow/dist/style.css";
import { AnimatePresence, motion } from "framer-motion";
import PanelShell from "../components/PanelShell";
import AgentOrbNode, { type AgentOrbData } from "../components/AgentOrb";
import { useDashboardStore, type AgentId } from "../store/dashboardStore";

const nodeTypes = { agentOrb: AgentOrbNode };

// runHealSequence/triggerEscalation below are scripted, local-only
// animations, not driven by the real backend — they exist for offline
// rehearsal. Gated behind the same flag as App.tsx's "Show Mock ..."
// buttons so they can't be mistaken for live backend activity during an
// actual demo, and clearly relabeled below regardless.
const REHEARSAL_CONTROLS = import.meta.env.VITE_DEBUG_CONTROLS === "true";

const POSITIONS: Record<AgentId, { x: number; y: number }> = {
  sentinel: { x: 50, y: 180 },
  orchestrator: { x: 350, y: 180 },
  triage: { x: 650, y: 50 },
  remediation: { x: 650, y: 310 },
  optimization: { x: 350, y: 400 },
};

const LABELS: Record<AgentId, string> = {
  sentinel: "Sentinel",
  triage: "Triage",
  remediation: "Remediation",
  optimization: "Optimization",
  orchestrator: "Orchestrator",
};

const EDGE_DEFS = [
  { id: "e1", source: "sentinel", sourceHandle: "right-source", target: "orchestrator", targetHandle: "left-target", label: "LOOP_SUSPECTED" },
  { id: "e2", source: "orchestrator", sourceHandle: "right-source", target: "triage", targetHandle: "left-target", label: "DIAGNOSING" },
  { id: "e3", source: "orchestrator", sourceHandle: "bottom-source", target: "optimization", targetHandle: "top-target", label: "REROUTE" },
  { id: "e4", source: "triage", sourceHandle: "bottom-source", target: "remediation", targetHandle: "top-target", label: "DIAGNOSIS_COMPLETE" },
  { id: "e5", source: "remediation", sourceHandle: "left-source", target: "orchestrator", targetHandle: "right-target", label: "REMEDIATION_SUCCESS" },
] as const;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function WorkflowDAG() {
  const agents = useDashboardStore((s) => s.agents);
  const activeEdge = useDashboardStore((s) => s.activeEdge);
  const setAgentState = useDashboardStore((s) => s.setAgentState);
  const setActiveEdge = useDashboardStore((s) => s.setActiveEdge);
  const resetAll = useDashboardStore((s) => s.resetAll);

  const [selected, setSelected] = useState<AgentId | null>(null);

  const nodes: Node<AgentOrbData>[] = useMemo(
    () =>
      (Object.keys(POSITIONS) as AgentId[]).map((id) => ({
        id,
        type: "agentOrb",
        position: POSITIONS[id],
        data: {
          label: LABELS[id],
          state: agents[id].state,
          fallbackOrigin: agents[id].fallbackOrigin,
          onSelect: () => setSelected(id),
        },
        draggable: false,
      })),
    [agents]
  );

  const edges: Edge[] = useMemo(
    () =>
      EDGE_DEFS.map((e) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle,
        target: e.target,
        targetHandle: e.targetHandle,
        label: e.label,
        animated: activeEdge === e.id,
        style: {
          stroke: activeEdge === e.id ? "#fbbf24" : "#475569",
          strokeWidth: activeEdge === e.id ? 2 : 1,
        },
        labelStyle: { fill: "#94a3b8", fontSize: 10 },
      })),
    [activeEdge]
  );

  const runHealSequence = useCallback(async () => {
    resetAll();
    await wait(200);
    setAgentState("sentinel", "LOOP_SUSPECTED", "similarity > 0.92 x3");
    setActiveEdge("e1");
    await wait(900);
    setAgentState("orchestrator", "LOOP_SUSPECTED", "LOOP_SUSPECTED received");
    setActiveEdge("e2");
    await wait(900);
    setAgentState("triage", "DIAGNOSING", "analyzing last 50 log lines");
    setAgentState("orchestrator", "DIAGNOSING");
    setActiveEdge("e3");
    await wait(900);
    setAgentState("optimization", "DIAGNOSING", "planning reroute (parallel)");
    await wait(900);
    setActiveEdge("e4");
    setAgentState("triage", "VERIFYING", "DIAGNOSIS_COMPLETE conf=0.91");
    await wait(900);
    setAgentState("remediation", "REMEDIATING", "patch generated");
    setActiveEdge("e5");
    await wait(900);
    setAgentState("remediation", "VERIFYING", "sandbox verified=true");
    setAgentState("orchestrator", "RESUMED", "REMEDIATION_SUCCESS");
    setActiveEdge(null);
    await wait(600);
    setAgentState("sentinel", "RESUMED");
    setAgentState("triage", "RESUMED");
    setAgentState("optimization", "RESUMED");
    setAgentState("remediation", "RESUMED");
  }, [resetAll, setAgentState, setActiveEdge]);

  const triggerEscalation = useCallback(() => {
    resetAll();
    setAgentState("sentinel", "LOOP_SUSPECTED");
    setTimeout(() => {
      setAgentState("triage", "ESCALATED", "confidence < 0.6");
      setAgentState("orchestrator", "ESCALATED");
    }, 700);
  }, [resetAll, setAgentState]);

  const selectedAgent = selected ? agents[selected] : null;

  return (
    <PanelShell title="Workflow DAG">
      <div className="relative h-full w-full">
        <div className="absolute top-2 left-2 z-10 flex gap-2">
          {REHEARSAL_CONTROLS && (
            <>
              <button
                onClick={runHealSequence}
                title="Scripted local animation — not driven by the real backend"
                className="text-xs px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300"
              >
                Rehearsal: Full Heal Sequence
              </button>
              <button
                onClick={triggerEscalation}
                title="Scripted local animation — not driven by the real backend"
                className="text-xs px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300"
              >
                Rehearsal: Escalation
              </button>
            </>
          )}
          <button
            onClick={resetAll}
            className="text-xs px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300"
          >
            Reset
          </button>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#334155" gap={24} />
          <Controls showInteractive={false} />
        </ReactFlow>

        <AnimatePresence>
          {selectedAgent && selected && (
            <motion.div
              className="absolute top-0 right-0 h-full w-[300px] bg-slate-900 border-l border-slate-700 z-20 p-4"
              initial={{ x: 300 }}
              animate={{ x: 0 }}
              exit={{ x: 300 }}
              transition={{ type: "tween", duration: 0.25 }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-100">{LABELS[selected]}</h3>
                <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-100">
                  ✕
                </button>
              </div>

              <p className="text-xs text-slate-400 mb-1">Current State</p>
              <p className="text-sm text-slate-200 mb-4">{selectedAgent.state}</p>

              <p className="text-xs text-slate-400 mb-1">Last 3 Events</p>
              <ul className="text-xs text-slate-300 space-y-1 mb-4">
                {selectedAgent.events.length === 0 && <li className="text-slate-600">No events yet</li>}
                {selectedAgent.events.map((ev, i) => (
                  <li key={i} className="truncate">• {ev}</li>
                ))}
              </ul>

              <p className="text-xs text-slate-400 mb-1">Fallback Status</p>
              <p className="text-sm text-slate-200">{selectedAgent.fallbackOrigin ?? "None"}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PanelShell>
  );
}
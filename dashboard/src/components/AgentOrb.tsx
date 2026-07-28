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

export interface AgentOrbData {
  label: string;
  state: WorkerState;
  fallbackActive?: boolean;
  onSelect: () => void;
}

interface AgentOrbNodeProps {
  data: AgentOrbData;
}

function AgentOrbNode({ data }: AgentOrbNodeProps) {
  const rgb = STATE_COLOR[data.state];

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

      <motion.div
        key={data.state}
        initial={{ scale: 1 }}
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 0.4 }}
        className="w-20 h-20 rounded-full cursor-pointer bg-slate-900 border border-slate-700"
        style={{
          boxShadow: `0 0 20px rgba(${rgb},0.3), 0 0 40px rgba(${rgb},0.3), 0 0 60px rgba(${rgb},0.3)`,
        }}
      />
      <span className="text-xs text-slate-300 font-medium">{data.label}</span>
      {data.fallbackActive && (
        <motion.span
          className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-400/20 text-yellow-300 border border-yellow-400/50"
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          fallback
        </motion.span>
      )}
    </div>
  );
}

export default memo(AgentOrbNode);
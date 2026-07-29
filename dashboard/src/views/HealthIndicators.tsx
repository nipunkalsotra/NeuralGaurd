// src/views/HealthIndicators.tsx
import { motion } from "framer-motion";
import PanelShell from "../components/PanelShell";
import { useDashboardStore, type AgentId } from "../store/dashboardStore";
import type { WorkerState } from "../components/AgentOrb";

const STATUS_COLOR: Record<WorkerState, string> = {
  HEALTHY: "16,185,129",
  LOOP_SUSPECTED: "251,191,36",
  DIAGNOSING: "96,165,250",
  REMEDIATING: "249,115,22",
  VERIFYING: "139,92,246",
  ESCALATED: "244,63,94",
  RESUMED: "16,185,129",
};

const AGENT_ORDER: AgentId[] = ["sentinel", "triage", "remediation", "optimization", "orchestrator"];

const LABELS: Record<AgentId, string> = {
  sentinel: "Sentinel",
  triage: "Triage",
  remediation: "Remediation",
  optimization: "Optimization",
  orchestrator: "Orchestrator",
};

function StatusCard({ id }: { id: AgentId }) {
  const agent = useDashboardStore((s) => s.agents[id]);
  const rgb = STATUS_COLOR[agent.state];

  return (
    <div className="flex flex-col items-center gap-2 p-4 rounded-lg bg-slate-900/40 border border-slate-800">
      <motion.div
        key={agent.state}
        initial={{ scale: 1 }}
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 0.4 }}
        className="w-14 h-14 rounded-full bg-slate-900 border border-slate-700"
        style={{
          boxShadow: `0 0 16px rgba(${rgb},0.4), 0 0 32px rgba(${rgb},0.25)`,
        }}
      />
      <span className="text-xs font-medium text-slate-300">{LABELS[id]}</span>
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{agent.state}</span>

      {agent.fallbackActive && (
        <motion.span
          className="text-[9px] px-2 py-0.5 rounded-full bg-yellow-400/20 text-yellow-300 border border-yellow-400/50"
          animate={{
            boxShadow: [
              "0 0 4px rgba(250,204,21,0.4)",
              "0 0 12px rgba(250,204,21,0.7)",
              "0 0 4px rgba(250,204,21,0.4)",
            ],
          }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        >
          fallback
        </motion.span>
      )}
    </div>
  );
}

export default function HealthIndicators() {
  return (
    <PanelShell title="Health Indicators">
      <div className="grid grid-cols-5 gap-3 p-4 h-full items-center">
        {AGENT_ORDER.map((id) => (
          <StatusCard key={id} id={id} />
        ))}
      </div>
    </PanelShell>
  );
}

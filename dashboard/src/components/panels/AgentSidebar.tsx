// src/components/panels/AgentSidebar.tsx
// Left pane of the 3-column Control Plane layout: the "Inject a fault"
// action, the five agents with their live state as a colored dot, and
// the real fallback-chain service list with live circuit status.
import { useEffect, useState } from "react";
import { Activity, Stethoscope, Wrench, Route, GitBranch } from "lucide-react";
import { useDashboardStore, AGENT_LABELS, AGENT_IDS, type AgentId } from "../../store";
import { useDataSource } from "../../app/dataSourceContext";
import { stateColor } from "../../design/tokens";
import FaultMenu from "./FaultMenu";
import type { CircuitStatusEntry } from "../../data/types";

const AGENT_ICONS: Record<AgentId, typeof Activity> = {
  sentinel: Activity,
  triage: Stethoscope,
  remediation: Wrench,
  optimization: Route,
  orchestrator: GitBranch,
};

const CHAINS = ["NIM", "Nemotron", "OR-Tools", "NemoClaw"];
const POLL_MS = 2000;

function chainStatusColor(entry: CircuitStatusEntry | undefined): string {
  if (!entry) return "#10b981";
  const s = entry.status.toLowerCase();
  if (s === "open") return stateColor.ESCALATED;
  if (s === "half-open") return stateColor.LOOP_SUSPECTED;
  return stateColor.HEALTHY;
}

// The fallback matrix's solver tier is labelled "OR-Tools" here (the
// practical primary — see docs/api_contracts.md's cuOpt note) but the
// circuit registry still tracks it under the service name "cuOpt".
const CHAIN_TO_SERVICE: Record<string, string> = { "OR-Tools": "cuOpt" };

interface AgentSidebarProps {
  activeFilter: AgentId | null;
  onFilterAgent: (id: AgentId) => void;
}

export default function AgentSidebar({ activeFilter, onFilterAgent }: AgentSidebarProps) {
  const agents = useDashboardStore((s) => s.agents);
  const { source } = useDataSource();
  const [circuits, setCircuits] = useState<CircuitStatusEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await source.fetchCircuitStatus();
        if (!cancelled) setCircuits(data);
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
    <div className="flex h-full flex-col p-4">
      <FaultMenu />

      <div className="mt-5 space-y-0.5">
        {AGENT_IDS.map((id) => {
          const Icon = AGENT_ICONS[id];
          const agent = agents[id];
          const busy = agent.state !== "HEALTHY" && agent.state !== "RESUMED";
          const selected = activeFilter === id;
          return (
            <button
              key={id}
              onClick={() => onFilterAgent(id)}
              aria-pressed={selected}
              title={`Filter the audit stream to ${AGENT_LABELS[id]}`}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs transition-colors ${
                selected
                  ? "bg-white/15 text-white ring-1 ring-white/20"
                  : busy
                  ? "bg-white/10 text-white"
                  : "text-white/60 hover:bg-white/5 hover:text-white/80"
              }`}
            >
              <Icon size={13} strokeWidth={1.5} />
              <span className="flex-1 truncate text-left">{AGENT_LABELS[id]}</span>
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: stateColor[agent.state], boxShadow: busy ? `0 0 6px ${stateColor[agent.state]}` : undefined }}
              />
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        <p className="text-[10px] uppercase tracking-widest text-white/35 mb-2.5">Fallback chains</p>
        <div className="space-y-2">
          {CHAINS.map((chain) => {
            const serviceName = CHAIN_TO_SERVICE[chain] ?? chain;
            const entry = circuits.find((c) => c.service === serviceName);
            return (
              <div key={chain} className="flex items-center gap-2 text-[11px] text-white/55">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: chainStatusColor(entry) }} />
                {chain}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

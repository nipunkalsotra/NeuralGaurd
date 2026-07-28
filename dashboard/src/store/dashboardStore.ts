// src/store/dashboardStore.ts
import { create } from "zustand";
import type { WorkerState } from "../components/AgentOrb";

export type AgentId = "sentinel" | "triage" | "remediation" | "optimization" | "orchestrator";

interface AgentRuntime {
  state: WorkerState;
  events: string[];
  fallbackActive: boolean;
}

interface DashboardStore {
  agents: Record<AgentId, AgentRuntime>;
  activeEdge: string | null;
  setAgentState: (id: AgentId, state: WorkerState, event?: string) => void;
  setActiveEdge: (edgeId: string | null) => void;
  resetAll: () => void;
}

const initialAgents: Record<AgentId, AgentRuntime> = {
  sentinel: { state: "HEALTHY", events: [], fallbackActive: false },
  triage: { state: "HEALTHY", events: [], fallbackActive: false },
  remediation: { state: "HEALTHY", events: [], fallbackActive: false },
  optimization: { state: "HEALTHY", events: [], fallbackActive: false },
  orchestrator: { state: "HEALTHY", events: [], fallbackActive: false },
};

export const useDashboardStore = create<DashboardStore>((set) => ({
  agents: initialAgents,
  activeEdge: null,
  setAgentState: (id, state, event) =>
    set((s) => {
      const events = event ? [event, ...s.agents[id].events].slice(0, 3) : s.agents[id].events;
      return { agents: { ...s.agents, [id]: { ...s.agents[id], state, events } } };
    }),
  setActiveEdge: (edgeId) => set({ activeEdge: edgeId }),
  resetAll: () => set({ agents: initialAgents, activeEdge: null }),
}));
// src/store/dashboardStore.ts
import { create } from "zustand";
import type { WorkerState } from "../components/AgentOrb";

export type AgentId = "sentinel" | "triage" | "remediation" | "optimization" | "orchestrator";

interface AgentRuntime {
  state: WorkerState;
  events: string[];
  // Day 12: which fallback (if any) is currently active for this agent —
  // "groq" (Triage), "sentence-transformers" (Sentinel), "or-tools" /
  // "greedy_round_robin" (Optimization), "mock" (Remediation). null means
  // no fallback active. Replaces the old fallbackActive:boolean, which
  // existed in the UI plumbing (AgentOrb, WorkflowDAG, HealthIndicators)
  // but nothing ever set it to true — real backend data (fallback_origin
  // on the audit_event stream) was never wired through.
  fallbackOrigin: string | null;
}

interface DashboardStore {
  agents: Record<AgentId, AgentRuntime>;
  activeEdge: string | null;
  setAgentState: (id: AgentId, state: WorkerState, event?: string) => void;
  setFallbackOrigin: (id: AgentId, origin: string | null) => void;
  setActiveEdge: (edgeId: string | null) => void;
  resetAll: () => void;
}

const initialAgents: Record<AgentId, AgentRuntime> = {
  sentinel: { state: "HEALTHY", events: [], fallbackOrigin: null },
  triage: { state: "HEALTHY", events: [], fallbackOrigin: null },
  remediation: { state: "HEALTHY", events: [], fallbackOrigin: null },
  optimization: { state: "HEALTHY", events: [], fallbackOrigin: null },
  orchestrator: { state: "HEALTHY", events: [], fallbackOrigin: null },
};

export const useDashboardStore = create<DashboardStore>((set) => ({
  agents: initialAgents,
  activeEdge: null,
  setAgentState: (id, state, event) =>
    set((s) => {
      const events = event ? [event, ...s.agents[id].events].slice(0, 3) : s.agents[id].events;
      return { agents: { ...s.agents, [id]: { ...s.agents[id], state, events } } };
    }),
  setFallbackOrigin: (id, origin) =>
    set((s) => ({ agents: { ...s.agents, [id]: { ...s.agents[id], fallbackOrigin: origin } } })),
  setActiveEdge: (edgeId) => set({ activeEdge: edgeId }),
  resetAll: () => set({ agents: initialAgents, activeEdge: null }),
}));

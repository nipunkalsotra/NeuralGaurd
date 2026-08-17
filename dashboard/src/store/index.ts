// src/store/index.ts
// Single Zustand store, single point of envelope ingestion. Replaces the
// old architecture where App, AuditLogStream, and SandboxTerminal each
// opened their own WebSocket and parsed the envelope independently — now
// exactly one place (SourceProvider, see src/app/SourceProvider.tsx)
// calls connect() and feeds every envelope through ingestEnvelope() here.
// Every panel reads from this store; none of them touch the socket.
import { create } from "zustand";
import type { WsEnvelope } from "../data/types";
import type { AuditRecord, WorkerState } from "../sim/types";
import type { ReportCardMetrics as ReportCardMetricsLike } from "../data/types";

export type AgentId = "sentinel" | "triage" | "remediation" | "optimization" | "orchestrator";

export interface AgentRuntime {
  state: WorkerState;
  events: string[];
  fallbackOrigin: string | null;
}

export interface TerminalLine {
  id: string;
  kind: "stdout" | "stderr" | "mock_banner";
  text: string;
  timestamp: string;
}

export interface SimilarityPoint {
  time: number;
  worker_id: string;
  similarity: number;
}

export interface DiagnosisResult {
  root_cause: string;
  fix_type: string;
  affected_field: string;
  confidence: number | null | undefined;
  fallback_used: boolean;
  fallback_origin?: string | null;
}

const AGENT_IDS: AgentId[] = ["sentinel", "triage", "remediation", "optimization", "orchestrator"];

const AGENT_LABELS: Record<AgentId, string> = {
  sentinel: "Sentinel",
  triage: "Triage",
  remediation: "Remediation",
  optimization: "Optimization",
  orchestrator: "Orchestrator",
};

// Which agent orbs light up and which edge glows for a given FSM
// to_state — ported from the old App.tsx.
const STATE_TO_AGENTS: Record<WorkerState, AgentId[]> = {
  HEALTHY: ["sentinel", "triage", "remediation", "optimization", "orchestrator"],
  LOOP_SUSPECTED: ["sentinel", "orchestrator"],
  DIAGNOSING: ["triage", "orchestrator", "optimization"],
  REMEDIATING: ["remediation", "orchestrator"],
  VERIFYING: ["remediation", "orchestrator"],
  RESUMED: ["sentinel", "triage", "remediation", "optimization", "orchestrator"],
  ESCALATED: ["triage", "orchestrator"],
};

const STATE_TO_EDGE: Record<WorkerState, string | null> = {
  HEALTHY: null,
  LOOP_SUSPECTED: "e1",
  DIAGNOSING: "e2",
  REMEDIATING: "e4",
  VERIFYING: "e5",
  RESUMED: null,
  ESCALATED: null,
};

const FALLBACK_ORIGIN_TO_AGENT: Record<string, AgentId> = {
  groq: "triage",
  rule_based_heuristic: "triage",
  "sentence-transformers": "sentinel",
  hash: "sentinel",
  "constraint-solver": "optimization",
  "or-tools": "optimization",
  greedy_round_robin: "optimization",
  mock: "remediation",
};

const AGENT_NAME_TO_AGENT_ID: Record<string, AgentId> = {
  SentinelAgent: "sentinel",
  TriageAgent: "triage",
  RemediationAgent: "remediation",
  OptimizationAgent: "optimization",
  Orchestrator: "orchestrator",
};

const MAX_AUDIT_ENTRIES = 300;
const MAX_TERMINAL_LINES = 400;
const MAX_SIMILARITY_POINTS = 60;

function insertByTimestamp<T extends { timestamp: string }>(entries: T[], incoming: T, max: number): T[] {
  const incomingTime = new Date(incoming.timestamp).getTime();
  let i = entries.length;
  while (i > 0 && new Date(entries[i - 1].timestamp).getTime() > incomingTime) i -= 1;
  return [...entries.slice(0, i), incoming, ...entries.slice(i)].slice(-max);
}

interface DashboardState {
  connectionKind: "live" | "simulated" | "connecting";
  connected: boolean;

  agents: Record<AgentId, AgentRuntime>;
  activeEdge: string | null;

  // Keyed by current_hash so a filter/re-sort never shifts which row a
  // user has expanded (fixes the old positional-index bug).
  auditLog: AuditRecord[];
  terminalLines: TerminalLine[];
  mockActive: boolean;
  similarity: SimilarityPoint[];

  diagnosis: DiagnosisResult | null;
  reportCard: ReportCardMetricsLike | null;

  // Real, live, event-driven — set the instant an OPTIMIZATION_COMPLETE
  // record carrying projected_throughput_pct arrives over the socket,
  // and reset to 100 the instant a worker actually RESUMES. No polling,
  // no REST round-trip: this used to be a separate timer racing a
  // sub-second incident window and frequently missing the dip entirely.
  throughput: number;

  setConnection: (kind: DashboardState["connectionKind"], connected: boolean) => void;
  setThroughput: (pct: number) => void;
  ingestEnvelope: (envelope: WsEnvelope) => void;
  clearTerminal: () => void;
  closeDiagnosis: () => void;
  setReportCard: (metrics: ReportCardMetricsLike) => void;
  closeReportCard: () => void;
  resetAll: () => void;
  setDemoAgentState: (id: AgentId, state: WorkerState, event?: string) => void;
  setDemoEdge: (edgeId: string | null) => void;
}

const initialAgents = (): Record<AgentId, AgentRuntime> => {
  const agents = {} as Record<AgentId, AgentRuntime>;
  for (const id of AGENT_IDS) {
    agents[id] = { state: "HEALTHY", events: [], fallbackOrigin: null };
  }
  return agents;
};

export const useDashboardStore = create<DashboardState>((set) => ({
  connectionKind: "connecting",
  connected: false,
  agents: initialAgents(),
  activeEdge: null,
  auditLog: [],
  terminalLines: [],
  mockActive: false,
  similarity: [],
  diagnosis: null,
  reportCard: null,
  throughput: 100,

  setConnection: (kind, connected) => set({ connectionKind: kind, connected }),
  setThroughput: (pct) => set({ throughput: pct }),

  setDemoAgentState: (id, state, event) =>
    set((s) => {
      const events = event ? [event, ...s.agents[id].events].slice(0, 3) : s.agents[id].events;
      return { agents: { ...s.agents, [id]: { ...s.agents[id], state, events } } };
    }),

  setDemoEdge: (edgeId) => set({ activeEdge: edgeId }),

  resetAll: () => set({ agents: initialAgents(), activeEdge: null, auditLog: [], reportCard: null, throughput: 100 }),

  clearTerminal: () => set({ terminalLines: [] }),
  closeDiagnosis: () => set({ diagnosis: null }),
  setReportCard: (metrics) => set({ reportCard: metrics }),
  closeReportCard: () => set({ reportCard: null }),

  ingestEnvelope: (envelope) => {
    const { type, payload, worker_id, timestamp } = envelope;

    if (type === "state_change") {
      try {
        const { to_state, trigger_event } = JSON.parse(payload) as { to_state: WorkerState; from_state: WorkerState; trigger_event: string };
        const targets = STATE_TO_AGENTS[to_state];
        if (!targets) return;
        set((s) => {
          const agents = { ...s.agents };
          for (const id of targets) {
            const events = trigger_event ? [trigger_event, ...agents[id].events].slice(0, 3) : agents[id].events;
            agents[id] = { ...agents[id], state: to_state, events };
          }
          return { agents, activeEdge: STATE_TO_EDGE[to_state] };
        });
      } catch {
        /* malformed frame, ignore */
      }
      return;
    }

    if (type === "audit_event") {
      try {
        const record = JSON.parse(payload) as AuditRecord;
        set((s) => ({ auditLog: insertByTimestamp(s.auditLog, record, MAX_AUDIT_ENTRIES) }));

        // Real, event-driven throughput — dips the instant a reroute
        // plan's real solver output arrives, recovers the instant the
        // worker actually resumes. ESCALATED deliberately does NOT
        // reset it: still broken, waiting on a human, not the same as
        // healed (mirrors throughput_tracker.py's SETTLED_STATES).
        if (record.trigger_event === "OPTIMIZATION_COMPLETE" && record.projected_throughput_pct != null) {
          set({ throughput: record.projected_throughput_pct });
        } else if (record.to_state === "RESUMED") {
          set({ throughput: 100 });
        }

        const fallbackAgent = record.fallback_origin
          ? FALLBACK_ORIGIN_TO_AGENT[record.fallback_origin]
          : AGENT_NAME_TO_AGENT_ID[record.agent_name];
        if (fallbackAgent) {
          set((s) => ({ agents: { ...s.agents, [fallbackAgent]: { ...s.agents[fallbackAgent], fallbackOrigin: record.fallback_origin ?? null } } }));
        }

        if (record.root_cause) {
          set({
            diagnosis: {
              root_cause: record.root_cause,
              fix_type: record.fix_type ?? "SCHEMA_MISMATCH",
              affected_field: record.affected_field ?? "unknown",
              confidence: record.confidence_score,
              fallback_used: record.fallback_used,
              fallback_origin: record.fallback_origin,
            },
          });
        }
      } catch {
        /* malformed frame, ignore */
      }
      return;
    }

    if (type === "similarity") {
      try {
        const point = JSON.parse(payload) as { worker_id: string; similarity: number; time: number };
        set((s) => ({
          similarity: [...s.similarity, { time: point.time, worker_id: point.worker_id, similarity: point.similarity }].slice(-MAX_SIMILARITY_POINTS),
        }));
      } catch {
        /* ignore */
      }
      return;
    }

    if (type === "mock_banner") {
      set((s) => {
        let text = payload;
        try {
          text = JSON.parse(payload).message ?? payload;
        } catch {
          /* raw text */
        }
        return {
          mockActive: true,
          terminalLines: [...s.terminalLines, { id: `${timestamp}-mock`, kind: "mock_banner" as const, text: `[MOCK MODE] ${text}`, timestamp }].slice(-MAX_TERMINAL_LINES),
        };
      });
      return;
    }

    if (type === "stdout" || type === "stderr") {
      set((s) => ({
        terminalLines: [...s.terminalLines, { id: `${timestamp}-${worker_id}-${s.terminalLines.length}`, kind: type, text: payload, timestamp }].slice(-MAX_TERMINAL_LINES),
      }));
      return;
    }
  },
}));

export { AGENT_IDS, AGENT_LABELS };

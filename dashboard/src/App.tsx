// src/App.tsx
import { useCallback, useState } from "react";
import WorkflowDAG from "./views/WorkflowDAG";
import AuditLogStream from "./components/AuditLogStream";
import CircuitBreakerPanel from "./components/CircuitBreakerPanel";
import SandboxTerminal from "./components/SandboxTerminal";
import TriageReportCard, { type DiagnosisResult } from "./components/TriageReportCard";
import SimilarityGraph from "./views/SimilarityGraph";
import HealthIndicators from "./views/HealthIndicators";
import { useDashboardStore, type AgentId } from "./store/dashboardStore";
import { useWebSocket } from "./hooks/useWebSocket";
import type { WorkerState } from "./components/AgentOrb";

interface StateChangeEnvelope {
  type: string;
  payload: string;
}

interface StateChangePayload {
  from_state: WorkerState;
  to_state: WorkerState;
  trigger_event: string;
}

// Maps a real FSM to_state (per the locked docs/websocket_schema.md
// `state_change` envelope) to which agent orbs light up and which edge
// glows — mirrors WorkflowDAG.tsx's manual runHealSequence() demo walk,
// but reacts to real backend events instead of a scripted timed sequence.
// Both WorkflowDAG and HealthIndicators read the same Zustand store, so
// wiring it once here drives both panels.
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

const MOCK_DIAGNOSIS_NORMAL: DiagnosisResult = {
  root_cause: "Field 'Tax_ID' not found in new invoice format",
  fix_type: "SCHEMA_MISMATCH",
  affected_field: "Tax_ID",
  confidence: 0.91,
  fallback_used: false,
};

const MOCK_DIAGNOSIS_FALLBACK: DiagnosisResult = {
  ...MOCK_DIAGNOSIS_NORMAL,
  confidence: 0.68,
  fallback_used: true,
  fallback_origin: "groq",
};

const BACKEND_WS_URL = import.meta.env.VITE_WS_URL as string | undefined;
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

export default function App() {
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [showSimilarity, setShowSimilarity] = useState(false);
  const [showHealthIndicators, setShowHealthIndicators] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [breakItDisabled, setBreakItDisabled] = useState(false);

  const setAgentState = useDashboardStore((s) => s.setAgentState);
  const setActiveEdge = useDashboardStore((s) => s.setActiveEdge);

  const handleStateChange = useCallback(
    (msg: StateChangeEnvelope) => {
      if (msg.type !== "state_change") return;
      try {
        const { to_state, trigger_event } = JSON.parse(msg.payload) as StateChangePayload;
        const agents = STATE_TO_AGENTS[to_state];
        if (!agents) return;
        agents.forEach((agent) => setAgentState(agent, to_state, trigger_event));
        setActiveEdge(STATE_TO_EDGE[to_state]);
      } catch {
        console.warn("Malformed state_change payload, ignoring:", msg.payload);
      }
    },
    [setAgentState, setActiveEdge]
  );

  // No mockFallback here on purpose — WorkflowDAG's own "Trigger Full Heal
  // Sequence" / "Trigger Escalation" buttons already serve as its offline
  // demo mode. Adding a second, automatic synthetic feed on top of those
  // would fight the manual buttons for the same agent-orb state.
  useWebSocket<StateChangeEnvelope>({ url: BACKEND_WS_URL, onMessage: handleStateChange });

  const handleBreakIt = async () => {
    setBreakItDisabled(true);
    setToast("Injecting schema change... Tax_ID removed.");
    setTimeout(() => setToast(null), 3000);

    try {
      await fetch(`${BACKEND_URL}/demo/inject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: "worker-3",
          fault_type: "schema_corruption",
          payload: { field: "Tax_ID" },
        }),
      });
    } catch (e) {
      console.error("Fault injection failed:", e);
    }

    setTimeout(() => setBreakItDisabled(false), 5000);
  };

  return (
    <div className="relative min-w-[1280px] h-screen w-screen overflow-x-auto bg-gradient-to-b from-slate-900 to-slate-950 flex flex-col">
      <header className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-slate-800">
        <span className="text-sm font-semibold tracking-wide text-slate-200">
          AI Factory Sentinel
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDiagnosis(MOCK_DIAGNOSIS_NORMAL)}
            className="text-xs px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors"
          >
            Show Mock Triage Card
          </button>
          <button
            onClick={() => setDiagnosis(MOCK_DIAGNOSIS_FALLBACK)}
            className="text-xs px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors"
          >
            Show Fallback Variant
          </button>
          <button
            onClick={() => setShowSimilarity((v) => !v)}
            className="text-xs px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors"
          >
            {showSimilarity ? "Hide" : "Show"} Similarity Graph
          </button>
          <button
            onClick={() => setShowHealthIndicators((v) => !v)}
            className="text-xs px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors"
          >
            {showHealthIndicators ? "Hide" : "Show"} Health Indicators
          </button>
          <button
            onClick={handleBreakIt}
            disabled={breakItDisabled}
            className={`w-[160px] h-[56px] rounded-lg font-bold text-white text-sm tracking-wide transition-all active:scale-95 ${
              breakItDisabled ? "bg-rose-900/50 cursor-not-allowed opacity-60" : "bg-rose-600 hover:bg-rose-700"
            }`}
          >
            BREAK IT
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-[60%_40%]">
        <WorkflowDAG />
        <div className="border-l border-slate-800 min-w-0">
          <AuditLogStream wsUrl={BACKEND_WS_URL} />
        </div>
      </div>

      <div className="h-[20%] min-h-[160px] shrink-0 border-t border-slate-800 grid grid-cols-2">
        <CircuitBreakerPanel />
        <SandboxTerminal wsUrl={BACKEND_WS_URL} />
      </div>

      {showSimilarity && (
        <div className="absolute bottom-[20%] left-0 w-[60%] h-[300px] z-30 border-t border-r border-slate-700">
          <SimilarityGraph />
        </div>
      )}

      {showHealthIndicators && (
        <div className="absolute top-14 left-0 w-full h-[140px] z-30 border-b border-slate-700">
          <HealthIndicators />
        </div>
      )}

      {toast && (
        <div className="fixed top-16 right-4 z-[70] bg-amber-500 text-amber-950 px-4 py-2 rounded-md text-sm font-semibold shadow-lg">
          {toast}
        </div>
      )}

      <TriageReportCard diagnosis={diagnosis} onClose={() => setDiagnosis(null)} />
    </div>
  );
}
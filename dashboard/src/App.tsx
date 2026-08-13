// src/App.tsx
import { lazy, Suspense, useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import WorkflowDAG from "./views/WorkflowDAG";
import AuditLogStream from "./components/AuditLogStream";
import CircuitBreakerPanel from "./components/CircuitBreakerPanel";
import SandboxTerminal from "./components/SandboxTerminal";
import TriageReportCard, { type DiagnosisResult } from "./components/TriageReportCard";
import type { ReportCardMetrics } from "./components/PostHealReportCard";
import { useDashboardStore, type AgentId } from "./store/dashboardStore";

// Day 12 perf: PostHealReportCard is lazy-loaded below (framer-motion's
// animate/useMotionValue + lucide icons add real weight for a modal
// that's hidden until triggered) — the placeholder values that trigger
// it are kept here as a plain literal rather than importing them from
// that module, so this file doesn't force-load it eagerly just to get a
// constant. `type`-only imports (above) are erased at compile time and
// cost nothing either way.
const PLACEHOLDER_METRICS: ReportCardMetrics = {
  time_to_detect: 0.8,
  tokens_saved: 12,
  throughput_maintained: 97,
  fixes_applied: 1,
  escalations: 0,
  fallbacks_triggered: 1,
};

// Day 11 perf pass: both views are hidden until a toggle button is
// clicked, and SimilarityGraph alone pulls in recharts — code-splitting
// them keeps that weight out of the initial bundle (852.93kB minified,
// over the guide's 500kB warning threshold) instead of the main chunk.
const SimilarityGraph = lazy(() => import("./views/SimilarityGraph"));
const HealthIndicators = lazy(() => import("./views/HealthIndicators"));
// Day 12: same treatment — hidden until the demo button triggers it.
const PostHealReportCard = lazy(() => import("./components/PostHealReportCard"));
import { useWebSocket } from "./hooks/useWebSocket";
import type { WorkerState } from "./components/AgentOrb";

interface WsEnvelope {
  type: string;
  payload: string;
}

interface StateChangePayload {
  from_state: WorkerState;
  to_state: WorkerState;
  trigger_event: string;
}

// Day 10: audit_event payloads carry the same shape as AuditLogStream's
// AuditLogPayload — root_cause/fix_type/affected_field are non-null only
// on the transition into REMEDIATING/ESCALATED (see backend/sentinel/
// agents/orchestrator.py's on_diagnosis_complete). Only the fields this
// component actually needs are declared here.
interface AuditEventPayload {
  agent_name: string;
  trigger_event: string;
  confidence_score: number | null;
  fallback_used: boolean;
  fallback_origin: string | null;
  root_cause?: string | null;
  fix_type?: string | null;
  affected_field?: string | null;
}

// Day 12: Fallback Indicators. Which store agent a transition's
// fallback_origin/agent_name is actually ABOUT — not always the same as
// the literal agent_name string, since the LOW_CONFIDENCE escalation
// branch logs agent_name="Orchestrator" even though the fallback in
// question (rule_based_heuristic) is Triage's. Routing by the
// fallback_origin VALUE itself (when present) is unambiguous; agent_name
// is only used to know which ring to CLEAR once a transition resolves
// without a fallback (fallback_origin null).
const FALLBACK_ORIGIN_TO_AGENT: Record<string, AgentId> = {
  groq: "triage",
  rule_based_heuristic: "triage",
  "sentence-transformers": "sentinel",
  hash: "sentinel",
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

// Day 15 cleanup: the 3 "Show Mock ..." buttons inject fake data on
// demand — genuinely useful as Day 13's Backup Plan B/C mechanism when
// the real backend is unreachable, but they don't belong in the header
// during the actual live demo (they read as "here's how I'd fake it").
// Hidden by default; set VITE_DEBUG_CONTROLS=true locally to bring them
// back for development/rehearsal.
const DEBUG_CONTROLS = import.meta.env.VITE_DEBUG_CONTROLS === "true";

export default function App() {
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [reportCard, setReportCard] = useState<ReportCardMetrics | null>(null);
  const [showSimilarity, setShowSimilarity] = useState(false);
  const [showHealthIndicators, setShowHealthIndicators] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [breakItDisabled, setBreakItDisabled] = useState(false);

  const setAgentState = useDashboardStore((s) => s.setAgentState);
  const setActiveEdge = useDashboardStore((s) => s.setActiveEdge);
  const setFallbackOrigin = useDashboardStore((s) => s.setFallbackOrigin);

  const handleWsMessage = useCallback(
    (msg: WsEnvelope) => {
      if (msg.type === "state_change") {
        try {
          const { to_state, trigger_event } = JSON.parse(msg.payload) as StateChangePayload;
          const agents = STATE_TO_AGENTS[to_state];
          if (!agents) return;
          agents.forEach((agent) => setAgentState(agent, to_state, trigger_event));
          setActiveEdge(STATE_TO_EDGE[to_state]);

          // Day 13: Report Card Backend Wiring. REMEDIATION_SUCCESS is the
          // only trigger_event that lands on RESUMED (orchestrator.py's
          // on_diagnosis_complete) — fetch the real, just-updated metrics
          // rather than waiting for a poll, same "react to the event that
          // caused the change" pattern as Day 10's Triage Report Card.
          if (trigger_event === "REMEDIATION_SUCCESS") {
            fetch(`${BACKEND_URL}/api/metrics`)
              .then((res) => res.json())
              .then((data: ReportCardMetrics) => setReportCard(data))
              .catch((e) => console.error("Failed to fetch report card metrics:", e));
          }
        } catch {
          console.warn("Malformed state_change payload, ignoring:", msg.payload);
        }
        return;
      }

      if (msg.type === "audit_event") {
        try {
          const record = JSON.parse(msg.payload) as AuditEventPayload;

          // Day 12: Fallback Indicators — route this record's
          // fallback_origin (or its absence) to the specific agent orb
          // it's actually about. See FALLBACK_ORIGIN_TO_AGENT's comment
          // for why value-based routing is used instead of agent_name.
          const fallbackAgent = record.fallback_origin
            ? FALLBACK_ORIGIN_TO_AGENT[record.fallback_origin]
            : AGENT_NAME_TO_AGENT_ID[record.agent_name];
          if (fallbackAgent) {
            setFallbackOrigin(fallbackAgent, record.fallback_origin ?? null);
          }

          // Only DIAGNOSING->REMEDIATING/ESCALATED carries a real diagnosis
          // (root_cause is null on every other transition) — this is the
          // live-data equivalent of the two manual "Show Mock Triage Card"
          // buttons, opening on the same DiagnosisResult shape.
          if (!record.root_cause) return;
          setDiagnosis({
            root_cause: record.root_cause,
            fix_type: record.fix_type ?? "SCHEMA_MISMATCH",
            affected_field: record.affected_field ?? "unknown",
            confidence: record.confidence_score,
            fallback_used: record.fallback_used,
            fallback_origin: record.fallback_origin,
          });
        } catch {
          console.warn("Malformed audit_event payload, ignoring:", msg.payload);
        }
      }
    },
    [setAgentState, setActiveEdge, setDiagnosis, setFallbackOrigin, setReportCard]
  );

  // No mockFallback here on purpose — WorkflowDAG's own "Trigger Full Heal
  // Sequence" / "Trigger Escalation" buttons (and the two manual "Show
  // Mock Triage Card" buttons) already serve as offline demo mode. Adding
  // an automatic synthetic feed on top would fight the manual controls
  // for the same state.
  useWebSocket<WsEnvelope>({ url: BACKEND_WS_URL, onMessage: handleWsMessage });

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
          {DEBUG_CONTROLS && (
            <>
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
                onClick={() => setReportCard(PLACEHOLDER_METRICS)}
                className="text-xs px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors"
              >
                Show Post-Heal Report Card
              </button>
            </>
          )}
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
            // Day 13: demo script's Act 2 names "button press animation
            // (scale 0.95, 0.1s)" specifically — duration-100 replaces
            // the generic transition-all's default 150ms with the exact
            // spec'd 100ms.
            className={`w-[160px] h-[56px] rounded-lg font-bold text-white text-sm tracking-wide transition-all duration-100 active:scale-95 ${
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
          <Suspense fallback={null}>
            <SimilarityGraph />
          </Suspense>
        </div>
      )}

      {showHealthIndicators && (
        <div className="absolute top-14 left-0 w-full h-[140px] z-30 border-b border-slate-700">
          <Suspense fallback={null}>
            <HealthIndicators />
          </Suspense>
        </div>
      )}

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed top-16 right-4 z-[70] bg-amber-500 text-amber-950 px-4 py-2 rounded-md text-sm font-semibold shadow-lg"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <TriageReportCard diagnosis={diagnosis} onClose={() => setDiagnosis(null)} />
      {reportCard && (
        <Suspense fallback={null}>
          <PostHealReportCard metrics={reportCard} onClose={() => setReportCard(null)} />
        </Suspense>
      )}
    </div>
  );
}
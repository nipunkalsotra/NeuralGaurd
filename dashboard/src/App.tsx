// src/App.tsx
import { useState } from "react";
import WorkflowDAG from "./views/WorkflowDAG";
import AuditLogStream from "./components/AuditLogStream";
import CircuitBreakerPanel from "./components/CircuitBreakerPanel";
import SandboxTerminal from "./components/SandboxTerminal";
import TriageReportCard, { type DiagnosisResult } from "./components/TriageReportCard";
import SimilarityGraph from "./views/SimilarityGraph";
import HealthIndicators from "./views/HealthIndicators";

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
};

const BACKEND_WS_URL = import.meta.env.VITE_WS_URL as string | undefined;

export default function App() {
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [showSimilarity, setShowSimilarity] = useState(false);
  const [showHealthIndicators, setShowHealthIndicators] = useState(false);

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
        <SandboxTerminal />
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

      <TriageReportCard diagnosis={diagnosis} onClose={() => setDiagnosis(null)} />
    </div>
  );
}
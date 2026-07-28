// src/components/TriageReportCard.tsx
import { useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";

export type FixType = "SCHEMA_MISMATCH" | "TYPE_ERROR" | "MISSING_FIELD" | "UNKNOWN";

export interface DiagnosisResult {
  root_cause: string;
  fix_type: FixType;
  affected_field: string;
  confidence: number; // 0.0 - 1.0
  fallback_used: boolean;
}

interface TriageReportCardProps {
  diagnosis: DiagnosisResult | null;
  onClose: () => void;
}

const FIX_TYPE_STYLES: Record<FixType, string> = {
  SCHEMA_MISMATCH: "bg-orange-500/20 text-orange-400 border-orange-500/40",
  TYPE_ERROR: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  MISSING_FIELD: "bg-purple-500/20 text-purple-400 border-purple-500/40",
  UNKNOWN: "bg-gray-500/20 text-gray-400 border-gray-500/40",
};

function confidenceColor(confidence: number) {
  if (confidence >= 0.8) return { bar: "bg-emerald-500", text: "text-emerald-400" };
  if (confidence >= 0.6) return { bar: "bg-amber-400", text: "text-amber-400" };
  return { bar: "bg-rose-500", text: "text-rose-400" };
}

export default function TriageReportCard({ diagnosis, onClose }: TriageReportCardProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!diagnosis) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [diagnosis, handleKeyDown]);

  if (!diagnosis) return null;

  const confidencePct = Math.round(diagnosis.confidence * 100);
  const { bar, text } = confidenceColor(diagnosis.confidence);

  return (
    <AnimatePresence>
      {diagnosis && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-[600px] mx-4 rounded-xl border border-slate-600 bg-slate-800 text-slate-100 shadow-2xl"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between px-6 pt-6">
              <span className="text-xs uppercase tracking-wider text-slate-400">
                Triage Report
              </span>
              <button
                onClick={onClose}
                aria-label="Close"
                className="text-slate-400 hover:text-slate-100 transition-colors text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="px-6 pt-4">
              <p className="text-lg font-medium text-slate-100 leading-snug">
                {diagnosis.root_cause}
              </p>
            </div>

            <div className="flex items-center gap-3 px-6 pt-4 flex-wrap">
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold border ${FIX_TYPE_STYLES[diagnosis.fix_type]}`}
              >
                {diagnosis.fix_type}
              </span>

              <span className="px-3 py-1 rounded-full text-xs font-mono bg-slate-700 text-slate-300 border border-slate-600">
                {diagnosis.affected_field}
              </span>

              {diagnosis.fallback_used && (
                <motion.span
                  className="px-3 py-1 rounded-full text-xs font-semibold bg-yellow-400/20 text-yellow-300 border border-yellow-400/50"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                >
                  Groq Fallback Active
                </motion.span>
              )}
            </div>

            <div className="px-6 pt-5 pb-6">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs uppercase tracking-wider text-slate-400">
                  Confidence
                </span>
                <span className={`text-sm font-semibold ${text}`}>{confidencePct}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-700 overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${bar}`}
                  initial={{ width: "0%" }}
                  animate={{ width: `${confidencePct}%` }}
                  transition={{ type: "spring", duration: 0.8, bounce: 0.25 }}
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
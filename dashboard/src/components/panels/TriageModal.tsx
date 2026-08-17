// src/components/panels/TriageModal.tsx
// Replaces TriageReportCard. Structural fix for finding #4: the old
// component did `if (!diagnosis) return null` BEFORE its own
// AnimatePresence wrapper — the moment diagnosis went null, the whole
// component (AnimatePresence included) unmounted synchronously on the
// next render, so the exit animation never got a chance to play.
// AnimatePresence must itself stay mounted for its exit animations to
// fire; only its CHILD is conditional. This component is rendered
// unconditionally by its parent for exactly that reason.
import { useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useDashboardStore } from "../../store";
import { useFocusTrap } from "../../hooks/useFocusTrap";

const FALLBACK_LABELS: Record<string, string> = {
  groq: "Groq Fallback Active",
  rule_based_heuristic: "Rule-Based Fallback Active",
};

const FIX_TYPE_STYLES: Record<string, string> = {
  SCHEMA_MISMATCH: "bg-state-remediating/15 text-state-remediating border-state-remediating/40",
  TYPE_ERROR: "bg-state-diagnosing/15 text-state-diagnosing border-state-diagnosing/40",
  MISSING_IMPORT: "bg-state-verifying/15 text-state-verifying border-state-verifying/40",
  TIMEOUT: "bg-state-suspected/15 text-state-suspected border-state-suspected/40",
  CONNECTION_ERROR: "bg-state-escalated/15 text-state-escalated border-state-escalated/40",
  RESOURCE_ERROR: "bg-accent/15 text-accent border-accent/40",
};
const DEFAULT_FIX_STYLE = "bg-text-tertiary/15 text-text-secondary border-text-tertiary/30";

function confidenceColor(c: number) {
  if (c >= 0.8) return { bar: "bg-state-healthy", text: "text-state-healthy" };
  if (c >= 0.6) return { bar: "bg-state-suspected", text: "text-state-suspected" };
  return { bar: "bg-state-escalated", text: "text-state-escalated" };
}
const UNKNOWN_CONFIDENCE = { bar: "bg-text-tertiary", text: "text-text-tertiary" };

export default function TriageModal() {
  const diagnosis = useDashboardStore((s) => s.diagnosis);
  const onClose = useDashboardStore((s) => s.closeDiagnosis);
  const trapRef = useFocusTrap<HTMLDivElement>(diagnosis !== null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => e.key === "Escape" && onClose(), [onClose]);
  useEffect(() => {
    if (!diagnosis) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [diagnosis, handleKeyDown]);

  const hasConfidence = typeof diagnosis?.confidence === "number" && !isNaN(diagnosis.confidence);
  const confidencePct = hasConfidence ? Math.round(diagnosis!.confidence! * 100) : null;
  const { bar, text } = hasConfidence ? confidenceColor(diagnosis!.confidence!) : UNKNOWN_CONFIDENCE;
  const fallbackLabel = diagnosis?.fallback_origin ? FALLBACK_LABELS[diagnosis.fallback_origin] ?? "Fallback Active" : "Fallback Active";

  return (
    <AnimatePresence>
      {diagnosis && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            ref={trapRef}
            role="dialog"
            aria-modal="true"
            aria-label="Triage report"
            className="w-full max-w-[560px] rounded-2xl border border-border bg-surface-2 text-text-primary shadow-2xl"
            initial={{ scale: 0.94, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 4 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between px-6 pt-6">
              <span className="text-xs uppercase tracking-wider text-text-tertiary">Triage report</span>
              <button onClick={onClose} aria-label="Close" className="text-text-tertiary hover:text-text-primary transition-colors text-lg leading-none">✕</button>
            </div>
            <div className="px-6 pt-4">
              <p className="text-lg font-medium leading-snug">{diagnosis.root_cause}</p>
            </div>
            <div className="flex items-center gap-3 px-6 pt-4 flex-wrap">
              <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${FIX_TYPE_STYLES[diagnosis.fix_type] ?? DEFAULT_FIX_STYLE}`}>{diagnosis.fix_type}</span>
              <span className="px-3 py-1 rounded-full text-xs font-mono bg-surface-3 text-text-secondary border border-border">{diagnosis.affected_field}</span>
              {diagnosis.fallback_used && (
                <motion.span className="px-3 py-1 rounded-full text-xs font-semibold bg-state-fallback/15 text-state-fallback border border-state-fallback/40" animate={{ scale: [1, 1.04, 1] }} transition={{ duration: 2, repeat: Infinity }}>
                  {fallbackLabel}
                </motion.span>
              )}
            </div>
            <div className="px-6 pt-5 pb-6">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs uppercase tracking-wider text-text-tertiary">Confidence</span>
                <span className={`text-sm font-semibold ${text}`}>{hasConfidence ? `${confidencePct}%` : "N/A"}</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-surface-3 overflow-hidden">
                <motion.div className={`h-full rounded-full ${bar}`} initial={{ width: "0%" }} animate={{ width: `${confidencePct ?? 0}%` }} transition={{ type: "spring", duration: 0.8, bounce: 0.25 }} />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

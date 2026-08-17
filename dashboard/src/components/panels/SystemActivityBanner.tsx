// src/components/panels/SystemActivityBanner.tsx
// Directly answers "the screen looks stuck until the result comes" — a
// persistent glass banner over the topology that shows which agent is
// working and what it's doing, for the entire duration of a healing
// cycle (not just a 3-second toast at the start). The individual orb
// pulses were real but too subtle to read as "something is happening"
// at a glance; this is the unmissable version of the same live state.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { useDashboardStore, AGENT_LABELS, AGENT_IDS, type AgentId } from "../../store";
import type { WorkerState } from "../../sim/types";

const PROCESSING_STATES = new Set<WorkerState>(["LOOP_SUSPECTED", "DIAGNOSING", "REMEDIATING", "VERIFYING"]);

const PHASE_MESSAGE: Partial<Record<WorkerState, string>> = {
  LOOP_SUSPECTED: "detected a possible loop — confirming across consecutive steps",
  DIAGNOSING: "diagnosing the root cause",
  REMEDIATING: "generating a patch and verifying it in the sandbox",
  VERIFYING: "verifying the patch before resuming the worker",
};

export default function SystemActivityBanner() {
  const agents = useDashboardStore((s) => s.agents);
  const [settled, setSettled] = useState<{ kind: "resumed" | "escalated" } | null>(null);
  const wasBusyRef = useRef(false);

  // Pure derived value — no effect needed for the "who's busy right now"
  // part, only for detecting the busy → idle transition below.
  const busyId: AgentId | null = AGENT_IDS.find((id) => PROCESSING_STATES.has(agents[id].state)) ?? null;

  useEffect(() => {
    if (busyId) {
      wasBusyRef.current = true;
      return;
    }
    if (!wasBusyRef.current) return;
    wasBusyRef.current = false;
    const kind = agents.orchestrator.state === "ESCALATED" ? "escalated" : "resumed";
    // Deferred rather than called synchronously at the top of the
    // effect: this is a genuine "flash a message when an external
    // system settles" case (React's own docs pattern for effects), not
    // state that should instead be derived during render.
    const showTimer = setTimeout(() => setSettled({ kind }), 0);
    const hideTimer = setTimeout(() => setSettled(null), kind === "escalated" ? 4000 : 3000);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [busyId, agents.orchestrator.state]);

  const busyState = busyId ? agents[busyId].state : null;
  const message = busyId && busyState ? PHASE_MESSAGE[busyState] : null;

  return (
    <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2">
      <AnimatePresence mode="wait">
        {busyId && message ? (
          <motion.div
            key="working"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="liquid-glass flex items-center gap-2.5 rounded-full px-4 py-2"
          >
            <Loader2 size={14} strokeWidth={2} className="text-accent animate-spin" />
            <span className="text-[12px] text-white">
              <span className="font-semibold">{AGENT_LABELS[busyId]}</span>{" "}
              <span className="text-white/70">{message}</span>
            </span>
          </motion.div>
        ) : settled ? (
          <motion.div
            key="settled"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className={`liquid-glass flex items-center gap-2.5 rounded-full px-4 py-2 ${
              settled.kind === "escalated" ? "text-state-escalated" : "text-state-healthy"
            }`}
          >
            {settled.kind === "escalated" ? (
              <AlertTriangle size={14} strokeWidth={2} />
            ) : (
              <CheckCircle2 size={14} strokeWidth={2} />
            )}
            <span className="text-[12px] font-medium">
              {settled.kind === "escalated" ? "Escalated to a human — confidence below threshold" : "Healed — worker resumed"}
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// src/components/panels/FaultConsole.tsx
// Replaces the single hardcoded "BREAK IT" button + WorkflowDAG's scripted
// demo-walk buttons. Every fault type the backend actually supports is
// injectable here, against whichever DataSource is live — this drives a
// REAL healing cycle either way (the real backend's FSM, or the real
// in-browser simulator's FSM), never a canned animation.
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDataSource } from "../../app/dataSourceContext";

const FAULTS: { type: string; label: string; description: string; payload: Record<string, unknown> }[] = [
  { type: "schema_corruption", label: "Schema corruption", description: "Removes a required field from the payload", payload: { field: "Tax_ID" } },
  { type: "latency", label: "Latency spike", description: "Downstream call times out", payload: { delay_ms: 5000 } },
  { type: "error_signature", label: "Forced error", description: "Worker raises a specific error repeatedly", payload: { error: "Tax_ID not found" } },
  { type: "resource_pressure", label: "Resource pressure", description: "Worker runs out of memory (OOM)", payload: { memory_mb: 900 } },
];

export default function FaultConsole() {
  const { source } = useDataSource();
  const [pending, setPending] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const inject = async (fault: (typeof FAULTS)[number]) => {
    setPending(fault.type);
    setToast(`Injecting ${fault.label.toLowerCase()} on worker-3…`);
    await source.injectFault("worker-3", fault.type, fault.payload);
    setTimeout(() => setToast(null), 2600);
    setTimeout(() => setPending(null), 1200);
  };

  return (
    <div className="flex items-center gap-2">
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed top-16 right-4 z-[70] bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {FAULTS.map((f) => (
        <button
          key={f.type}
          onClick={() => inject(f)}
          disabled={pending !== null}
          title={f.description}
          className={`text-xs px-3 py-2 rounded-lg font-medium border transition-all duration-150 active:scale-95 ${
            pending === f.type
              ? "bg-state-escalated/20 border-state-escalated/50 text-state-escalated cursor-wait"
              : "bg-surface-2 border-border text-text-secondary hover:bg-surface-3 hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

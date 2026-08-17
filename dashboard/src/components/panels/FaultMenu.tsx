// src/components/panels/FaultMenu.tsx
// Every fault type the backend actually supports, each with a plain
// description of what it does, plus a toast that explains exactly what
// was just injected and why.
//
// The menu expands INLINE (animated height, not position: absolute) so
// opening it pushes the agent list below it down the sidebar rather
// than overlapping it, and closing it lets that content slide back up
// to its original position.
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, ChevronDown } from "lucide-react";
import { useDataSource } from "../../app/dataSourceContext";
import { useFocusTrap } from "../../hooks/useFocusTrap";

const FAULTS: { type: string; label: string; description: string; payload: Record<string, unknown> }[] = [
  { type: "schema_corruption", label: "Schema corruption", description: "Removes a required field (Tax_ID) from the payload", payload: { field: "Tax_ID" } },
  { type: "latency", label: "Latency spike", description: "A downstream call times out after 5s", payload: { delay_ms: 5000 } },
  { type: "error_signature", label: "Forced error", description: "Worker raises the same error repeatedly", payload: { error: "Tax_ID not found" } },
  { type: "resource_pressure", label: "Resource pressure", description: "Worker runs out of memory (OOM)", payload: { memory_mb: 900 } },
];

export default function FaultMenu() {
  const { source } = useDataSource();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const inject = async (fault: (typeof FAULTS)[number]) => {
    setOpen(false);
    setPending(true);
    setToast(`Injecting ${fault.label.toLowerCase()} on worker-3 — ${fault.description.toLowerCase()}`);
    await source.injectFault("worker-3", fault.type, fault.payload);
    setPending(false);
    // The toast announces what's being injected; the "system working"
    // banner over the topology (see SystemActivityBanner) takes over
    // explaining progress for the rest of the cycle, so this can clear
    // fairly quickly rather than lingering redundantly.
    setTimeout(() => setToast(null), 3200);
  };

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        aria-expanded={open}
        className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-white text-black text-xs font-semibold px-3 py-2.5 hover:bg-white/90 transition-colors disabled:opacity-50"
      >
        <Sparkles size={13} strokeWidth={2} />
        {pending ? "Injecting…" : "Inject a fault"}
        {!pending && <ChevronDown size={12} strokeWidth={2} className={`transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div ref={trapRef} role="menu" aria-label="Fault types" className="liquid-glass mt-2 rounded-2xl p-1.5">
              {FAULTS.map((f) => (
                <button
                  key={f.type}
                  role="menuitem"
                  onClick={() => inject(f)}
                  className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/[0.06] transition-colors"
                >
                  <p className="text-xs font-medium text-white">{f.label}</p>
                  <p className="text-[10px] text-white/45 mt-0.5 leading-relaxed">{f.description}</p>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed top-16 left-1/2 -translate-x-1/2 z-[70] bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg text-center max-w-[90vw]"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

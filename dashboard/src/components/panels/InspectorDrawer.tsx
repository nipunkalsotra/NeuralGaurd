// src/components/panels/InspectorDrawer.tsx
// A bottom-sheet glass drawer — the replacement for permanently cramming
// the Audit Log / Circuit Breakers / Sandbox / Similarity panels into a
// fixed 4-widget grid. Each one now gets the FULL stage when it's open,
// instead of a quarter-height box competing with three others at once.
// Opened from ControlDock; only one is ever mounted/open at a time.
import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useFocusTrap } from "../../hooks/useFocusTrap";

interface InspectorDrawerProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export default function InspectorDrawer({ open, onClose, children }: InspectorDrawerProps) {
  const trapRef = useFocusTrap<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/50"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={trapRef}
            role="dialog"
            aria-modal="true"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 280, damping: 32 }}
            className="liquid-glass fixed inset-x-0 bottom-0 z-40 mx-auto flex h-[min(78vh,640px)] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl sm:bottom-4 sm:rounded-3xl"
          >
            {/* Drag-handle affordance — decorative, this sheet isn't
                actually draggable, but the bar signals "sheet" instantly. */}
            <div className="flex justify-center pt-2.5 pb-1 shrink-0" aria-hidden="true">
              <span className="h-1 w-9 rounded-full bg-white/15" />
            </div>

            <button
              onClick={onClose}
              aria-label="Close panel"
              className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={15} strokeWidth={1.75} />
            </button>

            <div className="min-h-0 flex-1">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

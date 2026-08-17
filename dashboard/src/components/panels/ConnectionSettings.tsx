// src/components/panels/ConnectionSettings.tsx
// Runtime backend-host override — ported from main's ConnectionSettings.tsx
// (merge commit resolving a modify/delete conflict against the rebuilt
// dashboard) and restyled to the liquid-glass design language. Lets
// anyone repoint the deployed dashboard at a different backend (e.g. a
// demo host's LAN IP) without a rebuild; SourceProvider re-probes and
// reconnects whenever `host` changes. Persisted to localStorage.
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Wifi, WifiOff } from "lucide-react";
import { useDataSource } from "../../app/dataSourceContext";
import { useDashboardStore } from "../../store";
import { useFocusTrap } from "../../hooks/useFocusTrap";

export default function ConnectionSettings() {
  const { host, defaultHost, setHost, resetHost } = useDataSource();
  const connected = useDashboardStore((s) => s.connected);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(host);
  const trapRef = useFocusTrap<HTMLDivElement>(open);
  const isDefault = host === defaultHost;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const commit = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setHost(trimmed);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => {
          setInput(host);
          setOpen((v) => !v);
        }}
        title={`Connected to ${host}${connected ? "" : " (unreachable)"}`}
        className="liquid-glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-mono text-white/70 hover:text-white transition-colors"
      >
        {connected ? (
          <Wifi size={12} strokeWidth={1.75} className="text-state-healthy shrink-0" />
        ) : (
          <WifiOff size={12} strokeWidth={1.75} className="text-white/35 shrink-0" />
        )}
        <span className="hidden sm:inline">{host}</span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
            <motion.div
              ref={trapRef}
              role="dialog"
              aria-label="Backend connection settings"
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="liquid-glass absolute top-full right-0 mt-2 w-72 rounded-2xl p-3 z-50"
            >
              <label htmlFor="backend-host-input" className="text-[10px] uppercase tracking-[0.14em] text-white/40">
                Backend host
              </label>
              <input
                id="backend-host-input"
                autoFocus
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit();
                }}
                placeholder="192.168.1.42:8000"
                className="mt-1.5 w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white font-mono placeholder:text-white/25 focus:outline-none focus:border-white/25"
              />
              <p className="mt-1.5 text-[10px] text-white/40">
                Host:port only — e.g. the demo host's LAN IP. No protocol prefix.
              </p>
              <div className="flex gap-2 mt-2.5">
                <button
                  onClick={commit}
                  className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-white text-black font-semibold hover:bg-white/90 transition-colors"
                >
                  Connect
                </button>
                {!isDefault && (
                  <button
                    onClick={() => {
                      resetHost();
                      setOpen(false);
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-white/10 text-white/70 hover:bg-white/15 hover:text-white transition-colors"
                  >
                    Reset
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

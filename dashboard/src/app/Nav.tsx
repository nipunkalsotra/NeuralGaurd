// src/app/Nav.tsx
// Floating "island" nav — detached from the viewport edge, glass surface,
// active-route indicator. Collapses to a full-screen staggered-reveal
// overlay below md. The one persistent piece of chrome across all 6
// routes, so it also carries the live/simulated connection badge.
import { useState } from "react";
import { NavLink } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useDashboardStore } from "../store";
import { LogoMark, PillButton } from "../components/marketing/aura";

const LINKS = [
  { to: "/how-it-works", label: "How it works" },
  { to: "/architecture", label: "Architecture" },
  { to: "/fallbacks", label: "Fallbacks" },
  { to: "/about", label: "About" },
];

function ConnectionBadge() {
  const kind = useDashboardStore((s) => s.connectionKind);
  const connected = useDashboardStore((s) => s.connected);

  const label = kind === "connecting" ? "Connecting" : kind === "live" ? "Live backend" : "Simulated";
  const dotColor = kind === "connecting" ? "bg-text-tertiary" : kind === "live" ? "bg-state-healthy" : "bg-accent";

  return (
    <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-text-secondary">
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor} ${connected ? "animate-pulse-slow" : ""}`} />
      {label}
    </span>
  );
}

export default function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="fixed top-4 inset-x-0 z-40 flex justify-center px-4">
        <div className="liquid-glass flex w-full max-w-4xl items-center justify-between gap-4 rounded-full px-4 py-2">
          <NavLink to="/" onClick={() => setOpen(false)} className="flex items-center gap-2 pl-1 shrink-0">
<LogoMark className="w-5 h-5 text-white" />
            <span className="text-sm font-semibold tracking-tight text-text-primary">NeuralGuard</span>
          </NavLink>

          <nav className="hidden md:flex items-center gap-1">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  `relative px-3 py-1.5 text-[13px] font-medium rounded-full transition-colors ${
                    isActive ? "text-text-primary" : "text-text-secondary hover:text-text-primary"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {l.label}
                    {isActive && (
                      <motion.span
                        layoutId="nav-pill"
                        className="absolute inset-0 -z-10 rounded-full bg-surface-3"
                        transition={{ type: "spring", stiffness: 500, damping: 40 }}
                      />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <ConnectionBadge />
            <NavLink to="/dashboard" className="hidden sm:inline-block">
              <PillButton>Control plane</PillButton>
            </NavLink>
            <button
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              className="md:hidden relative h-8 w-8 shrink-0 grid place-items-center"
            >
              <span className="relative block h-4 w-4">
                <span
                  className={`absolute left-0 top-1 h-[1.5px] w-4 bg-text-primary transition-all duration-300 ${open ? "translate-y-[6px] rotate-45" : ""}`}
                />
                <span
                  className={`absolute left-0 bottom-1 h-[1.5px] w-4 bg-text-primary transition-all duration-300 ${open ? "-translate-y-[6px] -rotate-45" : ""}`}
                />
              </span>
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-30 bg-canvas/95 backdrop-blur-2xl md:hidden"
          >
            <nav className="flex h-full flex-col items-center justify-center gap-2">
              {[...LINKS, { to: "/dashboard", label: "Control plane" }].map((l, i) => (
                <motion.div
                  key={l.to}
                  initial={{ y: 24, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.08 + i * 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                >
                  <NavLink to={l.to} onClick={() => setOpen(false)} className="text-2xl font-medium text-text-primary py-3 block">
                    {l.label}
                  </NavLink>
                </motion.div>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

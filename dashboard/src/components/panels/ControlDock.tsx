// src/components/panels/ControlDock.tsx
// Floating glass tab bar for the genuinely secondary panels — Sandbox
// output and the Similarity trace, which don't need to be visible at
// all times the way the audit stream and circuit status do (those now
// live in the persistent LiveFeedPanel sidebar instead). On narrow
// screens, where there's no room for that sidebar, a "Live Feed" tab
// reappears here as a fallback so nothing is desktop-only.
import { motion } from "framer-motion";
import { ScrollText, Terminal, Activity } from "lucide-react";
import { useDashboardStore } from "../../store";

export type DockPanel = "feed" | "sandbox" | "similarity";

const TABS: { id: DockPanel; label: string; icon: typeof ScrollText; mobileOnly?: boolean }[] = [
  { id: "feed", label: "Live Feed", icon: ScrollText, mobileOnly: true },
  { id: "sandbox", label: "Sandbox", icon: Terminal },
  { id: "similarity", label: "Similarity", icon: Activity },
];

interface ControlDockProps {
  active: DockPanel | null;
  onSelect: (panel: DockPanel) => void;
}

export default function ControlDock({ active, onSelect }: ControlDockProps) {
  const auditCount = useDashboardStore((s) => s.auditLog.length);
  const mockActive = useDashboardStore((s) => s.mockActive);
  const similarityCount = useDashboardStore((s) => s.similarity.length);

  const badge: Partial<Record<DockPanel, string>> = {
    feed: auditCount > 0 ? String(Math.min(auditCount, 99)) : "",
  };
  const pulsing: Partial<Record<DockPanel, boolean>> = {
    sandbox: mockActive,
    similarity: similarityCount > 0,
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-4">
      <div className="liquid-glass pointer-events-auto flex items-center gap-1 rounded-full px-1.5 py-1.5">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              aria-pressed={isActive}
              className={`relative flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-medium transition-colors ${
                t.mobileOnly ? "lg:hidden" : ""
              } ${isActive ? "text-white" : "text-white/55 hover:text-white/85"}`}
            >
              {isActive && (
                <motion.span
                  layoutId="dock-pill"
                  className="absolute inset-0 -z-10 rounded-full bg-white/10"
                  transition={{ type: "spring", stiffness: 500, damping: 38 }}
                />
              )}
              <span className="relative">
                <Icon size={14} strokeWidth={1.75} />
                {pulsing[t.id] && (
                  <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-state-fallback animate-pulse-slow" />
                )}
              </span>
              <span className="hidden sm:inline">{t.label}</span>
              {badge[t.id] && (
                <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] tabular-nums text-white/70">
                  {badge[t.id]}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

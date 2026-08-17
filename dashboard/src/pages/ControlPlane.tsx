// src/pages/ControlPlane.tsx
// The real product.
//
// v1 was a permanent 4-widget grid — cramped, all boxes competing.
// v2 hid everything behind a dock+drawer, which fixed the cramping but
// meant the "is this actually live?" signal (the audit stream, circuit
// status) was invisible until you clicked something — on a page that
// opens idle, that reads as "this might be fake."
//
// v3: the essentials — circuit breaker status and the live audit
// stream — are back to being ALWAYS visible, in a persistent glass
// sidebar right next to the topology (desktop). Only the genuinely
// secondary panels (Sandbox output, the Similarity trace) stay behind
// the floating dock. On narrow screens where there's no room for a
// permanent sidebar, a "Live Feed" tab reappears in the dock as a
// fallback.
import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AgentGraph from "../components/panels/AgentGraph";
import LiveFeedPanel from "../components/panels/LiveFeedPanel";
import SandboxTerminalPanel from "../components/panels/SandboxTerminalPanel";
import FaultConsole from "../components/panels/FaultConsole";
import ThroughputMeter from "../components/panels/ThroughputMeter";
import TriageModal from "../components/panels/TriageModal";
import ControlDock, { type DockPanel } from "../components/panels/ControlDock";
import InspectorDrawer from "../components/panels/InspectorDrawer";
import AmbientBackground from "../components/background/AmbientBackground";
import { LogoMark } from "../components/marketing/aura";
import { useDataSource } from "../app/dataSourceContext";
import { useDashboardStore } from "../store";

const SimilarityChart = lazy(() => import("../components/panels/SimilarityChart"));
const ReportCardModal = lazy(() => import("../components/panels/ReportCardModal"));

export default function ControlPlane() {
  const { source, kind } = useDataSource();
  const connected = useDashboardStore((s) => s.connected);
  const auditLog = useDashboardStore((s) => s.auditLog);
  const setReportCard = useDashboardStore((s) => s.setReportCard);
  const [activePanel, setActivePanel] = useState<DockPanel | null>(null);

  // Same pattern as before: REMEDIATION_SUCCESS is the one trigger_event
  // that lands on RESUMED — fetch fresh metrics right when that happens
  // rather than waiting on a poll.
  useEffect(() => {
    const latest = auditLog[auditLog.length - 1];
    if (latest?.trigger_event === "REMEDIATION_SUCCESS") {
      source.fetchMetrics().then(setReportCard).catch(() => {});
    }
  }, [auditLog, source, setReportCard]);

  const selectPanel = (panel: DockPanel) => setActivePanel((cur) => (cur === panel ? null : panel));

  return (
    <div className="fixed inset-0 flex flex-col">
      <AmbientBackground variant="control" />

      <header className="liquid-glass h-14 shrink-0 flex items-center justify-between px-4 gap-2 overflow-x-auto rounded-none">
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-2 pr-1" aria-hidden="true">
            <span className="w-3 h-3 rounded-full" style={{ background: "#ff5f57" }} />
            <span className="w-3 h-3 rounded-full" style={{ background: "#febc2e" }} />
            <span className="w-3 h-3 rounded-full" style={{ background: "#28c840" }} />
          </div>
          <Link to="/" className="flex items-center gap-2">
            <LogoMark className="w-[18px] h-[18px] text-white" />
            <span className="text-sm font-semibold tracking-tight text-white text-glow-white">NeuralGuard</span>
          </Link>
          <span className="text-xs text-white/40 hidden sm:inline">Control Plane</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <ThroughputMeter />
          <span className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white/60">
            <span className={`h-1.5 w-1.5 rounded-full ${kind === "live" ? "bg-state-healthy" : "bg-accent"} ${connected ? "animate-pulse-slow" : ""}`} />
            {kind === "live" ? "Live backend" : "Simulated"}
          </span>
          <FaultConsole />
        </div>
      </header>

      {/* Stage + persistent sidebar — the essentials sit alongside the
          topology, not behind a click. */}
      <div className="relative flex-1 min-h-0 flex">
        <div className="relative flex-1 min-w-0">
          <AgentGraph />
          <ControlDock active={activePanel} onSelect={selectPanel} />
        </div>

        <aside className="liquid-glass hidden lg:flex w-[360px] shrink-0 flex-col rounded-none border-l border-white/10">
          <LiveFeedPanel />
        </aside>
      </div>

      {/* Mobile-only fallback for the sidebar content, and the two
          genuinely secondary panels on every screen size. */}
      <InspectorDrawer open={activePanel !== null} onClose={() => setActivePanel(null)}>
        {activePanel === "feed" && <LiveFeedPanel />}
        {activePanel === "sandbox" && <SandboxTerminalPanel />}
        {activePanel === "similarity" && (
          <Suspense fallback={null}>
            <SimilarityChart />
          </Suspense>
        )}
      </InspectorDrawer>

      <TriageModal />
      <Suspense fallback={null}>
        <ReportCardModal />
      </Suspense>
    </div>
  );
}

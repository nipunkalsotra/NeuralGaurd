// src/pages/ControlPlane.tsx
// The real product — rebuilt as a 3-column layout: agents + fallback
// chains on the left, the live audit stream in the middle, and on the
// right, the live topology by default — which hides the instant a
// record is clicked, replaced by that record's full detail (diagnosis,
// confidence, the generated patch, the hash chain) in its place. Click
// Archive, or select nothing, and the topology returns.
//
// Every previous iteration's real fixes carry forward: one shared
// DataSource connection, the audit log keyed by content hash (not
// position), real circuit status, focus-trapped modals, and the
// in-browser simulator as a full standalone fallback when no backend is
// reachable.
import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import AgentGraph from "../components/panels/AgentGraph";
import AgentSidebar from "../components/panels/AgentSidebar";
import AuditStream from "../components/panels/AuditStream";
import RecordDetail from "../components/panels/RecordDetail";
import SandboxTerminalPanel from "../components/panels/SandboxTerminalPanel";
import ConnectionSettings from "../components/panels/ConnectionSettings";
import ThroughputMeter from "../components/panels/ThroughputMeter";
import TriageModal from "../components/panels/TriageModal";
import ControlDock, { type DockPanel } from "../components/panels/ControlDock";
import InspectorDrawer from "../components/panels/InspectorDrawer";
import AmbientBackground from "../components/background/AmbientBackground";
import { LogoMark } from "../components/marketing/aura";
import { useDataSource } from "../app/dataSourceContext";
import { useDashboardStore, type AgentId } from "../store";

const SimilarityChart = lazy(() => import("../components/panels/SimilarityChart"));
const ReportCardModal = lazy(() => import("../components/panels/ReportCardModal"));

export default function ControlPlane() {
  const { source, kind } = useDataSource();
  const connected = useDashboardStore((s) => s.connected);
  const auditLog = useDashboardStore((s) => s.auditLog);
  const setReportCard = useDashboardStore((s) => s.setReportCard);
  const [activePanel, setActivePanel] = useState<DockPanel | null>(null);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<AgentId | null>(null);

  const toggleAgentFilter = (id: AgentId) => setAgentFilter((cur) => (cur === id ? null : id));

  // Derived, not synced: if the hash falls out of the (capped) audit
  // log — or was never in it — this naturally resolves to null on the
  // next render. No effect needed to "clean up" a stale selection.
  const selectedRecord = selectedHash ? auditLog.find((r) => r.current_hash === selectedHash) ?? null : null;

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

      <header className="liquid-glass relative h-14 shrink-0 flex items-center justify-between px-4 gap-2 overflow-x-auto rounded-none">
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-2 pr-1" aria-hidden="true">
            <span className="w-3 h-3 rounded-full" style={{ background: "#ff5f57" }} />
            <span className="w-3 h-3 rounded-full" style={{ background: "#febc2e" }} />
            <span className="w-3 h-3 rounded-full" style={{ background: "#28c840" }} />
          </div>
          <Link to="/" className="flex items-center gap-2">
            <LogoMark className="w-[18px] h-[18px] text-white" />
            <span className="text-sm font-semibold tracking-tight text-white hidden sm:inline">NeuralGuard</span>
          </Link>
        </div>

        <span className="hidden md:block absolute left-1/2 -translate-x-1/2 text-xs text-white/50 text-glow-white">
          NeuralGuard — Control Plane
        </span>

        <div className="flex items-center gap-2 shrink-0">
          <ThroughputMeter />
          <span className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white/60">
            <span className={`h-1.5 w-1.5 rounded-full ${kind === "live" ? "bg-state-healthy" : "bg-accent"} ${connected ? "animate-pulse-slow" : ""}`} />
            {kind === "live" ? "Live backend" : "Simulated"}
          </span>
          <ConnectionSettings />
        </div>
      </header>

      {/* 3-column stage */}
      <div className="relative flex-1 min-h-0 flex">
        <aside className="liquid-glass hidden md:flex w-[220px] shrink-0 flex-col rounded-none border-r border-white/10 overflow-y-auto">
          <AgentSidebar activeFilter={agentFilter} onFilterAgent={toggleAgentFilter} />
        </aside>

        <div className="liquid-glass hidden lg:flex w-[340px] shrink-0 flex-col rounded-none border-r border-white/10">
          <AuditStream
            selectedHash={selectedHash}
            onSelect={(r) => setSelectedHash((cur) => (cur === r.current_hash ? null : r.current_hash))}
            agentFilter={agentFilter}
          />
        </div>

        <div className="relative flex-1 min-w-0">
          <AnimatePresence mode="wait">
            {selectedRecord ? (
              <motion.div
                key={selectedRecord.current_hash}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 24 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0"
              >
                <RecordDetail record={selectedRecord} onClose={() => setSelectedHash(null)} />
              </motion.div>
            ) : (
              <motion.div
                key="topology"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="absolute inset-0"
              >
                <AgentGraph />
              </motion.div>
            )}
          </AnimatePresence>

          <ControlDock active={activePanel} onSelect={selectPanel} />
        </div>
      </div>

      {/* Mobile-only fallback for the sidebar/stream content below md/lg,
          and the two genuinely secondary panels on every screen size. */}
      <InspectorDrawer open={activePanel !== null} onClose={() => setActivePanel(null)}>
        {activePanel === "feed" && (
          <div className="flex h-full flex-col md:flex-row">
            <div className="md:w-[220px] md:shrink-0 md:border-r md:border-white/10 overflow-y-auto">
              <AgentSidebar activeFilter={agentFilter} onFilterAgent={toggleAgentFilter} />
            </div>
            <div className="flex-1 min-h-0">
              <AuditStream
                selectedHash={selectedHash}
                onSelect={(r) => {
                  setSelectedHash((cur) => (cur === r.current_hash ? null : r.current_hash));
                  setActivePanel(null);
                }}
                agentFilter={agentFilter}
              />
            </div>
          </div>
        )}
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

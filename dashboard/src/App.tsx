// src/App.tsx
import WorkflowDAG from "./views/WorkflowDAG";
import AuditLogStream from "./components/AuditLogStream";
import CircuitBreakerPanel from "./components/CircuitBreakerPanel";
import SandboxTerminal from "./components/SandboxTerminal";

export default function App() {
  return (
    <div className="min-w-[1280px] h-screen w-screen overflow-x-auto bg-gradient-to-b from-slate-900 to-slate-950 flex flex-col">
      {/* Top bar — minimal shell today, Break It button lands here on Day 7 */}
      <header className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-slate-800">
        <span className="text-sm font-semibold tracking-wide text-slate-200">
          AI Factory Sentinel
        </span>
        <span className="text-xs text-slate-500">System status — placeholder</span>
      </header>

      {/* Main split: left 60% graph / right 40% audit */}
      <div className="flex-1 min-h-0 grid grid-cols-[60%_40%]">
        <WorkflowDAG />
        <div className="border-l border-slate-800 min-w-0">
          <AuditLogStream />
        </div>
      </div>

      {/* Bottom: 20% height, circuit breaker + sandbox terminal side by side */}
      <div className="h-[20%] min-h-[160px] shrink-0 border-t border-slate-800 grid grid-cols-2">
        <CircuitBreakerPanel />
        <SandboxTerminal />
      </div>
    </div>
  );
}
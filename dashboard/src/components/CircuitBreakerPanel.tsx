// src/components/CircuitBreakerPanel.tsx
import PanelShell from "./PanelShell";

export default function CircuitBreakerPanel() {
  return (
    <PanelShell title="Circuit Breakers" className="border-r border-slate-800">
      <div className="h-full flex items-center justify-center text-slate-600 text-sm">
        Service health grid — built Day 6/11
      </div>
    </PanelShell>
  );
}
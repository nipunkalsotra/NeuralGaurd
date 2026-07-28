// src/components/AuditLogStream.tsx
import PanelShell from "./PanelShell";

export default function AuditLogStream() {
  return (
    <PanelShell title="Audit Log Stream">
      <div className="h-full flex items-center justify-center text-slate-600 text-sm">
        Live event feed — wired on Day 5
      </div>
    </PanelShell>
  );
}
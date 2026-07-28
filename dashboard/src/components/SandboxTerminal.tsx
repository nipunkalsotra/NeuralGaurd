// src/components/SandboxTerminal.tsx
import PanelShell from "./PanelShell";

export default function SandboxTerminal() {
  return (
    <PanelShell title="Sandbox Terminal">
      <div className="h-full flex items-center justify-center text-slate-600 text-sm font-mono">
        NemoClaw CLI stream — wired Day 7
      </div>
    </PanelShell>
  );
}
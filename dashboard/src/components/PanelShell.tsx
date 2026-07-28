// src/components/PanelShell.tsx
import type{ ReactNode } from "react";

interface PanelShellProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export default function PanelShell({ title, children, className = "" }: PanelShellProps) {
  return (
    <div className={`flex flex-col h-full min-w-0 min-h-0 bg-slate-900/40 ${className}`}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 shrink-0">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {title}
        </h2>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">{children}</div>
    </div>
  );
}
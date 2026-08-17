// src/components/primitives/PanelShell.tsx
import type { ReactNode } from "react";

interface PanelShellProps {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function PanelShell({ title, eyebrow, action, children, className = "" }: PanelShellProps) {
  return (
    <div className={`flex flex-col h-full min-w-0 min-h-0 bg-surface-1/60 ${className}`}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
        <div className="min-w-0">
          {eyebrow && <p className="text-[10px] uppercase tracking-[0.16em] text-text-tertiary">{eyebrow}</p>}
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary truncate">{title}</h2>
        </div>
        {action}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">{children}</div>
    </div>
  );
}

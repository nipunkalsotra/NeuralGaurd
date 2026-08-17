// src/components/panels/SandboxTerminalPanel.tsx
// Replaces SandboxTerminal. Reads store.terminalLines/mockActive directly
// — no component-owned socket, no local mock-data generator racing a
// real one.
import { useEffect, useRef, useState } from "react";
import { Trash2, Copy, Check } from "lucide-react";
import PanelShell from "../primitives/PanelShell";
import { useDashboardStore } from "../../store";

const LINE_STYLE: Record<string, string> = {
  stdout: "text-state-healthy",
  stderr: "text-state-escalated",
  mock_banner: "text-state-fallback font-bold",
};

export default function SandboxTerminalPanel() {
  const lines = useDashboardStore((s) => s.terminalLines);
  const mockActive = useDashboardStore((s) => s.mockActive);
  const clearTerminal = useDashboardStore((s) => s.clearTerminal);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [lines.length]);

  const copyAll = async () => {
    await navigator.clipboard.writeText(lines.map((l) => l.text).join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <PanelShell title="Sandbox Terminal" eyebrow="NemoClaw">
      <div className="flex flex-col h-full bg-canvas/80 backdrop-blur-sm">
        <div className="flex items-center justify-end gap-2 px-2 py-1 border-b border-border shrink-0">
          <button onClick={copyAll} aria-label="Copy all" className="text-text-tertiary hover:text-text-secondary transition-colors">
            {copied ? <Check size={13} strokeWidth={1.5} /> : <Copy size={13} strokeWidth={1.5} />}
          </button>
          <button onClick={clearTerminal} aria-label="Clear" className="text-text-tertiary hover:text-text-secondary transition-colors">
            <Trash2 size={13} strokeWidth={1.5} />
          </button>
        </div>

        {mockActive && <div className="bg-state-fallback text-canvas text-[10px] font-bold px-3 py-1.5 text-center shrink-0">[MOCK MODE] ACTIVE</div>}

        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed">
          {lines.length === 0 && <div className="flex items-center justify-center h-full text-text-tertiary">Waiting for sandbox output…</div>}
          {lines.map((line, i) => (
            <div key={line.id} className={LINE_STYLE[line.kind]}>
              <span className="text-text-tertiary/50 select-none mr-2">{String(i + 1).padStart(3, "0")}</span>
              {line.text}
            </div>
          ))}
        </div>
      </div>
    </PanelShell>
  );
}

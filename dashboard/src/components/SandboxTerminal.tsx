// src/components/SandboxTerminal.tsx
import { useEffect, useRef, useState, useCallback } from "react";
import { Trash2, Copy, Check } from "lucide-react";
import PanelShell from "./PanelShell";
import { useWebSocket } from "../hooks/useWebSocket";

interface TerminalLine {
  id: string;
  kind: "stdout" | "stderr" | "mock_banner";
  text: string;
  timestamp: string;
}

interface WSEnvelope {
  type: string;
  event_type: string;
  worker_id: string;
  payload: string;
  timestamp: string;
}

const LINE_STYLE: Record<TerminalLine["kind"], string> = {
  stdout: "text-emerald-400",
  stderr: "text-rose-400",
  mock_banner: "text-amber-400 font-bold",
};

interface SandboxTerminalProps {
  wsUrl?: string;
}

export default function SandboxTerminal({ wsUrl }: SandboxTerminalProps) {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [copied, setCopied] = useState(false);
  const [mockActive, setMockActive] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mockRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const startMock = useCallback(() => {
    if (mockRef.current) return;
    const sample: { kind: TerminalLine["kind"]; text: string }[] = [
      { kind: "stdout", text: "✓ Active gateway set to 'nemoclaw'" },
      { kind: "stdout", text: "Running patch against synthetic fixture..." },
      { kind: "stderr", text: "WARN: image cache miss, pulling..." },
      { kind: "stdout", text: "Patch applied successfully." },
    ];
    let i = 0;
    mockRef.current = setInterval(() => {
      const item = sample[i % sample.length];
      setLines((prev) =>
        [
          ...prev,
          {
            id: `${Date.now()}-${i}`,
            kind: item.kind,
            text: item.text,
            timestamp: new Date().toISOString(),
          },
        ].slice(-300)
      );
      i += 1;
    }, 1800);
  }, []);

  const handleMessage = useCallback((msg: WSEnvelope) => {
    if (!["stdout", "stderr", "mock_banner"].includes(msg.type)) return;

    if (msg.type === "mock_banner") {
      setMockActive(true);
      let text = msg.payload;
      try {
        text = JSON.parse(msg.payload).message ?? msg.payload;
      } catch {
        /* payload wasn't JSON, use as-is */
      }
      setLines((prev) =>
        [
          ...prev,
          {
            id: `${Date.now()}`,
            kind: "mock_banner" as const,
            text: `[MOCK MODE] ${text}`,
            timestamp: msg.timestamp,
          },
        ].slice(-300)
      );
      return;
    }

    setLines((prev) =>
      [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          kind: msg.type as "stdout" | "stderr",
          text: msg.payload,
          timestamp: msg.timestamp,
        },
      ].slice(-300)
    );
  }, []);

  useWebSocket<WSEnvelope>({ url: wsUrl, onMessage: handleMessage, mockFallback: startMock });

  useEffect(() => {
    return () => {
      if (mockRef.current) clearInterval(mockRef.current);
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [lines]);

  const clearTerminal = () => setLines([]);

  const copyAll = async () => {
    const text = lines.map((l) => l.text).join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <PanelShell title="Sandbox Terminal">
      <div className="flex flex-col h-full bg-slate-950">
        <div className="flex items-center justify-end gap-2 px-2 py-1 border-b border-slate-800 shrink-0">
          <button onClick={copyAll} className="text-slate-500 hover:text-slate-300 transition-colors" title="Copy all">
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <button onClick={clearTerminal} className="text-slate-500 hover:text-slate-300 transition-colors" title="Clear">
            <Trash2 size={14} />
          </button>
        </div>

        {mockActive && (
          <div className="bg-amber-500 text-black text-[11px] font-bold px-3 py-1.5 text-center shrink-0">
            [MOCK MODE] ACTIVE
          </div>
        )}

        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed">
          {lines.length === 0 && (
            <div className="flex items-center justify-center h-full text-slate-600">
              Waiting for sandbox output...
            </div>
          )}
          {lines.map((line, i) => (
            <div key={line.id} className={LINE_STYLE[line.kind]}>
              <span className="text-slate-700 select-none mr-2">{String(i + 1).padStart(3, "0")}</span>
              {line.text}
            </div>
          ))}
        </div>
      </div>
    </PanelShell>
  );
}
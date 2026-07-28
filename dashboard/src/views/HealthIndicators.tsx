// src/views/HealthIndicators.tsx
import { memo, useCallback, useEffect, useRef, useState } from "react";
import PanelShell from "../components/PanelShell";
import { useWebSocket } from "../hooks/useWebSocket";

type LoopStatus = "HEALTHY" | "LOOP_SUSPECTED" | "LOOP_DETECTED";

interface LoopEvent {
  type: "loop_detection";
  payload: {
    worker_id: string;
    similarity: number;
    status: LoopStatus;
    timestamp: string;
    fallback_used: boolean;
  };
}

const STATUS_STYLES: Record<LoopStatus, string> = {
  HEALTHY: "border-l-emerald-500 bg-emerald-500/5",
  LOOP_SUSPECTED: "border-l-amber-400 bg-amber-400/5",
  LOOP_DETECTED: "border-l-rose-500 bg-rose-500/5",
};

const STATUS_BADGE: Record<LoopStatus, string> = {
  HEALTHY: "bg-emerald-500/20 text-emerald-400",
  LOOP_SUSPECTED: "bg-amber-400/20 text-amber-300",
  LOOP_DETECTED: "bg-rose-500/20 text-rose-400",
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB");
}

const Row = memo(function Row({ event }: { event: LoopEvent["payload"] }) {
  return (
    <div className={`border-l-4 px-3 py-2 ${STATUS_STYLES[event.status]}`}>
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-slate-400 w-20 shrink-0">
          {formatTime(event.timestamp)}
        </span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${STATUS_BADGE[event.status]}`}>
          {event.status}
        </span>
        <span className="text-xs text-slate-300 truncate">
          {event.worker_id} · similarity {event.similarity.toFixed(2)}
          {event.fallback_used ? " · fallback" : ""}
        </span>
      </div>
    </div>
  );
});

interface HealthIndicatorsProps {
  wsUrl?: string;
}

export default function HealthIndicators({ wsUrl }: HealthIndicatorsProps) {
  const [events, setEvents] = useState<LoopEvent["payload"][]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mockRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startMock = useCallback(() => {
    if (mockRef.current) return;
    let tick = 0;
    mockRef.current = setInterval(() => {
      tick += 1;
      const worker = `worker-${(tick % 3) + 1}`;
      const spiking = worker === "worker-3" && tick % 10 >= 6 && tick % 10 <= 8;
      const similarity = spiking ? 0.93 + Math.random() * 0.05 : 0.3 + Math.random() * 0.3;
      const status: LoopStatus =
        similarity > 0.92 ? (tick % 10 === 8 ? "LOOP_DETECTED" : "LOOP_SUSPECTED") : "HEALTHY";

      setEvents((prev) =>
        [
          ...prev,
          {
            worker_id: worker,
            similarity,
            status,
            timestamp: new Date().toISOString(),
            fallback_used: Math.random() < 0.1,
          },
        ].slice(-100)
      );
    }, 1200);
  }, []);

  const handleMessage = useCallback((msg: LoopEvent) => {
    if (msg.type !== "loop_detection") return;
    setEvents((prev) => [...prev, msg.payload].slice(-100));
  }, []);

  useWebSocket<LoopEvent>({ url: wsUrl, onMessage: handleMessage, mockFallback: startMock });

  useEffect(() => {
    return () => {
      if (mockRef.current) clearInterval(mockRef.current);
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [events]);

  return (
    <PanelShell title="Loop Detection Stream">
      <div ref={scrollRef} className="h-full overflow-y-auto divide-y divide-slate-800/50">
        {events.length === 0 && (
          <div className="flex items-center justify-center h-full text-slate-600 text-sm">
            Monitoring workers...
          </div>
        )}
        {events.map((e, i) => (
          <Row key={i} event={e} />
        ))}
      </div>
    </PanelShell>
  );
}
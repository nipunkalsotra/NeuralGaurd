// src/views/SimilarityGraph.tsx
import { useEffect, useRef, useState } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import PanelShell from "../components/PanelShell";

const THRESHOLD = 0.92;
const MAX_POINTS = 30;

const WORKERS = [
  { id: "worker-1", color: "#34d399" }, // emerald
  { id: "worker-2", color: "#60a5fa" }, // blue
  { id: "worker-3", color: "#f472b6" }, // pink — the one we'll spike in the demo
] as const;

type WorkerId = (typeof WORKERS)[number]["id"];
type SimilarityPoint = { time: number } & Record<WorkerId, number>;

// Gradient offset from top of chart (value 1) down to value 0.
// Fixed [0,1] domain, so offset for a given value = 1 - value.
const thresholdOffset = 1 - THRESHOLD;

function useSimilarityStream(wsUrl?: string) {
  const [data, setData] = useState<SimilarityPoint[]>([]);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let mockInterval: ReturnType<typeof setInterval> | null = null;
    let tick = 0;

    const pushPoint = (point: SimilarityPoint) => {
      setData((prev) => [...prev, point].slice(-MAX_POINTS));
    };

    const startMock = () => {
      mockInterval = setInterval(() => {
        tick += 1;
        // worker-3 spikes above threshold around tick 12-16 to simulate a loop
        const spiking = tick >= 12 && tick <= 16;
        pushPoint({
          time: tick,
          "worker-1": 0.3 + Math.random() * 0.15,
          "worker-2": 0.35 + Math.random() * 0.2,
          "worker-3": spiking ? 0.93 + Math.random() * 0.05 : 0.3 + Math.random() * 0.2,
        });
      }, 1000);
    };

    if (wsUrl) {
      try {
        const ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onmessage = (e) => {
          try {
            const parsed = JSON.parse(e.data);
            pushPoint(parsed);
          } catch {
            console.warn("Malformed similarity payload, ignoring");
          }
        };
        ws.onerror = () => {
          console.warn("Similarity WebSocket errored — falling back to mock stream");
          startMock();
        };
        ws.onclose = () => {
          if (!mockInterval) startMock();
        };
      } catch {
        startMock();
      }
    } else {
      startMock();
    }

    return () => {
      socketRef.current?.close();
      if (mockInterval) clearInterval(mockInterval);
    };
  }, [wsUrl]);

  return data;
}

interface SimilarityGraphProps {
  wsUrl?: string; // pass real URL once Day 9 backend is live; omit for mock mode
}

export default function SimilarityGraph({ wsUrl }: SimilarityGraphProps) {
  const data = useSimilarityStream(wsUrl);

  return (
    <PanelShell title="Similarity Graph">
      <div className="h-full w-full p-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              {WORKERS.map((w) => (
                <linearGradient key={w.id} id={`grad-${w.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset={0} stopColor="#f43f5e" stopOpacity={0.5} />
                  <stop offset={thresholdOffset} stopColor="#f43f5e" stopOpacity={0.5} />
                  <stop offset={thresholdOffset} stopColor={w.color} stopOpacity={0.15} />
                  <stop offset={1} stopColor={w.color} stopOpacity={0.05} />
                </linearGradient>
              ))}
            </defs>

            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
            <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 1]} stroke="#64748b" tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{
                background: "#0f172a",
                border: "1px solid #334155",
                fontSize: 12,
              }}
            />

            <ReferenceLine
              y={THRESHOLD}
              stroke="#f43f5e"
              strokeDasharray="4 4"
              label={{ value: "0.92 threshold", fill: "#f43f5e", fontSize: 10, position: "insideTopRight" }}
            />

            {WORKERS.map((w) => (
              <Area
                key={w.id}
                type="monotone"
                dataKey={w.id}
                stroke="none"
                fill={`url(#grad-${w.id})`}
                isAnimationActive={false}
              />
            ))}

            {WORKERS.map((w) => (
              <Line
                key={w.id}
                type="monotone"
                dataKey={w.id}
                stroke={w.color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name={w.id}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </PanelShell>
  );
}
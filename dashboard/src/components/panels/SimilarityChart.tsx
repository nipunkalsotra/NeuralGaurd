// src/components/panels/SimilarityChart.tsx
// Replaces the old SimilarityGraph. That component always rendered
// Math.random() noise — no wsUrl was ever passed to it, and no backend
// endpoint emitted a "similarity" envelope in the first place (finding
// #1). This reads store.similarity, populated by a real "similarity"
// envelope both LiveBackendSource's WS and SimulatedSource emit whenever
// SentinelAgent.detectLoop() actually computes one (see sim/index.ts's
// injectFault and backend/sentinel/agents/sentinel_agent.py's
// broadcast — see workstream #7 for the backend-side emit).
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, Tooltip, ResponsiveContainer } from "recharts";
import PanelShell from "../primitives/PanelShell";
import { useDashboardStore } from "../../store";
import { color } from "../../design/tokens";

const THRESHOLD = 0.92;

export default function SimilarityChart() {
  const points = useDashboardStore((s) => s.similarity);

  return (
    <PanelShell title="Similarity Trace" eyebrow="Sentinel · cosine similarity">
      <div className="h-full w-full p-2">
        {points.length === 0 ? (
          <div className="h-full grid place-items-center text-sm text-text-tertiary">No loop-detection samples yet — inject a fault to see live similarity scores.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="sim-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={0} stopColor={color.accent} stopOpacity={0.35} />
                  <stop offset={1} stopColor={color.accent} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1c2028" strokeDasharray="3 3" />
              <XAxis dataKey="time" stroke="#5b6270" tick={{ fontSize: 10 }} tickFormatter={() => ""} />
              <YAxis domain={[0, 1]} stroke="#5b6270" tick={{ fontSize: 10 }} width={28} />
              <Tooltip contentStyle={{ background: "#0e1013", border: "1px solid #1c2028", fontSize: 12, borderRadius: 8 }} labelFormatter={() => ""} />
              <ReferenceLine y={THRESHOLD} stroke="#f43f5e" strokeDasharray="4 4" label={{ value: "0.92 threshold", fill: "#f43f5e", fontSize: 10, position: "insideTopRight" }} />
              <Area type="monotone" dataKey="similarity" stroke="none" fill="url(#sim-grad)" isAnimationActive={false} />
              <Line type="monotone" dataKey="similarity" stroke={color.accent} strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </PanelShell>
  );
}

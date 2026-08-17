// src/components/panels/ThroughputMeter.tsx
// The persistent, standalone live throughput counter documented in the
// old README's "Future work" as explicitly missing — the demo narrative
// (100% → dips during an incident → recovers to ~97%) previously only
// ever rendered once, inside the final Post-Heal Report Card modal.
import { useEffect, useState } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { useDataSource } from "../../app/dataSourceContext";

const POLL_MS = 1500;

export default function ThroughputMeter() {
  const { source } = useDataSource();
  const [pct, setPct] = useState(100);
  const spring = useSpring(100, { stiffness: 90, damping: 20 });
  const rounded = useTransform(spring, (v) => `${Math.round(v)}%`);

  useEffect(() => {
    spring.set(pct);
  }, [pct, spring]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const m = await source.fetchMetrics();
        if (!cancelled) setPct(m.throughput_maintained);
      } catch {
        /* keep last known value */
      }
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [source]);

  const tone = pct >= 95 ? "text-state-healthy" : pct >= 80 ? "text-state-suspected" : "text-state-escalated";

  return (
    <div className="liquid-glass flex items-center gap-2 rounded-full px-3 py-1.5">
      <TrendingUp size={14} strokeWidth={1.5} className={tone} />
      <span className="text-[10px] uppercase tracking-[0.12em] text-white/50">Throughput</span>
      <motion.span className={`text-sm font-semibold tabular-nums ${tone} text-glow-white`}>{rounded}</motion.span>
    </div>
  );
}

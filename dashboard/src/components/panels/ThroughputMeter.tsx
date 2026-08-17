// src/components/panels/ThroughputMeter.tsx
// The persistent, standalone live throughput counter.
//
// v1 polled /api/metrics on a 1.5s timer — completely decoupled from
// when the value actually changed, so a sub-2-second incident routinely
// slipped between two polls entirely.
// v2 tried to react to the audit stream but still went through a REST
// round-trip per event, guarded by a "one fetch at a time" ref that
// could silently swallow the recovery fetch if the dip fetch was still
// in flight when RESUMED arrived — still racy.
// v3 (this version): the throughput value now lives directly on the
// store, updated synchronously the instant the WebSocket delivers the
// record that actually changes it (see store/index.ts's audit_event
// handler) — zero network round-trip, zero polling, zero race. The one
// remaining REST call is a single fetch on mount, for the genuine edge
// case of loading the page mid-incident, before this tab ever received
// the WebSocket event that caused it.
import { useEffect } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { useDataSource } from "../../app/dataSourceContext";
import { useDashboardStore } from "../../store";

export default function ThroughputMeter() {
  const { source } = useDataSource();
  const pct = useDashboardStore((s) => s.throughput);
  const setThroughput = useDashboardStore((s) => s.setThroughput);
  const spring = useSpring(100, { stiffness: 90, damping: 20 });
  const rounded = useTransform(spring, (v) => `${Math.round(v)}%`);

  useEffect(() => {
    spring.set(pct);
  }, [pct, spring]);

  useEffect(() => {
    let cancelled = false;
    source
      .fetchMetrics()
      .then((m) => {
        if (!cancelled) setThroughput(m.throughput_maintained);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [source, setThroughput]);

  const tone = pct >= 95 ? "text-state-healthy" : pct >= 80 ? "text-state-suspected" : "text-state-escalated";

  return (
    <div className="liquid-glass flex items-center gap-2 rounded-full px-3 py-1.5">
      <TrendingUp size={14} strokeWidth={1.5} className={tone} />
      <span className="text-[10px] uppercase tracking-[0.12em] text-white/50">Throughput</span>
      <motion.span className={`text-sm font-semibold tabular-nums ${tone} text-glow-white`}>{rounded}</motion.span>
    </div>
  );
}

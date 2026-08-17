// src/components/panels/ReportCardModal.tsx
// Replaces PostHealReportCard. Same structural AnimatePresence fix as
// TriageModal — rendered unconditionally, child is conditional on
// store.reportCard so the close animation actually plays.
import { useEffect, useCallback, useRef } from "react";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from "framer-motion";
import { CheckCircle2, Clock, Zap, TrendingUp, Wrench, AlertTriangle, ShieldAlert } from "lucide-react";
import { useDashboardStore } from "../../store";
import type { ReportCardMetrics } from "../../data/types";

interface MetricDef {
  key: keyof ReportCardMetrics;
  label: string;
  unit: string;
  decimals: number;
  icon: typeof Clock;
  colorVar: string;
}

const METRICS: MetricDef[] = [
  { key: "time_to_detect", label: "Time to detect", unit: "s", decimals: 1, icon: Clock, colorVar: "var(--color-state-diagnosing)" },
  { key: "tokens_saved", label: "Tokens saved", unit: "", decimals: 0, icon: Zap, colorVar: "var(--color-state-fallback)" },
  { key: "throughput_maintained", label: "Throughput", unit: "%", decimals: 0, icon: TrendingUp, colorVar: "var(--color-state-healthy)" },
  { key: "fixes_applied", label: "Fixes applied", unit: "", decimals: 0, icon: Wrench, colorVar: "var(--color-state-remediating)" },
  { key: "escalations", label: "Escalations", unit: "", decimals: 0, icon: AlertTriangle, colorVar: "var(--color-state-escalated)" },
  { key: "fallbacks_triggered", label: "Fallbacks", unit: "", decimals: 0, icon: ShieldAlert, colorVar: "var(--color-state-verifying)" },
];

function AnimatedCounter({ value, decimals, unit, delay }: { value: number; decimals: number; unit: string; delay: number }) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => `${v.toFixed(decimals)}${unit}`);
  useEffect(() => {
    const controls = animate(mv, value, { duration: 1.4, delay, type: "spring", stiffness: 100, damping: 15 });
    return controls.stop;
  }, [mv, value, delay]);
  return <motion.span>{rounded}</motion.span>;
}

function MetricCard({ metric, value, index }: { metric: MetricDef; value: number; index: number }) {
  const Icon = metric.icon;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05, duration: 0.3 }} className="relative rounded-xl bg-surface-1 border border-border p-4">
      <Icon size={16} strokeWidth={1.5} className="absolute top-3 right-3" style={{ color: metric.colorVar }} />
      <div className="text-2xl font-semibold text-text-primary tabular-nums">
        <AnimatedCounter value={value} decimals={metric.decimals} unit={metric.unit} delay={index * 0.08} />
      </div>
      <div className="text-xs text-text-tertiary mt-1">{metric.label}</div>
    </motion.div>
  );
}

const CONFETTI_COLORS = ["#635bff", "#10b981", "#fbbf24", "#60a5fa", "#f472b6"];

function useConfettiBurst(canvasRef: React.RefObject<HTMLCanvasElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const particles = Array.from({ length: 70 }, () => ({
      x: width / 2, y: height / 2,
      vx: (Math.random() - 0.5) * 11, vy: (Math.random() - 1.2) * 11,
      size: 4 + Math.random() * 4,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      rotation: Math.random() * 360, spin: (Math.random() - 0.5) * 10,
    }));

    const start = performance.now();
    let frameId: number;
    const frame = (now: number) => {
      const elapsed = now - start;
      ctx.clearRect(0, 0, width, height);
      if (elapsed >= 1800) return;
      for (const p of particles) {
        p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.rotation += p.spin;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }
      frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, [canvasRef, active]);
}

export default function ReportCardModal() {
  const metrics = useDashboardStore((s) => s.reportCard);
  const onClose = useDashboardStore((s) => s.closeReportCard);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(metrics !== null);
  useConfettiBurst(canvasRef, metrics !== null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => e.key === "Escape" && onClose(), [onClose]);
  useEffect(() => {
    if (!metrics) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [metrics, handleKeyDown]);

  return (
    <AnimatePresence>
      {metrics && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            ref={trapRef}
            role="dialog"
            aria-modal="true"
            aria-label="Post-heal report"
            className="relative w-full max-w-[680px] rounded-2xl border border-border bg-surface-2 text-text-primary shadow-2xl overflow-hidden"
            initial={{ scale: 0.94, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 4 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none w-full h-full" />
            <div className="relative flex items-start justify-between px-6 pt-6">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={20} strokeWidth={1.5} className="text-state-healthy" />
                <span className="text-lg font-semibold">Healing complete</span>
              </div>
              <button onClick={onClose} aria-label="Close" className="text-text-tertiary hover:text-text-primary transition-colors text-lg leading-none">✕</button>
            </div>
            <div className="relative grid grid-cols-2 sm:grid-cols-3 gap-3 px-6 pt-5 pb-6">
              {METRICS.map((metric, i) => (
                <MetricCard key={metric.key} metric={metric} value={metrics[metric.key] ?? 0} index={i} />
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

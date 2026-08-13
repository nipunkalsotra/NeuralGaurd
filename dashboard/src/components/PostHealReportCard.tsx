// src/components/PostHealReportCard.tsx
import { useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from "framer-motion";
import { CheckCircle2, Clock, Zap, TrendingUp, Wrench, AlertTriangle, ShieldAlert } from "lucide-react";

// Day 12 (Tushar): modal shell only — placeholder values, staggered
// animated counters, confetti burst. Backend wiring (GET /api/metrics,
// populated on REMEDIATION_SUCCESS) is explicitly Day 13 scope per the
// guide ("Placeholder values for now — will wire to backend on Day 13").
export interface ReportCardMetrics {
  time_to_detect: number | null;
  tokens_saved: number;
  throughput_maintained: number;
  fixes_applied: number;
  escalations: number;
  fallbacks_triggered: number;
}

interface MetricDef {
  key: keyof ReportCardMetrics;
  label: string;
  unit: string;
  decimals: number;
  icon: typeof Clock;
  iconRgb: string;
}

const METRICS: MetricDef[] = [
  { key: "time_to_detect", label: "Time to Detect", unit: "s", decimals: 1, icon: Clock, iconRgb: "96,165,250" },
  { key: "tokens_saved", label: "Tokens Saved", unit: "", decimals: 0, icon: Zap, iconRgb: "250,204,21" },
  { key: "throughput_maintained", label: "Throughput", unit: "%", decimals: 0, icon: TrendingUp, iconRgb: "16,185,129" },
  { key: "fixes_applied", label: "Fixes Applied", unit: "", decimals: 0, icon: Wrench, iconRgb: "249,115,22" },
  { key: "escalations", label: "Escalations", unit: "", decimals: 0, icon: AlertTriangle, iconRgb: "244,63,94" },
  { key: "fallbacks_triggered", label: "Fallbacks", unit: "", decimals: 0, icon: ShieldAlert, iconRgb: "139,92,246" },
];

const COUNTER_DURATION = 1.5;
const COUNTER_STAGGER = 0.1;
const SPRING = { stiffness: 100, damping: 15 };

function AnimatedCounter({ value, decimals, unit, delay }: { value: number; decimals: number; unit: string; delay: number }) {
  const motionValue = useMotionValue(0);
  const rounded = useTransform(motionValue, (v) => `${v.toFixed(decimals)}${unit}`);

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration: COUNTER_DURATION,
      delay,
      type: "spring",
      ...SPRING,
    });
    return controls.stop;
  }, [motionValue, value, delay]);

  return <motion.span>{rounded}</motion.span>;
}

function MetricCard({ metric, value, index }: { metric: MetricDef; value: number; index: number }) {
  const Icon = metric.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className="relative rounded-lg bg-slate-900/40 border border-slate-800 p-4"
    >
      <Icon
        size={18}
        className="absolute top-3 right-3"
        style={{ color: `rgb(${metric.iconRgb})` }}
      />
      <div className="text-2xl font-bold text-slate-100">
        <AnimatedCounter
          value={value}
          decimals={metric.decimals}
          unit={metric.unit}
          delay={index * COUNTER_STAGGER}
        />
      </div>
      <div className="text-sm text-slate-400 mt-1">{metric.label}</div>
    </motion.div>
  );
}

// Lightweight custom canvas confetti — avoids pulling in a whole new
// dependency (canvas-confetti) for a single 2s burst; the guide names
// this as an explicit fallback ("canvas-confetti OR a custom canvas
// animation").
const CONFETTI_COLORS = ["#34d399", "#fbbf24", "#60a5fa", "#f472b6", "#a78bfa"];
const CONFETTI_DURATION_MS = 2000;
const CONFETTI_PARTICLE_COUNT = 80;

function useConfettiBurst(canvasRef: React.RefObject<HTMLCanvasElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const particles = Array.from({ length: CONFETTI_PARTICLE_COUNT }, () => ({
      x: width / 2,
      y: height / 2,
      vx: (Math.random() - 0.5) * 12,
      vy: (Math.random() - 1.2) * 12,
      size: 4 + Math.random() * 4,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      rotation: Math.random() * 360,
      spin: (Math.random() - 0.5) * 10,
    }));

    const start = performance.now();
    let frameId: number;

    const frame = (now: number) => {
      const elapsed = now - start;
      ctx.clearRect(0, 0, width, height);
      if (elapsed >= CONFETTI_DURATION_MS) return;

      for (const p of particles) {
        p.vy += 0.35; // gravity
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.spin;

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

interface PostHealReportCardProps {
  metrics: ReportCardMetrics | null;
  onClose: () => void;
}

export default function PostHealReportCard({ metrics, onClose }: PostHealReportCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useConfettiBurst(canvasRef, metrics !== null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!metrics) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [metrics, handleKeyDown]);

  if (!metrics) return null;

  return (
    <AnimatePresence>
      {metrics && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-[700px] mx-4 rounded-xl border border-slate-600 bg-slate-800 text-slate-100 shadow-2xl overflow-hidden"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
          >
            <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none w-full h-full" />

            <div className="relative flex items-start justify-between px-6 pt-6">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={22} className="text-emerald-400" />
                <span className="text-lg font-semibold text-slate-100">Healing Complete</span>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="text-slate-400 hover:text-slate-100 transition-colors text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="relative grid grid-cols-3 gap-3 px-6 pt-5 pb-6">
              {METRICS.map((metric, i) => (
                <MetricCard
                  key={metric.key}
                  metric={metric}
                  value={metrics[metric.key] ?? 0}
                  index={i}
                />
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

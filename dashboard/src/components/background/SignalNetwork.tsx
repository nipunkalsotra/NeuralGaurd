// src/components/background/SignalNetwork.tsx
// Canvas layer that sits over the shader field: a sparse mesh of nodes
// with signal pulses travelling along the edges between them. Thematic
// rather than decorative — it's the product's own subject matter (agents
// on an event bus passing messages), and roughly every 9 seconds one
// node faults (flares red, its edges go dark) and then heals back to the
// accent colour, which is literally what NeuralGuard does.
//
// Kept deliberately sparse and low-contrast so it never competes with
// foreground text. Pauses when hidden; renders one static frame under
// prefers-reduced-motion.
import { useEffect, useRef } from "react";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

interface Pulse {
  from: number;
  to: number;
  t: number;
  speed: number;
}

const NODE_COUNT_DESKTOP = 26;
const NODE_COUNT_MOBILE = 12;
const LINK_DISTANCE = 190;
const MAX_PULSES = 14;
const FAULT_PERIOD_MS = 9000;
const FAULT_DURATION_MS = 2200;

interface SignalNetworkProps {
  opacity?: number;
}

export default function SignalNetwork({ opacity = 1 }: SignalNetworkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let width = 0;
    let height = 0;
    let nodes: Node[] = [];
    let pulses: Pulse[] = [];

    const seed = () => {
      const count = width < 768 ? NODE_COUNT_MOBILE : NODE_COUNT_DESKTOP;
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.16,
        vy: (Math.random() - 0.5) * 0.16,
        r: 1 + Math.random() * 1.8,
      }));
      pulses = [];
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const spawnPulse = () => {
      if (pulses.length >= MAX_PULSES || nodes.length < 2) return;
      const from = Math.floor(Math.random() * nodes.length);
      // Only spawn along an edge that's actually drawn, so a pulse never
      // travels through empty space with no visible connection.
      const candidates: number[] = [];
      for (let i = 0; i < nodes.length; i++) {
        if (i === from) continue;
        const dx = nodes[i].x - nodes[from].x;
        const dy = nodes[i].y - nodes[from].y;
        if (dx * dx + dy * dy < LINK_DISTANCE * LINK_DISTANCE) candidates.push(i);
      }
      if (candidates.length === 0) return;
      pulses.push({
        from,
        to: candidates[Math.floor(Math.random() * candidates.length)],
        t: 0,
        speed: 0.006 + Math.random() * 0.010,
      });
    };

    const start = performance.now();

    const draw = (now: number) => {
      const elapsed = now - start;
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = opacity;

      // Which node is currently "faulting" — deterministic from elapsed
      // time so it reads as a recurring cycle, not random flicker.
      const cyclePos = elapsed % FAULT_PERIOD_MS;
      const faulting = !reduced && cyclePos < FAULT_DURATION_MS && nodes.length > 0;
      const faultIndex = faulting ? Math.floor(elapsed / FAULT_PERIOD_MS) % nodes.length : -1;
      // 0 -> 1 across the fault window, used to fade red back to accent
      const healProgress = faulting ? cyclePos / FAULT_DURATION_MS : 1;

      if (!reduced) {
        for (const n of nodes) {
          n.x += n.vx;
          n.y += n.vy;
          if (n.x < 0 || n.x > width) n.vx *= -1;
          if (n.y < 0 || n.y > height) n.vy *= -1;
        }
      }

      // -- edges --
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const distSq = dx * dx + dy * dy;
          if (distSq > LINK_DISTANCE * LINK_DISTANCE) continue;
          const dist = Math.sqrt(distSq);
          const strength = 1 - dist / LINK_DISTANCE;
          const touchesFault = i === faultIndex || j === faultIndex;
          ctx.strokeStyle = touchesFault
            ? `rgba(244,63,94,${strength * 0.4 * (1 - healProgress * 0.7)})`
            : `rgba(140,140,190,${strength * 0.13})`;
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.stroke();
        }
      }

      // -- travelling pulses --
      if (!reduced) {
        if (Math.random() < 0.07) spawnPulse();
        pulses = pulses.filter((p) => {
          p.t += p.speed;
          if (p.t >= 1) return false;
          const a = nodes[p.from];
          const b = nodes[p.to];
          if (!a || !b) return false;
          // ease-in-out so a pulse accelerates away and decelerates in
          const e = p.t < 0.5 ? 2 * p.t * p.t : 1 - Math.pow(-2 * p.t + 2, 2) / 2;
          const x = a.x + (b.x - a.x) * e;
          const y = a.y + (b.y - a.y) * e;
          const fade = Math.sin(p.t * Math.PI); // fade in and out at the ends

          const glow = ctx.createRadialGradient(x, y, 0, x, y, 9);
          glow.addColorStop(0, `rgba(99,91,255,${0.55 * fade})`);
          glow.addColorStop(1, "rgba(99,91,255,0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(x, y, 9, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = `rgba(190,186,255,${0.85 * fade})`;
          ctx.beginPath();
          ctx.arc(x, y, 1.5, 0, Math.PI * 2);
          ctx.fill();
          return true;
        });
      }

      // -- nodes --
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const isFault = i === faultIndex;
        const breathe = reduced ? 1 : 1 + Math.sin(elapsed / 900 + i) * 0.22;
        const rgb = isFault ? "244,63,94" : "99,91,255";
        const alpha = isFault ? 0.75 : 0.34;

        const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 7 * breathe);
        glow.addColorStop(0, `rgba(${rgb},${alpha * 0.55})`);
        glow.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * 7 * breathe, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(${rgb},${alpha + 0.2})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * breathe, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
    };

    if (reduced) {
      draw(start);
      return () => ro.disconnect();
    }

    let raf = 0;
    let running = true;
    const loop = (now: number) => {
      if (!running) return;
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        raf = requestAnimationFrame(loop);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [opacity]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />;
}

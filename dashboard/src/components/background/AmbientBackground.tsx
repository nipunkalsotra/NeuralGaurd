// src/components/background/AmbientBackground.tsx
// Composes the full ambient stack, fixed behind all page content:
//
//   0. CSS radial-gradient bed  — always painted, and the sole visual if
//                                 WebGL is unavailable (old GPU, headless)
//   1. ShaderField (WebGL)      — domain-warped aurora, the "expensive" layer
//   2. SignalNetwork (canvas)   — agent mesh + travelling pulses
//   3. Vignette + top scrim     — keeps foreground text legible over it all
//   4. Grain                    — breaks up 8-bit banding, adds film texture
//
// Everything is pointer-events-none and aria-hidden; the whole stack is
// decorative and never intercepts input or reaches a screen reader.
import ShaderField from "./ShaderField";
import SignalNetwork from "./SignalNetwork";

export type AmbientVariant = "full" | "control";

interface AmbientBackgroundProps {
  /** "full" for marketing routes. "control" for the Control Plane — was
   * "subtle" and tuned so dark (0.23 effective shader opacity + a scrim
   * running to 90% black) that live data read as flat/lifeless against
   * it. Brightened substantially: still dimmer than the marketing pages
   * so panel content stays the clear focal point, but the aurora and
   * signal mesh are now genuinely visible, not a barely-there wash. */
  variant?: AmbientVariant;
}

const CONFIG: Record<AmbientVariant, { shader: number; shaderOpacity: number; network: number; scrim: string }> = {
  full: { shader: 1, shaderOpacity: 0.95, network: 0.9, scrim: "from-canvas/10 via-canvas/40 to-canvas/85" },
  control: { shader: 0.85, shaderOpacity: 0.8, network: 0.65, scrim: "from-canvas/20 via-canvas/35 to-canvas/55" },
};

export default function AmbientBackground({ variant = "full" }: AmbientBackgroundProps) {
  const cfg = CONFIG[variant];

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {/* 0 — CSS bed / no-WebGL fallback */}
      <div
        className="absolute inset-0 bg-canvas"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 70% 55% at 18% 8%, rgba(99,91,255,0.20), transparent 60%)," +
            "radial-gradient(ellipse 60% 50% at 85% 25%, rgba(74,67,201,0.16), transparent 62%)," +
            "radial-gradient(ellipse 80% 60% at 50% 105%, rgba(16,185,129,0.07), transparent 65%)",
        }}
      />

      {/* 1 — WebGL aurora */}
      <div className="absolute inset-0" style={{ opacity: cfg.shaderOpacity }}>
        <ShaderField intensity={cfg.shader} />
      </div>

      {/* 2 — agent mesh + signal pulses */}
      <SignalNetwork opacity={cfg.network} />

      {/* 3 — legibility scrim: transparent at the top, progressively
             more solid further down the fold — much lighter touch on
             the control variant than before, so the aurora survives. */}
      <div className={`absolute inset-0 bg-gradient-to-b ${cfg.scrim}`} />
      <div
        className="absolute inset-0"
        style={{
          background:
            variant === "control"
              ? "radial-gradient(ellipse 95% 85% at 50% 45%, transparent 45%, rgba(8,9,11,0.45) 100%)"
              : "radial-gradient(ellipse 90% 75% at 50% 45%, transparent 30%, rgba(8,9,11,0.72) 100%)",
        }}
      />

      {/* 4 — film grain. Plain absolute inside this already-fixed stack;
             the .grain-overlay utility's own fixed/z-index is meant for
             standalone use and would be redundant here. */}
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='128'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}

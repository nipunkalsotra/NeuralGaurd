// src/design/tokens.ts
// JS-side mirror of the CSS custom properties defined in index.css's
// @theme block. GSAP/Framer Motion read numeric durations/eases directly
// rather than parsing computed CSS custom properties at runtime — this
// file is the single place both the stylesheet and the animation code
// derive from, kept in sync by hand (small enough surface that a build
// step to auto-generate one from the other would be more machinery
// than it saves).

export const color = {
  canvas: "#08090b",
  surface1: "#0e1013",
  surface2: "#14171c",
  surface3: "#1b1f26",
  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.14)",
  textPrimary: "#f5f6f8",
  textSecondary: "#9a9faa",
  textTertiary: "#62666f",
  accent: "#635bff",
  accent2: "#4a43c9",
  accentSoft: "rgba(99,91,255,0.14)",
} as const;

// FSM semantic state colors — mirrors orchestrator.py's WorkerState enum
// exactly. Referenced by every panel that renders a worker/agent state so
// there is exactly one place this mapping can drift from the backend.
export const stateColor = {
  HEALTHY: "#10b981",
  LOOP_SUSPECTED: "#fbbf24",
  DIAGNOSING: "#60a5fa",
  REMEDIATING: "#f97316",
  VERIFYING: "#8b5cf6",
  ESCALATED: "#f43f5e",
  RESUMED: "#10b981",
} as const;

export const fallbackColor = "#facc15";

export const ease = {
  // GSAP-string form (power/expo families) and CSS cubic-bezier form
  // are kept side by side — GSAP timelines use the named string,
  // Framer/CSS transitions use the bezier array.
  premium: [0.16, 1, 0.3, 1] as [number, number, number, number],
  premiumGsap: "expo.out",
  snap: [0.65, 0, 0.35, 1] as [number, number, number, number],
  snapGsap: "power2.inOut",
  spring: [0.34, 1.56, 0.64, 1] as [number, number, number, number],
} as const;

export const duration = {
  instant: 0.1,
  fast: 0.18,
  base: 0.3,
  slow: 0.5,
  cinematic: 0.9,
} as const;

export const stagger = {
  tight: 0.04,
  base: 0.08,
  loose: 0.14,
} as const;

// src/components/marketing/auraStyles.ts
// Split out of aura.tsx so that file exports only components — mixing a
// plain constant export in breaks react-refresh's fast-refresh boundary.

/** The shiny headline gradient. Stops are asymmetric on purpose: the
 * bright cyan band sits at 32.5–50% so the sweep reads as a highlight
 * travelling across the glyphs rather than a symmetric pulse. */
const SHINY_GRADIENT =
  "linear-gradient(to right, #091020 0%, #0B2551 12.5%, #A4F4FD 32.5%, #00d2ff 50%, #0B2551 67.5%, #091020 87.5%, #091020 100%)";

export const shinyStyle: React.CSSProperties = {
  backgroundImage: SHINY_GRADIENT,
  backgroundSize: "200% auto",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
  WebkitTextFillColor: "transparent",
  filter: "url(#c3-noise-headline)",
};

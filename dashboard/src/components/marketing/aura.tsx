// src/components/marketing/aura.tsx
// Shared primitives for the cinematic treatment: noise filters, guide
// rails, the shiny gradient headline, glass buttons, section eyebrows,
// and the macOS-style window chrome that frames app previews.
//
// Deliberately NOT included from the reference design: an Apple logo and
// a "Download for Intel / Apple Silicon" button. NeuralGuard is a web
// control plane, not a signed Mac app — shipping that chrome would be a
// claim the product can't back. The window frame below is used only as
// a frame around a genuine screenshot-equivalent of the running app,
// which is an honest way to present it.
import type { ReactNode } from "react";
import { shinyStyle } from "./auraStyles";

/* ------------------------------------------------------------------ */
/* Noise filters                                                       */
/* ------------------------------------------------------------------ */

/** Subtle grain, multiply-blended — used by the shiny hero headline to
 * break up gradient banding across large display type. */
export function HeadlineNoiseFilter() {
  return (
    <svg className="absolute -z-10 h-0 w-0" aria-hidden="true">
      <filter id="c3-noise-headline">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
        <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.35 0" />
        <feComposite in2="SourceGraphic" operator="in" result="noise" />
        <feBlend in="SourceGraphic" in2="noise" mode="multiply" />
      </filter>
    </svg>
  );
}

/** Coarser fractal noise, overlay-blended — used by the giant watermark
 * headline behind the roadmap section. Referenced by `filter:
 * url(#c3-noise)` in index.css's .c3-watermark-main. */
export function WatermarkNoiseFilter() {
  return (
    <svg className="absolute -z-10 h-0 w-0" aria-hidden="true">
      <filter id="c3-noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" stitchTiles="stitch" />
        <feComponentTransfer>
          <feFuncA type="linear" slope="0.075" />
        </feComponentTransfer>
        <feComposite in2="SourceGraphic" operator="in" result="noise" />
        <feBlend in="SourceGraphic" in2="noise" mode="overlay" />
      </filter>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Guide rails                                                         */
/* ------------------------------------------------------------------ */

/** Two hairline verticals marking the 36rem container edges. Reads as
 * a drafting/blueprint grid and quietly reinforces the layout's spine. */
export function GuideRails() {
  return (
    <>
      <div className="hidden md:block pointer-events-none fixed inset-y-0 left-1/2 -translate-x-[calc(50%+36rem)] w-px bg-white/10 z-[5]" aria-hidden="true" />
      <div className="hidden md:block pointer-events-none fixed inset-y-0 left-1/2 translate-x-[calc(-50%+36rem)] w-px bg-white/10 z-[5]" aria-hidden="true" />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Brand mark                                                          */
/* ------------------------------------------------------------------ */

/** NeuralGuard's mark — four interlocking quadrant curves reading as a
 * closed protective loop. Matches public/favicon.svg's geometry family. */
export function LogoMark({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 256 256" className={className} fill="currentColor" aria-hidden="true">
      <path d="M 0 128 C 70.692 128 128 185.308 128 256 L 64 256 C 64 220.654 35.346 192 0 192 Z M 256 192 C 220.654 192 192 220.654 192 256 L 128 256 C 128 185.308 185.308 128 256 128 Z M 128 0 C 128 70.692 70.692 128 0 128 L 0 64 C 35.346 64 64 35.346 64 0 Z M 192 0 C 192 35.346 220.654 64 256 64 L 256 128 C 185.308 128 128 70.692 128 0 Z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Shiny gradient headline                                             */
/* ------------------------------------------------------------------ */

export function Shiny({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`animate-shiny ${className}`} style={shinyStyle}>
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

interface GlassButtonProps {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: "solid" | "outline";
  full?: boolean;
}

/** The reference design's pill CTA, with the nested "button-in-button"
 * trailing chevron that translates on group hover. */
export function PillButton({ children, href, onClick, variant = "solid", full = false }: GlassButtonProps) {
  const base =
    "group inline-flex items-center justify-center gap-2 rounded-full font-medium text-sm px-5 py-3 transition-all duration-200 active:scale-[0.98]";
  const skin =
    variant === "solid"
      ? "bg-white text-black hover:bg-white/90"
      : "border border-white/15 text-white hover:bg-white/5";
  const width = full ? "w-full" : "";
  const cls = `${base} ${skin} ${width}`;

  const inner = (
    <>
      {children}
      <span
        className={`grid place-items-center h-6 w-6 rounded-full transition-transform duration-200 group-hover:translate-x-[1px] ${
          variant === "solid" ? "bg-black/10" : "bg-white/10"
        }`}
        aria-hidden="true"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </span>
    </>
  );

  if (href) {
    return (
      <a href={href} className={cls}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Section eyebrow                                                     */
/* ------------------------------------------------------------------ */

export function SectionEyebrow({ label, tag }: { label: string; tag?: string }) {
  return (
    <div className="inline-flex items-center gap-2.5 text-xs">
      <span className="w-1.5 h-1.5 rounded-full bg-white" aria-hidden="true" />
      <span className="text-white font-medium tracking-wide">{label}</span>
      {tag && <span className="px-2 py-0.5 rounded-full border border-white/10 text-white/50">{tag}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Window chrome                                                       */
/* ------------------------------------------------------------------ */

/** macOS-style traffic lights + title, used to frame app previews. */
export function WindowChrome({ title }: { title: string }) {
  return (
    <div className="relative flex items-center px-4 py-3 border-b border-white/10">
      <div className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-full" style={{ background: "#ff5f57" }} />
        <span className="w-3 h-3 rounded-full" style={{ background: "#febc2e" }} />
        <span className="w-3 h-3 rounded-full" style={{ background: "#28c840" }} />
      </div>
      <span className="absolute left-1/2 -translate-x-1/2 text-xs text-white/50">{title}</span>
    </div>
  );
}

/** Full-bleed menu-bar strip. Menu labels are the product's real agent
 * and view names rather than generic File/Edit/View, so the strip
 * carries information instead of only decoration. */
export function MenuBarStrip({ items, right }: { items: string[]; right?: ReactNode }) {
  return (
    <div className="w-full h-10 bg-black/40 backdrop-blur-md border-t border-b border-white/10">
      <div className="max-w-6xl mx-auto px-6 h-full flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          <LogoMark className="w-3.5 h-3.5 text-white" />
          <span className="font-bold text-white">NeuralGuard</span>
          {items.map((item, i) => (
            <span
              key={item}
              className={`text-white/60 ${i > 2 ? "hidden sm:inline" : ""} ${i > 3 ? "hidden md:inline" : ""}`}
            >
              {item}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 text-white/50">{right}</div>
      </div>
    </div>
  );
}

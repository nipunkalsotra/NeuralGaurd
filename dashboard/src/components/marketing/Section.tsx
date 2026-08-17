// src/components/marketing/Section.tsx
import type { ReactNode } from "react";

interface SectionProps {
  id?: string;
  eyebrow?: ReactNode;
  title?: ReactNode;
  lede?: ReactNode;
  align?: "left" | "center";
  className?: string;
  children?: ReactNode;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span
      data-reveal
      className="inline-flex items-center rounded-full border border-border px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary"
    >
      {children}
    </span>
  );
}

export default function Section({ id, eyebrow, title, lede, align = "left", className = "", children }: SectionProps) {
  return (
    <section id={id} className={`mx-auto max-w-6xl px-6 py-24 sm:py-32 ${className}`}>
      {(eyebrow || title || lede) && (
        <div className={`mb-14 ${align === "center" ? "text-center mx-auto max-w-2xl" : "max-w-2xl"}`}>
          {eyebrow && <div className="mb-4">{eyebrow}</div>}
          {title && (
            <h2 data-reveal className="text-3xl sm:text-4xl font-semibold tracking-tight text-text-primary text-balance">
              {title}
            </h2>
          )}
          {lede && (
            <p data-reveal className="mt-4 text-base text-text-secondary leading-relaxed">
              {lede}
            </p>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

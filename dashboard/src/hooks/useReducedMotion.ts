// src/hooks/useReducedMotion.ts
// Single source of truth for prefers-reduced-motion, mirrored onto
// <html data-reduce-motion> so plain CSS (see index.css's .motion-safe-only
// utility) and JS-driven GSAP/Framer code all key off the same flag
// instead of each maintaining its own matchMedia listener.
import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function getInitial(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(QUERY).matches;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(getInitial);

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(reduced);
  }, [reduced]);

  return reduced;
}

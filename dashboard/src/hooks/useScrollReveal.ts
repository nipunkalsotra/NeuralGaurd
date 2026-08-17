// src/hooks/useScrollReveal.ts
// Shared scroll-entrance choreography for marketing pages: a heavy,
// deliberate fade-up as each element crosses into view, gated behind
// prefers-reduced-motion (which renders every element in its resolved
// end-state immediately, no animation at all — not just "faster").
import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function useScrollReveal<T extends HTMLElement>(selector = "[data-reveal]") {
  const scope = useRef<T>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const targets = gsap.utils.toArray<HTMLElement>(selector, scope.current);
        targets.forEach((el, i) => {
          gsap.fromTo(
            el,
            { y: 28, opacity: 0 },
            {
              y: 0,
              opacity: 1,
              duration: 0.9,
              ease: "expo.out",
              delay: (i % 4) * 0.05,
              scrollTrigger: { trigger: el, start: "top 88%", toggleActions: "play none none reverse" },
            }
          );
        });
      });
      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set(gsap.utils.toArray(selector, scope.current), { y: 0, opacity: 1 });
      });
      return () => mm.revert();
    },
    { scope }
  );

  return scope;
}

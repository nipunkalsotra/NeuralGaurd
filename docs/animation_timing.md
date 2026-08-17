# Animation Timing Reference

Updated for the v1.1 frontend rebuild. Durations below are the ones
actually in `dashboard/src/design/tokens.ts` and the components that
consume them — not aspirational.

| Animation | Duration | Notes |
|---|---|---|
| Agent orb pulse — HEALTHY/RESUMED | 2.4s | calm, continuous |
| Agent orb pulse — LOOP_SUSPECTED/DIAGNOSING/REMEDIATING/VERIFYING | 1.1s | active states |
| Agent orb pulse — ESCALATED | 0.55s | urgent |
| Modal open (Triage report, Post-Heal report, Circuit Breaker detail) | 0.3s | scale 0.94→1.0, opacity 0→1, `ease-premium` |
| Modal close | 0.3s | reverse — now genuinely plays (see below) |
| Audit log auto-scroll | smooth (browser-native) | scrolls to bottom on new entry, only while already near-bottom |
| Fault injection toast | 0.25s in/out, ~2.6s hold | |
| Report card counters | 1.4s | spring, stiffness 100 / damping 15 |
| Report card confetti | ~1.8s | canvas-based, skipped entirely under `prefers-reduced-motion` |
| Circuit breaker card entrance | staggered 0.05s per card | fade+slide up |
| Marketing page scroll reveal | 0.9s, `expo.out` | GSAP ScrollTrigger, per-element, `[data-reveal]` |

## What changed from the original spec

- **Modal exit animations now actually play.** The original
  `TriageReportCard`/`PostHealReportCard` returned `null` before their
  own `AnimatePresence` wrapper, so the wrapper unmounted synchronously
  the instant the modal closed — the exit animation never had a chance
  to run. `TriageModal`/`ReportCardModal` are now always mounted by
  their parent; only the *child* inside `AnimatePresence` is conditional.
- **Throughput counter — now built.** `components/panels/ThroughputMeter.tsx`,
  a persistent header widget, not just a value inside the final report card.
- **Confetti — now built.** Canvas-based burst on `ReportCardModal`,
  gated behind `prefers-reduced-motion`.
- **A real reduced-motion contract exists project-wide.**
  `useReducedMotion()` stamps `<html data-reduce-motion>`; GSAP scenes
  use `gsap.matchMedia()` to render their final state instantly instead
  of animating; canvas-based visuals (`HeroMesh`, the report card
  confetti) skip their `requestAnimationFrame` loop entirely under
  reduced motion.
- **Modals are keyboard-accessible.** `useFocusTrap` traps Tab/Shift+Tab
  inside an open modal and restores focus to the triggering element on
  close — previously missing entirely.
- **The Workflow DAG's scripted "demo walk" is gone.** There is no
  synthetic setTimeout sequence left to fake — `AgentGraph` renders
  whatever the active `DataSource` (live backend or the in-browser
  simulator) actually reports, always.

## Known remaining gaps (honest status)

- No traveling-dot edge animation on the Agent Graph — active edges use
  color/width change only.
- No full automated WCAG audit has been run (axe-core or equivalent);
  the fixes above are the concrete, verified items, not a certified pass.

# Animation Timing Reference

Locked Day 8. Nipun: use these for demo script beat timing.

| Animation | Duration | Notes |
|---|---|---|
| Agent orb pulse — HEALTHY/RESUMED | 2.0s | calm, continuous |
| Agent orb pulse — LOOP_SUSPECTED/DIAGNOSING/REMEDIATING/VERIFYING | 1.0s | active states |
| Agent orb pulse — ESCALATED | 0.5s | urgent |
| Modal open (Triage Report Card, Circuit Breaker detail) | 0.3s | scale 0.9→1.0, opacity 0→1, easeOut |
| Modal close | 0.2s | reverse |
| Audit log auto-scroll | 0.3s | smooth scroll to bottom |
| Toast notification (Break It) | 0.3s in / 3s hold / 0.3s out | |
| Report card counters | 1.5s | 0 to final value, spring bounce 0.25 |
| Circuit breaker card entrance | staggered 0.05s per card | fade+slide up |

## Known gaps (not yet implemented, honest status)
- Workflow DAG "traveling dot" edge animation — NOT built. Current edges
  use color/width change only (active=amber, inactive=slate), no dot
  traveling along the path.
- Throughput counter with useSpring — no throughput counter UI exists yet.
- Confetti on report card — not implemented.
- Fallback banner slide — folded into SandboxTerminal's mockActive
  banner instead of a separate sliding component; appears/disappears
  via conditional render, not an animated slide.
- Full WCAG accessibility pass — not done, deferred.

Documented honestly rather than claimed complete, so Nipun's demo
script doesn't assume beats that don't exist yet. UI enhancement pass
(remaining gaps above) deferred to later.

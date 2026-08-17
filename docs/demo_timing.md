# Demo Timing — Single Source of Truth

**Owner:** Shreshtha (Day 13, per his guide's explicit Step 5: "Document the
final timing in `docs/demo_timing.md`. This is the single source of
truth for Demo Day.") | **Narrative beats:** `docs/demo_script.md` (Nipun)

Every value below is checked against the actual implemented animation,
not copied from the guide unverified — where a value didn't match or
didn't exist, it's called out explicitly rather than silently assumed.

| Act | Window | Animation | Spec | Actual (verified in code) |
|---|---|---|---|---|
| 1 — The Calm | 0:00–0:10 | Orb pulse cycle | 2s | ✅ `AgentOrb.tsx` `PULSE_DURATION.HEALTHY = 2` |
| 2 — The Setup | 0:10–0:15 | Button press | scale 0.95, 0.1s | ✅ Fixed today — was `transition-all` (default 150ms); added `duration-100` |
| 2 — The Setup | 0:10–0:15 | Toast slide-in | 0.3s | ✅ Fixed today — toast had **no animation at all** (plain conditional render); now `motion.div` with `y:-20→0`, `duration: 0.3` |
| 3 — The Failure | 0:15–0:25 | Orb color transition | 0.4s, amber→red | ✅ `AgentOrb.tsx` state-keyed `motion.div`, `PULSE_DURATION.LOOP_SUSPECTED = 1` (pulse rate; color itself transitions via React re-render on state change, not a separate timed tween) |
| 3 — The Failure | 0:15–0:25 | Similarity graph spike | 0.5s | ⚠️ Not verified — `SimilarityGraph.tsx` is lazy-loaded (Day 11) and wasn't re-audited today; out of today's scope |
| 3 — The Failure | 0:15–0:25 | Throughput counter drop | spring, 1s | ❌ **Gap found while writing this doc, not fixed today.** No standalone live throughput counter exists anywhere in the dashboard outside `PostHealReportCard` (only shown at the very end). The narration ("throughput drops to 71%") has nothing to visually point at during Acts 1/3/5 live. See note below. |
| 4 — The Diagnosis | 0:25–0:40 | Modal scale | 0.3s | ✅ `TriageReportCard.tsx`: `transition={{ duration: 0.3, ease: "easeOut" }}` |
| 4 — The Diagnosis | 0:25–0:40 | Confidence bar fill | 0.8s | ✅ `TriageReportCard.tsx`: `transition={{ type: "spring", duration: 0.8, bounce: 0.25 }}` |
| 5 — The Healing | 0:40–0:55 | Terminal typewriter | 10ms/char | ⚠️ Not verified — `SandboxTerminal.tsx` streams real backend stdout/stderr line-by-line (per the locked WS schema); wasn't re-audited today |
| 5 — The Healing | 0:40–0:55 | State transitions | 0.4s each | ✅ Same `AgentOrb.tsx` mechanism as Act 3 |
| 5 — The Healing | 0:40–0:55 | Throughput counter rise | spring, 1.5s | ❌ Same gap as Act 3 — no live counter to animate |
| 6 — The Payoff | 0:55–1:10 | Modal entrance | 0.3s | ✅ `PostHealReportCard.tsx`: `transition={{ duration: 0.3, ease: "easeOut" }}` |
| 6 — The Payoff | 0:55–1:10 | Confetti burst | 2s | ✅ `PostHealReportCard.tsx`: `CONFETTI_DURATION_MS = 2000` |
| 6 — The Payoff | 0:55–1:10 | Counter stagger | 1.5s each, 0.1s delay | ✅ `PostHealReportCard.tsx`: `COUNTER_DURATION = 1.5`, `COUNTER_STAGGER = 0.1`, spring `{stiffness: 100, damping: 15}` |

## The one real gap: no live throughput counter

Acts 1, 3, and 5 of the demo script all narrate a persistent throughput
percentage (100% → 71% → 97%) as if it's a standalone, always-visible
dashboard element. It isn't — the only place `throughput_maintained`
actually renders is inside `PostHealReportCard`, which only appears at
the very end (Act 6). Building that live counter is real, new UI work
(a persistent number + spring-physics drop/rise animation, polling or
WS-driven), not "final polish" or "timing documentation" — it's outside
what any of the four Day 1-13 guides explicitly assigned as a build
task on any specific day, so it wasn't built today without being asked.

**If this needs to exist for the demo:** the data is already real and
available — `GET /api/metrics` returns `throughput_maintained` right
now (Day 12), and `Orchestrator.reroute_plans` updates it live on every
`OPTIMIZATION_COMPLETE` event. A small persistent counter component
polling that endpoint (or reading the existing `audit_event` stream's
`fallback_origin` on the Optimization Agent's self-loop record, per
Day 12's `on_optimization_complete` fix) would be a short, well-scoped
follow-up — flagging it now rather than deciding unilaterally whether
it's in scope.

## Rehearsal note

Everything marked ✅ above is real, implemented, and verified against
the actual source today — but "locked" per the guide's own definition
means rehearsed live with Nipun narrating and the timing adjusted to his
actual speech pace, not just correct in isolation. That rehearsal is
Day 13/14's explicit team exercise and can't happen from here — see
`docs/demo_script.md`'s manual-step note.

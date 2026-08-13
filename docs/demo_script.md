# Demo Script — AI Factory Sentinel

**Owner:** Nipun (Day 12) | **Locked timing shared with:** Tushar (animation sync)

60-90 second narrative, six acts. Every visual beat below is a real,
already-implemented dashboard element (button text, toast copy, and
modal titles are quoted verbatim from the actual code, not paraphrased)
— nothing in this script requires building anything new.

---

## Act 1 — The Calm (0:00–0:10)

**Narrator:** "This is AI Factory Sentinel — an autonomous healing layer."

**Visual:** All 5 agent orbs (Sentinel, Triage, Remediation, Optimization,
Orchestrator) glow green (HEALTHY), gentle 2s pulse cycle. Circuit
Breaker Panel shows all 5 services green except cuOpt (permanently
"Unused" — a documented project decision, not a live indicator).

**Cue:** Nothing to trigger — this is the resting state on page load.

---

## Act 2 — The Setup (0:10–0:15)

**Narrator:** "Watch what happens when a vendor changes their invoice format."

**Action:** Presenter clicks **BREAK IT**.

**Visual:** Toast slides in from top: *"Injecting schema change... Tax_ID
removed."* Button shows a brief press animation and disables for 5s.

**Cue:** `POST /demo/inject` fires with `fault_type: "schema_corruption"`,
`target: "worker-3"`.

---

## Act 3 — The Failure (0:15–0:25)

**Narrator:** "Worker-3 encounters the new format. Same error, every retry."

**Visual:** Sentinel node's ring/orb reacts first (LOOP_SUSPECTED,
amber). If NIM is unreachable in the live demo environment, the Sentinel
node also shows the blue sentence-transformers fallback ring — this is
real fallback behavior, not scripted; say so live if it happens rather
than treating it as a glitch.

**Backend:** `SentinelAgent.detect_loop()` fires for real; `similarity`
crosses 0.92 across 3 consecutive steps; `LOOP_SUSPECTED` published.

---

## Act 4 — The Diagnosis (0:25–0:40)

**Narrator:** "Sentinel detected the loop in under a second. Triage Agent
diagnoses the root cause."

**Visual:** Triage Report Card modal opens automatically on real data
(not the manual "Show Mock Triage Card" button) — shows `root_cause`,
`fix_type` badge, `affected_field`, and the confidence bar. If Nemotron
is rate-limited or down, the confidence bar still renders and the
"Fallback Active" badge appears, correctly labeled Groq or rule-based
per `fallback_origin`.

**Backend:** `TriageAgent.diagnose()`; `DIAGNOSIS_COMPLETE` published;
Orchestrator transitions `LOOP_SUSPECTED → DIAGNOSING → REMEDIATING`
(or `→ ESCALATED` if confidence < 0.7 — say so live if it happens, it's
correct behavior, not a bug: the system deliberately hands off to a
human rather than guess).

---

## Act 5 — The Healing (0:40–0:55)

**Narrator:** "Remediation Agent generates a patch. The sandbox verifies
it safely."

**Visual:** Sandbox Terminal streams live NemoClaw CLI output line by
line. If the wrapper falls back to mock (no real `nemoclaw` binary on
this machine), the `[MOCK MODE]` banner appears and the Remediation
node shows the gray ring + MOCK badge — again, real behavior, not staged.

**Backend:** `RemediationAgent.remediate()` → wrapper `/v1/remediate` →
`VERIFYING → RESUMED` on `verified: true`.

---

## Act 6 — The Payoff (0:55–1:10)

**Narrator:** "The factory healed itself. No human intervention."

**Action:** Post-Heal Report Card opens (confetti burst, 2s). Six
metrics animate 0 → final value over 1.5s, staggered 0.1s apart:

| Metric | Label |
|---|---|
| `time_to_detect` | Time to Detect |
| `tokens_saved` | Tokens Saved |
| `throughput_maintained` | Throughput |
| `fixes_applied` | Fixes Applied |
| `escalations` | Escalations |
| `fallbacks_triggered` | Fallbacks |

**Status (Day 12):** Card renders with placeholder values per Tushar's
guide — backend wiring to the real `GET /api/metrics` endpoint (built
Day 12 by Shreshtha, see `docs/api_contracts.md`'s Day 12 section) is
explicitly Day 13 scope. Until wired, narrate the placeholder numbers as
illustrative; after Day 13, they'll be the real numbers from that exact
run.

---

## Timing notes for Tushar (animation sync)

- Act boundaries above are targets, not hard cuts — real backend timing
  (actual LLM/wrapper latency) will vary run to run. Rehearse against
  whatever the live backend actually does that day, don't force the
  visuals to match the clock if the backend is faster or slower.
- Every visual named above is driven by real WebSocket events already
  wired end-to-end (`state_change` and `audit_event`) — none of this
  needs a scripted/timed animation sequence separate from the real data.
  `WorkflowDAG.tsx`'s manual "Trigger Full Heal Sequence" button remains
  the offline fallback if the live backend is unreachable during
  rehearsal.

## Manual step

**Rehearse this out loud at least once before demo day.** This is the
one part of Day 12 that can't be done from here — reading the timing
back to yourself (or to a teammate) is how you catch a beat that reads
awkwardly or a narration line that runs long against what the dashboard
is actually doing at that moment.

# Demo Day Backup Plans — Day 13

**Owner:** Nipun

Three fallback tiers, each one degrading gracefully rather than the demo
just failing outright. Plan B specifically exists because the system is
*designed* to degrade this way — it's not a workaround, it's the actual
resilience story the demo is telling.

---

## Plan A — Primary: Full live demo

**Trigger:** Normal operation, nothing goes wrong.

**Action:** Full stack running live on Shreshtha's machine (backend +
wrapper), dashboard connected over LAN from whoever's presenting. Nipun
narrates live against `docs/demo_script.md`'s six acts.

**Success criteria:** Demo completes in 60-90s, all transitions smooth,
Post-Heal Report Card shows real (not placeholder) metrics from
`GET /api/metrics`.

---

## Plan B — Auto-fallback activation

**Trigger:** NemoClaw crashes mid-demo (OOM, timeout, real CLI error) —
or, in this environment specifically, NemoClaw was never available in
the first place (no real `nemoclaw` binary), so the wrapper is already
running in mock mode by default. Either way, the trigger condition is
"the primary remediation path didn't work."

**Action:** Nothing manual — this is automatic. `wrapper_service.py`
catches the failure and falls back to `mock_remediate()`
(`wrapper/mock/mock_wrapper.py`), verified end-to-end today: 40
concurrent real timeouts against the real wrapper all correctly
produced `mode: "timeout", flagged: True` with zero crashes (see
`docs/stress_test_results.md`).

**Visual:** Sandbox Terminal shows the `[MOCK MODE]` banner; the
Remediation node gets the gray ring + MOCK badge (Day 12's fallback
indicators); `TriageReportCard`/`AuditLogStream` show the
`fallback_used`/`fallback_origin` fields populated.

**Narrator script:** *"Even if the sandbox fails, our system degrades
gracefully — the wrapper auto-switches to a safe simulated execution
mode in under 5 seconds, and the demo continues without a pause."*

**Success criteria:** Demo continues without pause. This is graceful
degradation, not a failure — say so explicitly if it happens live,
rather than treating it as something to apologize for.

---

## Plan C — Mock-mode video (last resort)

**Trigger:** Entire backend fails, or a network/LAN issue breaks the
dashboard's connection to the backend entirely.

**Action:** Play a pre-recorded ~30s video of the mock-mode demo
instead of running live.

**Status:** Not yet recorded. Per the guide, this is explicitly
Shreshtha's Day-14 deliverable ("Shreshtha records this on Day 14") —
correctly out of scope for Day 13. Recording a screen capture is
inherently a manual, visual task (see the note at the bottom of this
doc) — noting the dependency here rather than treating it as a Day-13
gap.

**Narrator script:** *"Here's a recording of the same demo running in
simulation mode."*

**Success criteria:** Audience sees the full self-healing loop
(healthy → break → detect → diagnose → heal → recover), even if not
live.

---

## Manual step

None of these three plans can be *tested* end-to-end from here in the
way that matters most: actually pulling the plug on something live
during a rehearsal and watching the team react in real time. That's
Day 14's "Full Dress Rehearsal + Backup Plan Test" (per Tushar's and
Rashi's guides) — Plan B's automatic behavior is already proven
correct at the code level (today's stress test), but confirming the
*team* knows what to say and do when it happens is a rehearsal
exercise, not something to check off here.

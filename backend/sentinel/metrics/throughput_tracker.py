# backend/sentinel/metrics/throughput_tracker.py
"""
Throughput Tracker — Day 12 (Shreshtha), revised.

The guide's target checkpoints (baseline 100%, during-loop ~40-50%,
healing ~71%, post-heal 97%) describe the demo's illustrative narrative
beats, not a formula this codebase has an independent way to verify —
there is no real item-processing pipeline to measure "items processed
per minute" against, and inventing one just to hit those exact numbers
would be fabricated data, not a real metric. That principle still holds
below — nothing here is invented; this only fixes a staleness bug.

What IS real: OptimizationAgent already computes `projected_throughput_pct`
via OR-Tools/greedy round-robin every time a worker loops (see
optimization_agent.py, consumed by Orchestrator.reroute_plans since the
Day 10 fix). That's the one throughput number the system actually
produces from real solver output.

What was wrong: this only ever looked at the MOST RECENT reroute plan
ever produced, full stop — with no check for whether that worker had
since resolved. So once any fault fired even once, this stayed pinned
at whatever the solver returned (typically 97%) forever, even minutes
after the worker had long since RESUMED to full health. Confirmed live:
injecting one fault and then leaving the system idle still reported 97%
indefinitely.

Fixed to walk back from the most recent plan and skip any worker that
has since reached a settled state (RESUMED — healed; or HEALTHY — reset)
per Orchestrator.worker_states, which is the orchestrator's own live FSM
state, not a second source of truth. A worker this tracker has never
seen an explicit transition for (worker_states has no entry at all —
this deliberately covers unit tests that publish OPTIMIZATION_COMPLETE
in isolation, without exercising the full transition cascade) is treated
as "still open" rather than silently discarded, so an isolated reroute
plan still reports honestly. Once every known worker with a plan has
genuinely settled, this returns to the 100% baseline — that's what
makes the number actually move instead of only ever climbing once.
"""

from typing import Optional

from sentinel.agents.orchestrator import WorkerState

# RESUMED is a fully healed terminal state; ESCALATED is a terminal
# state too, but the worker is still broken and waiting on a human — it
# does not count as "back to full capacity" the way RESUMED does.
_SETTLED_STATES = {WorkerState.HEALTHY, WorkerState.RESUMED}


class ThroughputTracker:
    BASELINE_PCT = 100.0

    def __init__(self, orchestrator=None):
        self.orchestrator = orchestrator

    def current_pct(self) -> float:
        if self.orchestrator is None:
            return self.BASELINE_PCT
        plan = self._latest_open_reroute_plan()
        if plan is None:
            return self.BASELINE_PCT
        pct = plan.get("projected_throughput_pct")
        return float(pct) if pct is not None else self.BASELINE_PCT

    def _latest_open_reroute_plan(self) -> Optional[dict]:
        plans = getattr(self.orchestrator, "reroute_plans", None)
        if not plans:
            return None
        states = getattr(self.orchestrator, "worker_states", {}) or {}
        for worker_id, plan in reversed(list(plans.items())):
            # No explicit entry at all -> this worker's FSM transitions
            # were never exercised (e.g. an isolated unit test) -> treat
            # the plan as still open rather than discard it. An explicit
            # entry that has reached a settled state -> genuinely
            # resolved -> skip it and keep looking further back.
            if worker_id in states and states[worker_id] in _SETTLED_STATES:
                continue
            return plan
        return None

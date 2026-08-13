# backend/sentinel/metrics/throughput_tracker.py
"""
Throughput Tracker — Day 12 (Shreshtha).

The guide's target checkpoints (baseline 100%, during-loop ~40-50%,
healing ~71%, post-heal 97%) describe the demo's illustrative narrative
beats, not a formula this codebase has an independent way to verify —
there is no real item-processing pipeline to measure "items processed
per minute" against, and inventing one just to hit those exact numbers
would be fabricated data, not a real metric.

What IS real: OptimizationAgent already computes `projected_throughput_pct`
via OR-Tools/greedy round-robin every time a worker loops (see
optimization_agent.py, consumed by Orchestrator.reroute_plans since the
Day 10 fix). That's the one throughput number the system actually
produces from real solver output. This tracker is a thin, honest wrapper
around it: no active incident -> 100% (baseline, nothing degraded);
otherwise -> the most recent real reroute plan's projected throughput.
"""

from typing import Optional


class ThroughputTracker:
    BASELINE_PCT = 100.0

    def __init__(self, orchestrator=None):
        self.orchestrator = orchestrator

    def current_pct(self) -> float:
        if self.orchestrator is None:
            return self.BASELINE_PCT
        latest = self._latest_reroute_plan()
        if latest is None:
            return self.BASELINE_PCT
        pct = latest.get("projected_throughput_pct")
        return float(pct) if pct is not None else self.BASELINE_PCT

    def _latest_reroute_plan(self) -> Optional[dict]:
        plans = getattr(self.orchestrator, "reroute_plans", None)
        if not plans:
            return None
        # Dicts preserve insertion order — last inserted is the most
        # recently received OPTIMIZATION_COMPLETE plan.
        return next(reversed(list(plans.values())), None)

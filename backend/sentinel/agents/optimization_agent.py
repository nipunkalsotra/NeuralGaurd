"""
Optimization Agent — Workload Rerouting
Day 3 scaffold: subscribes to LOOP_SUSPECTED (parallel with Triage),
formulates ILP structure. Real cuOpt API call + OR-Tools fallback land
Day 4-6 — today is structure only.
"""

import logging
from typing import Dict, List

logger = logging.getLogger("sentinel.optimization_agent")


class OptimizationAgent:
    def __init__(self, event_bus=None):
        self.event_bus = event_bus
        if self.event_bus is not None:
            self.event_bus.subscribe("LOOP_SUSPECTED", self.on_loop_suspected)

    def formulate_problem(
        self,
        excluded_worker_id: str,
        pending_items: List[dict],
        available_workers: List[dict],
    ) -> dict:
        """
        Builds the ILP structure per master doc Section 4.4:
        min Σ wᵢ·dᵢⱼ·xᵢⱼ subject to:
          - every item assigned to exactly one available worker
          - worker capacity not exceeded
          - excluded_worker_id not in assignable set (currently REMEDIATING)
          - x_ij ∈ {0,1}
        """
        return {
            "objective": "minimize_total_weighted_delay",
            "decision_variables": "x_ij ∈ {0,1}",
            "constraints": [
                "every_item_assigned_to_exactly_one_worker",
                "worker_capacity_not_exceeded",
                f"worker_{excluded_worker_id}_excluded (remediating)",
                "x_ij ∈ {0,1} (binary)",
            ],
            "data": {
                "items": pending_items,
                "workers": [w for w in available_workers if w["id"] != excluded_worker_id],
                "excluded": [excluded_worker_id],
            },
        }

    def solve(self, problem: dict) -> dict:
        """
        Fallback chain: cuOpt (primary) -> OR-Tools -> greedy round-robin.
        Day 3: not yet implemented — returns a stub ReroutePlan so the
        Orchestrator has something to consume during integration testing.
        Real solver logic lands Day 4-6.
        """
        logger.info("OptimizationAgent.solve() called — stub implementation (Day 3)")
        # TODO (Day 4-6): call cuOpt API, fall back to OR-Tools, then greedy round-robin
        return {
            "assignments": [],
            "excluded_workers": problem["data"]["excluded"],
            "projected_throughput_pct": 97.0,  # placeholder target value
        }

    async def on_loop_suspected(self, event: dict) -> None:
        """Subscribes to LOOP_SUSPECTED in parallel with Triage Agent."""
        worker_id = event["worker_id"]
        logger.info("OptimizationAgent dispatched for worker %s (stub)", worker_id)

        # TODO (Day 4-6): pull real pending_items/available_workers from
        # queue state once that exists. Stub data for now.
        problem = self.formulate_problem(
            excluded_worker_id=worker_id,
            pending_items=[],
            available_workers=[],
        )
        reroute_plan = self.solve(problem)

        if self.event_bus is not None:
            await self.event_bus.publish(
                "OPTIMIZATION_COMPLETE",
                {"worker_id": worker_id, **reroute_plan},
            )

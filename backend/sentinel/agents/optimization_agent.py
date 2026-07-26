# backend/sentinel/agents/optimization_agent.py
"""
Optimization Agent — Workload Rerouting
Day 3: scaffold (ILP structure, stub solve()).
Day 4-5: Real solver — OR-Tools primary, greedy round-robin fallback.
Day 6: Circuit breaker added around OR-Tools calls.
cuOpt is SKIPPED (API access unresolved — see docs/api_contracts.md note).
Practical fallback chain for this project: OR-Tools -> greedy round-robin.
"""

import logging
from typing import Dict, List

from ortools.linear_solver import pywraplp

from sentinel.fallback.circuit_breaker import CircuitBreaker

logger = logging.getLogger("sentinel.optimization_agent")


class OptimizationAgent:
    def __init__(self, event_bus=None):
        self.event_bus = event_bus
        self.circuit_breaker = CircuitBreaker(failures=3, timeout=60)
        if self.event_bus is not None:
            self.event_bus.subscribe("LOOP_SUSPECTED", self.on_loop_suspected)

    def formulate_problem(
        self,
        excluded_worker_id: str,
        pending_items: List[dict],
        available_workers: List[dict],
    ) -> dict:
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

    def solve_with_or_tools(self, problem: dict) -> dict:
        """
        Solves the same ILP formulation locally using Google OR-Tools.
        min Σ wᵢ·dᵢⱼ·xᵢⱼ subject to each item assigned exactly once and
        worker capacity not exceeded.
        """
        items = problem["data"]["items"]
        workers = problem["data"]["workers"]

        if not items or not workers:
            return {
                "assignments": [],
                "excluded_workers": problem["data"]["excluded"],
                "projected_throughput_pct": 97.0,
                "solver_used": "or-tools",
            }

        solver = pywraplp.Solver.CreateSolver("CBC")
        if solver is None:
            raise RuntimeError("OR-Tools CBC solver unavailable")

        x = {}
        for i, item in enumerate(items):
            for j, worker in enumerate(workers):
                x[i, j] = solver.BoolVar(f"x_{i}_{j}")

        for i in range(len(items)):
            solver.Add(sum(x[i, j] for j in range(len(workers))) == 1)

        for j, worker in enumerate(workers):
            capacity = worker.get("capacity", len(items))
            solver.Add(sum(x[i, j] for i in range(len(items))) <= capacity)

        objective = solver.Objective()
        for i, item in enumerate(items):
            weight = item.get("weight", 1.0)
            for j, worker in enumerate(workers):
                distance = item.get("distances", {}).get(worker["id"], 1.0)
                objective.SetCoefficient(x[i, j], weight * distance)
        objective.SetMinimization()

        status = solver.Solve()

        if status != pywraplp.Solver.OPTIMAL:
            logger.warning("OR-Tools did not find optimal solution, status=%s", status)
            raise RuntimeError(f"OR-Tools solve failed, status={status}")

        assignments = []
        for i, item in enumerate(items):
            for j, worker in enumerate(workers):
                if x[i, j].solution_value() > 0.5:
                    assignments.append({"item_id": item["id"], "worker_id": worker["id"]})

        return {
            "assignments": assignments,
            "excluded_workers": problem["data"]["excluded"],
            "projected_throughput_pct": 97.0,
            "solver_used": "or-tools",
        }

    def solve_with_greedy_round_robin(self, problem: dict) -> dict:
        """
        Last-resort fallback: zero computation, immediate assignment.
        Not optimal but always works. Throughput may drop to ~85%.
        """
        items = problem["data"]["items"]
        workers = problem["data"]["workers"]

        if not workers:
            return {
                "assignments": [],
                "excluded_workers": problem["data"]["excluded"],
                "projected_throughput_pct": 0.0,
                "solver_used": "greedy_round_robin",
            }

        assignments = []
        for i, item in enumerate(items):
            worker = workers[i % len(workers)]
            assignments.append({"item_id": item["id"], "worker_id": worker["id"]})

        return {
            "assignments": assignments,
            "excluded_workers": problem["data"]["excluded"],
            "projected_throughput_pct": 85.0,
            "solver_used": "greedy_round_robin",
        }

    def solve(self, problem: dict) -> dict:
        """
        Fallback chain (cuOpt SKIPPED — API access unresolved):
        OR-Tools (practical primary, circuit-breaker protected) -> greedy round-robin.
        """
        if self.circuit_breaker.is_closed():
            try:
                result = self.solve_with_or_tools(problem)
                self.circuit_breaker.record_success()
                return result
            except Exception as e:
                logger.warning("OR-Tools failed, falling back to greedy round-robin: %s", e)
                self.circuit_breaker.record_failure()
        else:
            logger.info("OR-Tools circuit breaker open — using greedy round-robin")

        return self.solve_with_greedy_round_robin(problem)

    async def on_loop_suspected(self, event: dict) -> None:
        worker_id = event["worker_id"]
        logger.info("OptimizationAgent dispatched for worker %s", worker_id)

        problem = self.formulate_problem(
            excluded_worker_id=worker_id,
            pending_items=event.get("pending_items", []),
            available_workers=event.get("available_workers", []),
        )
        reroute_plan = self.solve(problem)

        if self.event_bus is not None:
            await self.event_bus.publish(
                "OPTIMIZATION_COMPLETE",
                {"worker_id": worker_id, **reroute_plan},
            )
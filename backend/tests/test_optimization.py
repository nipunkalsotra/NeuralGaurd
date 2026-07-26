"""
Optimization Agent tests — Day 3 scaffold.
"""

import pytest

from sentinel.agents.optimization_agent import OptimizationAgent


def test_import_and_instantiate():
    agent = OptimizationAgent()
    assert agent is not None


def test_formulate_problem_excludes_remediating_worker():
    agent = OptimizationAgent()
    problem = agent.formulate_problem(
        excluded_worker_id="worker-3",
        pending_items=[{"id": "item-1"}],
        available_workers=[{"id": "worker-1"}, {"id": "worker-2"}, {"id": "worker-3"}],
    )
    assert "worker-3" not in [w["id"] for w in problem["data"]["workers"]]
    assert problem["data"]["excluded"] == ["worker-3"]


def test_solve_returns_reroute_plan_format():
    agent = OptimizationAgent()
    problem = agent.formulate_problem("worker-3", [], [])
    result = agent.solve(problem)

    assert "assignments" in result
    assert "excluded_workers" in result
    assert "projected_throughput_pct" in result
    assert result["excluded_workers"] == ["worker-3"]


@pytest.mark.asyncio
async def test_on_loop_suspected_publishes_optimization_complete():
    from sentinel.event_bus.asyncio_queue_bus import EventBus

    bus = EventBus()
    agent = OptimizationAgent(event_bus=bus)

    received = []
    async def capture(event):
        received.append(event)
    bus.subscribe("OPTIMIZATION_COMPLETE", capture)

    await bus.publish("LOOP_SUSPECTED", {"worker_id": "worker-5"})

    assert len(received) == 1
    assert received[0]["worker_id"] == "worker-5"
    assert "assignments" in received[0]

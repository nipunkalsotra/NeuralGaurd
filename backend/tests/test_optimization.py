# backend/tests/test_optimization.py
"""
Optimization Agent tests.
cuOpt SKIPPED (API access unresolved). Fallback chain tested:
OR-Tools (primary) -> greedy round-robin (last resort).
"""

import pytest

from sentinel.agents.optimization_agent import OptimizationAgent


@pytest.fixture
def agent():
    return OptimizationAgent()


def test_import_and_instantiate(agent):
    assert agent is not None


def test_formulate_problem_excludes_remediating_worker(agent):
    problem = agent.formulate_problem(
        excluded_worker_id="worker-3",
        pending_items=[{"id": "item-1"}],
        available_workers=[{"id": "worker-1"}, {"id": "worker-2"}, {"id": "worker-3"}],
    )
    assert "worker-3" not in [w["id"] for w in problem["data"]["workers"]]
    assert problem["data"]["excluded"] == ["worker-3"]


def test_or_tools_assigns_all_items(agent):
    problem = agent.formulate_problem(
        excluded_worker_id="worker-3",
        pending_items=[{"id": "item-1"}, {"id": "item-2"}, {"id": "item-3"}],
        available_workers=[{"id": "worker-1", "capacity": 5}, {"id": "worker-2", "capacity": 5}],
    )
    result = agent.solve_with_or_tools(problem)

    assert result["solver_used"] == "or-tools"
    assert len(result["assignments"]) == 3
    assigned_items = {a["item_id"] for a in result["assignments"]}
    assert assigned_items == {"item-1", "item-2", "item-3"}


def test_or_tools_respects_capacity(agent):
    """Each worker has capacity 1 — with 2 items and 2 workers, each gets exactly one."""
    problem = agent.formulate_problem(
        excluded_worker_id="worker-3",
        pending_items=[{"id": "item-1"}, {"id": "item-2"}],
        available_workers=[{"id": "worker-1", "capacity": 1}, {"id": "worker-2", "capacity": 1}],
    )
    result = agent.solve_with_or_tools(problem)

    worker_counts = {}
    for a in result["assignments"]:
        worker_counts[a["worker_id"]] = worker_counts.get(a["worker_id"], 0) + 1
    assert all(count <= 1 for count in worker_counts.values())


def test_or_tools_empty_items_returns_empty_assignments(agent):
    problem = agent.formulate_problem("worker-3", [], [{"id": "worker-1"}])
    result = agent.solve_with_or_tools(problem)
    assert result["assignments"] == []
    assert result["projected_throughput_pct"] == 97.0


def test_greedy_round_robin_assigns_all_items(agent):
    problem = agent.formulate_problem(
        excluded_worker_id="worker-3",
        pending_items=[{"id": "item-1"}, {"id": "item-2"}, {"id": "item-3"}],
        available_workers=[{"id": "worker-1"}, {"id": "worker-2"}],
    )
    result = agent.solve_with_greedy_round_robin(problem)

    assert result["solver_used"] == "greedy_round_robin"
    assert len(result["assignments"]) == 3
    assert result["projected_throughput_pct"] == 85.0


def test_greedy_round_robin_no_workers_returns_empty(agent):
    problem = agent.formulate_problem("worker-3", [{"id": "item-1"}], [])
    result = agent.solve_with_greedy_round_robin(problem)
    assert result["assignments"] == []
    assert result["projected_throughput_pct"] == 0.0


def test_solve_falls_back_to_greedy_when_or_tools_fails(agent, monkeypatch):
    """Simulate OR-Tools failure -> should fall through to greedy round-robin."""
    def broken_or_tools(problem):
        raise RuntimeError("simulated OR-Tools failure")

    monkeypatch.setattr(agent, "solve_with_or_tools", broken_or_tools)

    problem = agent.formulate_problem(
        excluded_worker_id="worker-3",
        pending_items=[{"id": "item-1"}],
        available_workers=[{"id": "worker-1"}],
    )
    result = agent.solve(problem)

    assert result["solver_used"] == "greedy_round_robin"


@pytest.mark.asyncio
async def test_on_loop_suspected_publishes_optimization_complete():
    from sentinel.event_bus.asyncio_queue_bus import EventBus

    bus = EventBus()
    agent = OptimizationAgent(event_bus=bus)

    received = []
    async def capture(event):
        received.append(event)
    bus.subscribe("OPTIMIZATION_COMPLETE", capture)

    await bus.publish("LOOP_SUSPECTED", {
        "worker_id": "worker-5",
        "pending_items": [{"id": "item-1"}],
        "available_workers": [{"id": "worker-1"}],
    })

    assert len(received) == 1
    assert "assignments" in received[0]

# backend/tests/test_optimization.py — add this

def test_circuit_breaker_opens_after_3_or_tools_failures(agent, monkeypatch):
    def broken(problem):
        raise RuntimeError("simulated failure")
    monkeypatch.setattr(agent, "solve_with_or_tools", broken)

    problem = agent.formulate_problem("worker-3", [{"id": "item-1"}], [{"id": "worker-1"}])
    for _ in range(3):
        agent.solve(problem)

    assert agent.circuit_breaker.is_closed() is False
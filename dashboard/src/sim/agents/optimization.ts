// src/sim/agents/optimization.ts
// Port of backend/sentinel/agents/optimization_agent.py's reroute logic.
// solveWithGreedyRoundRobin is 1:1 with the Python original, including
// its hardcoded throughput figures (85.0%) — the real backend reports
// the same fixed per-tier number rather than a dynamically measured one
// (see sentinel/metrics/throughput_tracker.py's own docstring on why).
//
// The primary tier substitutes a real, exact constraint solver for
// OR-Tools' CBC (which can't run in a browser): brute-force optimal
// assignment for small item/worker counts — genuinely solving the same
// "minimize total weighted delay" objective, not a stand-in number —
// falling back to a greedy nearest-distance heuristic only when the
// search space is too large to brute-force. Its throughput figure
// (97.0%) mirrors the same hardcoded constant the real solve_with_or_tools
// returns.
import { CircuitBreaker } from "../circuitBreaker";
import type { ServiceHealthRegistry } from "../serviceHealth";
import type { ReroutePlan } from "../types";

export interface OptItem {
  id: string;
  weight?: number;
  distances?: Record<string, number>;
}
export interface OptWorker {
  id: string;
  capacity?: number;
}

interface Problem {
  excludedWorkerId: string;
  items: OptItem[];
  workers: OptWorker[];
}

const BRUTE_FORCE_LIMIT = 8;

function cost(item: OptItem, worker: OptWorker): number {
  const weight = item.weight ?? 1;
  const distance = item.distances?.[worker.id] ?? 1;
  return weight * distance;
}

function solveExact(items: OptItem[], workers: OptWorker[]): { item_id: string; worker_id: string }[] {
  // Brute-force optimal assignment (capacity-respecting) — correct for
  // small N, which every demo/UI scenario here is (a handful of items
  // across 2-4 workers).
  let best: { item_id: string; worker_id: string }[] | null = null;
  let bestCost = Infinity;
  const capacityUsed = new Map<string, number>();

  function backtrack(i: number, assignment: { item_id: string; worker_id: string }[], total: number) {
    if (total >= bestCost) return; // prune
    if (i === items.length) {
      if (total < bestCost) {
        bestCost = total;
        best = [...assignment];
      }
      return;
    }
    const item = items[i];
    for (const worker of workers) {
      const used = capacityUsed.get(worker.id) ?? 0;
      const cap = worker.capacity ?? items.length;
      if (used >= cap) continue;
      capacityUsed.set(worker.id, used + 1);
      assignment.push({ item_id: item.id, worker_id: worker.id });
      backtrack(i + 1, assignment, total + cost(item, worker));
      assignment.pop();
      capacityUsed.set(worker.id, used);
    }
  }

  backtrack(0, [], 0);
  return best ?? [];
}

function solveGreedyExact(items: OptItem[], workers: OptWorker[]): { item_id: string; worker_id: string }[] {
  // Nearest-cost greedy for problem sizes too large to brute-force —
  // still driven by real cost data, just not provably optimal.
  const capacityUsed = new Map<string, number>();
  const assignments: { item_id: string; worker_id: string }[] = [];
  for (const item of items) {
    let bestWorker: OptWorker | null = null;
    let bestCost = Infinity;
    for (const worker of workers) {
      const used = capacityUsed.get(worker.id) ?? 0;
      const cap = worker.capacity ?? items.length;
      if (used >= cap) continue;
      const c = cost(item, worker);
      if (c < bestCost) {
        bestCost = c;
        bestWorker = worker;
      }
    }
    if (bestWorker) {
      capacityUsed.set(bestWorker.id, (capacityUsed.get(bestWorker.id) ?? 0) + 1);
      assignments.push({ item_id: item.id, worker_id: bestWorker.id });
    }
  }
  return assignments;
}

export class OptimizationAgent {
  cuOptBreaker = new CircuitBreaker("cuOpt"); // reused as the constraint-solver tier's breaker

  private health: ServiceHealthRegistry;
  constructor(health: ServiceHealthRegistry) {
    this.health = health;
  }

  formulateProblem(excludedWorkerId: string, items: OptItem[], workers: OptWorker[]): Problem {
    return { excludedWorkerId, items, workers: workers.filter((w) => w.id !== excludedWorkerId) };
  }

  solveWithConstraintSolver(problem: Problem): ReroutePlan {
    const { items, workers, excludedWorkerId } = problem;
    if (items.length === 0 || workers.length === 0) {
      return { worker_id: excludedWorkerId, assignments: [], excluded_workers: [excludedWorkerId], projected_throughput_pct: 97.0, solver_used: "constraint-solver" };
    }
    const assignments = items.length <= BRUTE_FORCE_LIMIT ? solveExact(items, workers) : solveGreedyExact(items, workers);
    return { worker_id: excludedWorkerId, assignments, excluded_workers: [excludedWorkerId], projected_throughput_pct: 97.0, solver_used: "constraint-solver" };
  }

  solveWithGreedyRoundRobin(problem: Problem): ReroutePlan {
    const { items, workers, excludedWorkerId } = problem;
    if (workers.length === 0) {
      return { worker_id: excludedWorkerId, assignments: [], excluded_workers: [excludedWorkerId], projected_throughput_pct: 0, solver_used: "greedy_round_robin" };
    }
    const assignments = items.map((item, i) => ({ item_id: item.id, worker_id: workers[i % workers.length].id }));
    return { worker_id: excludedWorkerId, assignments, excluded_workers: [excludedWorkerId], projected_throughput_pct: 85.0, solver_used: "greedy_round_robin" };
  }

  solve(problem: Problem): ReroutePlan {
    if (this.health.isUp("cuOpt") && this.cuOptBreaker.isClosed()) {
      try {
        const plan = this.solveWithConstraintSolver(problem);
        this.cuOptBreaker.recordSuccess();
        return plan;
      } catch {
        this.cuOptBreaker.recordFailure("solver error");
      }
    } else {
      this.cuOptBreaker.recordFailure(this.health.isUp("cuOpt") ? "circuit open" : "solver unreachable");
    }
    return this.solveWithGreedyRoundRobin(problem);
  }
}

// src/sim/__tests__/throughput.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { SentinelSimulator } from "../index";

describe("SentinelSimulator.getThroughputPct — real, adaptive, not stuck", () => {
  let sim: SentinelSimulator;

  beforeEach(() => {
    sim = new SentinelSimulator();
  });

  it("starts at the 100% baseline with no incident", () => {
    expect(sim.getThroughputPct()).toBe(100);
  });

  it("dips during an active incident and recovers once the worker resumes", async () => {
    await sim.injectFault("worker-3", "schema_corruption", { field: "Tax_ID" });

    // The full cycle (detect -> diagnose -> remediate -> verify) resolves
    // synchronously within injectFault's own awaited publish chain, same
    // as the real backend — by the time this resolves the worker should
    // already be settled (RESUMED, since NIM/Nemotron/etc are all
    // healthy by default in a fresh simulator).
    const state = sim.getWorkerState("worker-3");
    expect(["RESUMED", "ESCALATED"]).toContain(state);

    const pct = sim.getThroughputPct();
    if (state === "RESUMED") {
      // This is the exact bug being guarded against: previously this
      // stayed pinned at the solver's reroute number (97/85) forever,
      // even after the worker had fully healed.
      expect(pct).toBe(100);
    } else {
      // Escalated means still broken — throughput should stay degraded,
      // reflecting the real (not fabricated) reroute plan's number.
      expect(pct).toBeLessThan(100);
    }
  });

  it("stays degraded for a worker that never resolves (no explicit state)", () => {
    // Mirrors the backend regression test: a reroute plan recorded
    // without ever exercising that worker's FSM transitions (state
    // unknown) should still report honestly, not silently reset.
    const orchestrator = (sim as unknown as { orchestrator: { reroutePlans: Map<string, unknown> } }).orchestrator;
    orchestrator.reroutePlans.set("worker-isolated", {
      worker_id: "worker-isolated",
      assignments: [],
      excluded_workers: [],
      projected_throughput_pct: 82.5,
      solver_used: "or-tools",
    });
    expect(sim.getThroughputPct()).toBe(82.5);
  });
});

// src/sim/__tests__/agents.test.ts
import { describe, it, expect } from "vitest";
import { ServiceHealthRegistry } from "../serviceHealth";
import { SentinelAgent } from "../agents/sentinel";
import { TriageAgent } from "../agents/triage";
import { RemediationAgent, generatePatch } from "../agents/remediation";
import { OptimizationAgent } from "../agents/optimization";

describe("SentinelAgent.detectLoop", () => {
  it("does not fire before the sliding window has 4 samples", () => {
    const health = new ServiceHealthRegistry();
    const sentinel = new SentinelAgent(health);
    const result = sentinel.detectLoop("worker-1", "same error text", "sig-a");
    expect(result).toBeNull();
  });

  it("fires once 3 consecutive steps clear the similarity threshold with a repeated error signature", () => {
    const health = new ServiceHealthRegistry();
    const sentinel = new SentinelAgent(health);
    const line = "Error: Field 'Tax_ID' not found (fault: schema_corruption)";
    let event = null;
    for (let i = 0; i < 5; i++) {
      event = sentinel.detectLoop("worker-3", line, "Tax_ID_missing");
    }
    expect(event).not.toBeNull();
    expect(event!.similarity).toBeGreaterThan(0.92);
  });

  it("does not fire when the error signature changes between steps", () => {
    const health = new ServiceHealthRegistry();
    const sentinel = new SentinelAgent(health);
    const line = "Error: Field 'Tax_ID' not found (fault: schema_corruption)";
    let event = null;
    const sigs = ["sig-1", "sig-2", "sig-3", "sig-4", "sig-5"];
    for (const sig of sigs) {
      event = sentinel.detectLoop("worker-4", line, sig);
    }
    expect(event).toBeNull();
  });

  it("falls back to sentence-transformers labeling when NIM is killed", () => {
    const health = new ServiceHealthRegistry();
    health.kill("NIM");
    const sentinel = new SentinelAgent(health);
    sentinel.detectLoop("worker-5", "x", "sig");
    expect(sentinel.lastEmbedOrigin).toBe("sentence-transformers");
  });
});

describe("TriageAgent.diagnose fallback ladder", () => {
  const loopEvent = { worker_id: "worker-3", similarity: 0.97, consecutive_count: 3, error_hash: "abc", embedding_origin: "NIM" as const, timestamp: new Date().toISOString(), log_lines: [] };
  const logs = ["Error: Field 'Tax_ID' not found in invoice schema"];

  it("uses the primary tier when Nemotron is healthy", async () => {
    const health = new ServiceHealthRegistry();
    const triage = new TriageAgent(health);
    const diagnosis = await triage.diagnose(loopEvent, logs);
    expect(diagnosis.fallback_used).toBe(false);
    expect(diagnosis.fix_type).toBe("SCHEMA_MISMATCH");
  });

  it("falls to Groq when Nemotron is killed", async () => {
    const health = new ServiceHealthRegistry();
    health.kill("Nemotron");
    const triage = new TriageAgent(health);
    const diagnosis = await triage.diagnose(loopEvent, logs);
    expect(diagnosis.fallback_used).toBe(true);
    expect(diagnosis.fallback_origin).toBe("groq");
  });

  it("falls all the way to the rule-based heuristic when both LLM tiers are killed", async () => {
    const health = new ServiceHealthRegistry();
    health.kill("Nemotron");
    health.kill("Groq");
    const triage = new TriageAgent(health);
    const diagnosis = await triage.diagnose(loopEvent, logs);
    expect(diagnosis.fallback_origin).toBe("rule_based_heuristic");
    expect(diagnosis.confidence).toBe(0.65);
  });
});

describe("generatePatch (1:1 with backend PATCH_TEMPLATES)", () => {
  it("produces a schema-mismatch patch naming the field", () => {
    expect(generatePatch("SCHEMA_MISMATCH", "Tax_ID")).toContain("Tax_ID");
  });
  it("produces a generic patch for an unknown fix_type", () => {
    expect(generatePatch("unknown", "foo")).toContain("Generic patch");
  });
});

describe("RemediationAgent 3-tier verification", () => {
  it("verifies via the real NemoClaw tier when the service is healthy", async () => {
    const health = new ServiceHealthRegistry();
    const remediation = new RemediationAgent(health);
    const result = await remediation.remediate({ root_cause: "x", fix_type: "SCHEMA_MISMATCH", affected_field: "Tax_ID", confidence: 0.9, fallback_used: false, fallback_origin: null });
    expect(result.verified).toBe(true);
    expect(result.mode).toBe("nemoclaw");
  });

  it("falls back to the mock wrapper when NemoClaw is killed", async () => {
    const health = new ServiceHealthRegistry();
    health.kill("NemoClaw");
    const remediation = new RemediationAgent(health);
    const result = await remediation.remediate({ root_cause: "x", fix_type: "SCHEMA_MISMATCH", affected_field: "Tax_ID", confidence: 0.9, fallback_used: false, fallback_origin: null });
    expect(result.verified).toBe(true);
    expect(result.mode).toBe("mock");
    expect(result.flagged).toBe(true);
  });

  it("escalates once the NemoClaw circuit breaker fully opens", async () => {
    const health = new ServiceHealthRegistry();
    health.kill("NemoClaw");
    const remediation = new RemediationAgent(health);
    const diagnosis = { root_cause: "x", fix_type: "SCHEMA_MISMATCH" as const, affected_field: "Tax_ID", confidence: 0.9, fallback_used: false, fallback_origin: null };
    await remediation.remediate(diagnosis);
    await remediation.remediate(diagnosis);
    await remediation.remediate(diagnosis); // 3rd failure opens the breaker
    const result = await remediation.remediate(diagnosis);
    expect(result.mode).toBe("unavailable");
    expect(result.verified).toBe(false);
  });
});

describe("OptimizationAgent reroute", () => {
  it("excludes the failing worker from any assignment", () => {
    const health = new ServiceHealthRegistry();
    const optimization = new OptimizationAgent(health);
    const problem = optimization.formulateProblem(
      "worker-3",
      [{ id: "item-1" }, { id: "item-2" }],
      [{ id: "worker-1" }, { id: "worker-2" }, { id: "worker-3" }]
    );
    const plan = optimization.solve(problem);
    expect(plan.assignments.every((a) => a.worker_id !== "worker-3")).toBe(true);
    expect(plan.excluded_workers).toContain("worker-3");
  });

  it("falls back to greedy round-robin when cuOpt is killed", () => {
    const health = new ServiceHealthRegistry();
    health.kill("cuOpt");
    const optimization = new OptimizationAgent(health);
    const problem = optimization.formulateProblem("worker-3", [{ id: "item-1" }], [{ id: "worker-1" }]);
    const plan = optimization.solve(problem);
    expect(plan.solver_used).toBe("greedy_round_robin");
  });
});

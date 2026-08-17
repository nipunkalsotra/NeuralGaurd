// src/sim/__tests__/trustChain.test.ts
import { describe, it, expect } from "vitest";
import { TrustChainLogger } from "../trustChain";

const SAMPLE = {
  worker_id: "worker-1",
  from_state: "HEALTHY" as const,
  to_state: "LOOP_SUSPECTED" as const,
  trigger_event: "LOOP_SUSPECTED",
  agent_name: "SentinelAgent",
};

describe("TrustChainLogger — real SHA-256 hash chain", () => {
  it("produces a genesis-linked chain that verifies clean", async () => {
    const chain = new TrustChainLogger();
    await chain.logTransition(SAMPLE);
    await chain.logTransition({ ...SAMPLE, from_state: "LOOP_SUSPECTED", to_state: "DIAGNOSING", trigger_event: "DIAGNOSIS_STARTED" });
    const result = await chain.verifyChain();
    expect(result.valid).toBe(true);
    expect(result.brokenAt).toBeNull();
  });

  it("chains previous_hash -> current_hash across records", async () => {
    const chain = new TrustChainLogger();
    const first = await chain.logTransition(SAMPLE);
    const second = await chain.logTransition({ ...SAMPLE, from_state: "LOOP_SUSPECTED", to_state: "DIAGNOSING", trigger_event: "DIAGNOSIS_STARTED" });
    expect(second.previous_hash).toBe(first.current_hash);
    expect(first.previous_hash).toBe("0".repeat(64));
  });

  it("detects tampering — every record from the tampered one onward fails", async () => {
    const chain = new TrustChainLogger();
    await chain.logTransition(SAMPLE);
    await chain.logTransition({ ...SAMPLE, from_state: "LOOP_SUSPECTED", to_state: "DIAGNOSING", trigger_event: "DIAGNOSIS_STARTED" });
    await chain.logTransition({ ...SAMPLE, from_state: "DIAGNOSING", to_state: "REMEDIATING", trigger_event: "DIAGNOSIS_COMPLETE", confidence_score: 0.9 });

    chain.tamperRecord(0, "confidence_score", 0.99);
    const result = await chain.verifyChain();

    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(0);
  });

  it("two runs of the same content produce different hashes (timestamp-salted)", async () => {
    const a = new TrustChainLogger();
    const b = new TrustChainLogger();
    const recA = await a.logTransition(SAMPLE);
    await new Promise((r) => setTimeout(r, 5));
    const recB = await b.logTransition(SAMPLE);
    expect(recA.current_hash).not.toBe(recB.current_hash);
  });
});

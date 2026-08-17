// src/sim/__tests__/fsm.test.ts
import { describe, it, expect } from "vitest";
import { VALID_TRANSITIONS, isLegalTransition } from "../fsm";
import type { WorkerState } from "../types";

describe("FSM transition legality", () => {
  it("allows the full happy-path healing cycle", () => {
    const path: WorkerState[] = ["HEALTHY", "LOOP_SUSPECTED", "DIAGNOSING", "REMEDIATING", "VERIFYING", "RESUMED"];
    for (let i = 0; i < path.length - 1; i++) {
      expect(isLegalTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it("allows escalation from DIAGNOSING and from VERIFYING", () => {
    expect(isLegalTransition("DIAGNOSING", "ESCALATED")).toBe(true);
    expect(isLegalTransition("VERIFYING", "ESCALATED")).toBe(true);
  });

  it("rejects skipping the diagnosis step", () => {
    expect(isLegalTransition("LOOP_SUSPECTED", "REMEDIATING")).toBe(false);
  });

  it("rejects re-entering HEALTHY from DIAGNOSING", () => {
    expect(isLegalTransition("DIAGNOSING", "HEALTHY")).toBe(false);
  });

  it("treats ESCALATED as terminal — no legal outgoing transition", () => {
    expect(VALID_TRANSITIONS.ESCALATED).toEqual([]);
  });

  it("allows RESUMED to loop back into a fresh incident", () => {
    expect(isLegalTransition("RESUMED", "LOOP_SUSPECTED")).toBe(true);
    expect(isLegalTransition("RESUMED", "HEALTHY")).toBe(true);
  });
});

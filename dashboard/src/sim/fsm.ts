// src/sim/fsm.ts
// Direct port of backend/sentinel/agents/orchestrator.py's VALID_TRANSITIONS.
// Same 7 states, same legal edges, same illegal-transition rejection —
// the simulator can never enter a state the real backend couldn't.
import type { WorkerState } from "./types";

export const VALID_TRANSITIONS: Record<WorkerState, WorkerState[]> = {
  HEALTHY: ["LOOP_SUSPECTED"],
  LOOP_SUSPECTED: ["DIAGNOSING", "HEALTHY"],
  DIAGNOSING: ["REMEDIATING", "ESCALATED"],
  REMEDIATING: ["VERIFYING"],
  VERIFYING: ["RESUMED", "ESCALATED"],
  RESUMED: ["HEALTHY", "LOOP_SUSPECTED"],
  ESCALATED: [],
};

export const CONFIDENCE_ESCALATION_THRESHOLD = 0.7;

export class IllegalTransitionError extends Error {
  constructor(from: WorkerState, to: WorkerState) {
    super(`Illegal transition: ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export function isLegalTransition(from: WorkerState, to: WorkerState): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

// src/sim/__tests__/circuitBreaker.test.ts
import { describe, it, expect, vi } from "vitest";
import { CircuitBreaker } from "../circuitBreaker";

describe("CircuitBreaker state machine", () => {
  it("stays closed under the failure threshold", () => {
    const cb = new CircuitBreaker("Test", 3, 60_000);
    cb.recordFailure("a");
    cb.recordFailure("b");
    expect(cb.isClosed()).toBe(true);
    expect(cb.getStatus().status).toBe("CLOSED");
  });

  it("opens after reaching the failure threshold", () => {
    const cb = new CircuitBreaker("Test", 3, 60_000);
    cb.recordFailure("a");
    cb.recordFailure("b");
    cb.recordFailure("c");
    expect(cb.isClosed()).toBe(false);
    expect(cb.getStatus().status).toBe("OPEN");
  });

  it("moves to half-open and allows exactly one probe after the timeout elapses", () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker("Test", 3, 1000);
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.allowRequest()).toBe(false);

    vi.advanceTimersByTime(1001);
    expect(cb.getStatus().status).toBe("HALF_OPEN");
    expect(cb.allowRequest()).toBe(true); // the one probe
    expect(cb.allowRequest()).toBe(false); // no second probe until it resolves
    vi.useRealTimers();
  });

  it("recovers to CLOSED on a success", () => {
    const cb = new CircuitBreaker("Test", 3, 60_000);
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess();
    expect(cb.getStatus().status).toBe("CLOSED");
    expect(cb.getStatus().failure_count).toBe(0);
  });

  it("forceOpen immediately opens regardless of failure count", () => {
    const cb = new CircuitBreaker("Test", 3, 60_000);
    cb.forceOpen("manually killed");
    expect(cb.getStatus().status).toBe("OPEN");
    expect(cb.getStatus().last_failure).toBe("manually killed");
  });
});

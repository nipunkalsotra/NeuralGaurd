// src/sim/circuitBreaker.ts
// Direct port of backend/sentinel/fallback/circuit_breaker.py's state
// machine: N consecutive failures -> OPEN for `timeout`s -> one HALF_OPEN
// probe -> CLOSED on success / re-OPEN on failure. Same numbers (3
// failures, 60s open) as the real breaker guarding NIM/Nemotron/cuOpt/
// Groq/NemoClaw.
import type { CircuitStatus, ServiceName } from "./types";

export class CircuitBreaker {
  private failureCount = 0;
  private openedAt: number | null = null;
  private probing = false;
  private lastFailureReason: string | null = null;

  readonly service: ServiceName | string;
  private readonly maxFailures: number;
  private readonly timeoutMs: number;

  constructor(service: ServiceName | string, maxFailures = 3, timeoutMs = 60_000) {
    this.service = service;
    this.maxFailures = maxFailures;
    this.timeoutMs = timeoutMs;
  }

  private elapsedSinceOpen(): number {
    return this.openedAt !== null ? Date.now() - this.openedAt : 0;
  }

  getStatus(): CircuitStatus {
    let status: CircuitStatus["status"] = "CLOSED";
    if (this.openedAt !== null) {
      status = this.elapsedSinceOpen() <= this.timeoutMs ? "OPEN" : "HALF_OPEN";
    }
    return {
      service: this.service as ServiceName,
      status,
      failure_count: this.failureCount,
      last_failure: this.lastFailureReason,
    };
  }

  allowRequest(): boolean {
    if (this.openedAt === null) return true;
    if (this.elapsedSinceOpen() <= this.timeoutMs) return false;
    if (!this.probing) {
      this.probing = true;
      return true;
    }
    return false;
  }

  isClosed(): boolean {
    return this.allowRequest();
  }

  recordSuccess(): void {
    this.failureCount = 0;
    this.openedAt = null;
    this.probing = false;
  }

  recordFailure(reason?: string): void {
    this.failureCount += 1;
    if (reason) this.lastFailureReason = reason;

    if (this.openedAt === null) {
      if (this.failureCount >= this.maxFailures) {
        this.openedAt = Date.now();
        this.probing = false;
      }
    } else {
      this.openedAt = Date.now();
      this.probing = false;
      this.failureCount = Math.max(this.failureCount, this.maxFailures);
    }
  }

  /** Instantly force OPEN — the "kill this service" control on /fallbacks. */
  forceOpen(reason = "manually killed"): void {
    this.failureCount = this.maxFailures;
    this.openedAt = Date.now();
    this.probing = false;
    this.lastFailureReason = reason;
  }
}

const SERVICES: ServiceName[] = ["NIM", "Nemotron", "cuOpt", "Groq", "NemoClaw"];

export class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>(
    SERVICES.map((name) => [name, new CircuitBreaker(name)])
  );

  get(service: ServiceName | string): CircuitBreaker {
    let breaker = this.breakers.get(service);
    if (!breaker) {
      breaker = new CircuitBreaker(service);
      this.breakers.set(service, breaker);
    }
    return breaker;
  }

  allStatuses(): CircuitStatus[] {
    return Array.from(this.breakers.values()).map((b) => b.getStatus());
  }
}

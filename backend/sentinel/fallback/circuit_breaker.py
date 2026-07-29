"""
Shared Circuit Breaker.

Two ways this is used in the project:
1. Per-agent internal fallback breaker (Sentinel/Triage/Remediation/
   Optimization) — constructed as CircuitBreaker(failures=3, timeout=60),
   checked via is_closed(), updated via record_failure()/record_success().
2. Per-SERVICE breaker exposed to the dashboard (Day 6) — constructed as
   CircuitBreaker(service="NIM", open_duration=60), checked via
   allow_request(), status read via get_status(). CircuitBreakerManager
   tracks one instance per named service, fully isolated.

Both usages share the same state machine; the extra kwargs/methods are
additive, not a breaking change to existing agent code.
"""

import time
from typing import Dict, List, Optional


class CircuitBreaker:
    def __init__(
        self,
        service: str = "default",
        failures: int = 3,
        timeout: int = 60,
        open_duration: Optional[float] = None,
    ):
        self.service = service
        self.max_failures = failures
        self.timeout = open_duration if open_duration is not None else timeout
        self.failure_count = 0
        self.opened_at: Optional[float] = None
        self.probing = False
        self.last_failure_reason: Optional[str] = None

    def _elapsed_since_open(self) -> float:
        return time.time() - self.opened_at if self.opened_at is not None else 0.0

    def get_status(self) -> dict:
        if self.opened_at is None:
            status = "CLOSED"
        elif self._elapsed_since_open() <= self.timeout:
            status = "OPEN"
        else:
            status = "HALF_OPEN"
        return {
            "service": self.service,
            "status": status,
            "failure_count": self.failure_count,
            "last_failure": self.last_failure_reason,
        }

    def allow_request(self) -> bool:
        if self.opened_at is None:
            return True
        if self._elapsed_since_open() <= self.timeout:
            return False
        if not self.probing:
            self.probing = True
            return True
        return False

    def is_closed(self) -> bool:
        return self.allow_request()

    def record_success(self) -> None:
        self.failure_count = 0
        self.opened_at = None
        self.probing = False

    def record_failure(self, reason: str = None) -> None:
        self.failure_count += 1
        if reason:
            self.last_failure_reason = reason

        if self.opened_at is None:
            if self.failure_count >= self.max_failures:
                self.opened_at = time.time()
                self.probing = False
        else:
            self.opened_at = time.time()
            self.probing = False
            self.failure_count = max(self.failure_count, self.max_failures)


class CircuitBreakerManager:
    SERVICES = ["NIM", "Nemotron", "cuOpt", "Groq", "NemoClaw"]

    def __init__(self):
        self._breakers: Dict[str, CircuitBreaker] = {
            name: CircuitBreaker(service=name, failures=3, timeout=60)
            for name in self.SERVICES
        }

    def get(self, service: str) -> CircuitBreaker:
        if service not in self._breakers:
            self._breakers[service] = CircuitBreaker(service=service, failures=3, timeout=60)
        return self._breakers[service]

    def all_statuses(self) -> List[dict]:
        return [b.get_status() for b in self._breakers.values()]


CircuitBreakerRegistry = CircuitBreakerManager
circuit_registry = CircuitBreakerManager()

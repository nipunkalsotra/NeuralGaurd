# backend/sentinel/fallback/circuit_breaker.py
"""
Shared Circuit Breaker — used by Sentinel Agent, Triage Agent, and any
other agent calling an external API with a cascading fallback chain.
After N consecutive failures, opens for `timeout` seconds before allowing a probe.
"""

import time


class CircuitBreaker:
    def __init__(self, failures: int = 3, timeout: int = 60):
        self.max_failures = failures
        self.timeout = timeout
        self.failure_count = 0
        self.opened_at = None

    def is_closed(self) -> bool:
        if self.opened_at is None:
            return True
        if time.time() - self.opened_at > self.timeout:
            # half-open: allow a probe
            self.opened_at = None
            self.failure_count = 0
            return True
        return False

    def record_failure(self):
        self.failure_count += 1
        if self.failure_count >= self.max_failures:
            self.opened_at = time.time()

    def record_success(self):
        self.failure_count = 0
        self.opened_at = None
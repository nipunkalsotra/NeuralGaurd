"""
Per-service circuit breaker implementation for AI Factory Sentinel (Day 6).

Each external dependency (NIM, Nemotron, cuOpt, Groq, NemoClaw) gets its own
independent CircuitBreaker instance. A failure on one service's circuit does
NOT affect any other service's circuit (per master doc 10.5 / Day 6 gotcha).

State machine
-------------
    CLOSED     -> normal operation, requests go to the primary service
    OPEN       -> primary service is failing, ALL traffic routes to fallback
    HALF_OPEN  -> after 60s, exactly one probe request is let through to test
                  whether the primary service has recovered

Transitions
-----------
    CLOSED    -> OPEN       : 3 consecutive failures
    OPEN      -> HALF_OPEN  : 60 seconds elapsed since the circuit opened
    HALF_OPEN -> CLOSED     : the probe request succeeds
    HALF_OPEN -> OPEN       : the probe request fails (60s timer resets)
"""

import time
import threading
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, Optional


class CircuitState(str, Enum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


FAILURE_THRESHOLD = 3
OPEN_DURATION_SECONDS = 60  # fixed for Phase 1; Phase 2 can make this configurable


@dataclass
class CircuitBreaker:
    service: str
    failure_threshold: int = FAILURE_THRESHOLD
    open_duration: int = OPEN_DURATION_SECONDS

    _state: CircuitState = field(default=CircuitState.CLOSED, init=False)
    _failure_count: int = field(default=0, init=False)
    _last_failure_time: Optional[float] = field(default=None, init=False)
    _opened_at: Optional[float] = field(default=None, init=False)
    _half_open_probe_in_flight: bool = field(default=False, init=False)
    _lock: threading.Lock = field(default_factory=threading.Lock, init=False)

    def allow_request(self) -> bool:
        """
        True  -> caller may send the request to the PRIMARY service.
        False -> caller must route to fallback immediately.
        """
        with self._lock:
            if self._state == CircuitState.CLOSED:
                return True

            if self._state == CircuitState.OPEN:
                if self._opened_at is not None and (
                    time.time() - self._opened_at >= self.open_duration
                ):
                    self._state = CircuitState.HALF_OPEN
                    self._half_open_probe_in_flight = True
                    return True
                return False

            if self._state == CircuitState.HALF_OPEN:
                if not self._half_open_probe_in_flight:
                    self._half_open_probe_in_flight = True
                    return True
                return False

            return False

    def record_success(self) -> None:
        with self._lock:
            self._state = CircuitState.CLOSED
            self._failure_count = 0
            self._opened_at = None
            self._half_open_probe_in_flight = False

    def record_failure(self) -> None:
        with self._lock:
            self._last_failure_time = time.time()

            if self._state == CircuitState.HALF_OPEN:
                # Probe failed -> reopen, reset the 60s timer
                self._state = CircuitState.OPEN
                self._opened_at = time.time()
                self._half_open_probe_in_flight = False
                return

            self._failure_count += 1
            if (
                self._state == CircuitState.CLOSED
                and self._failure_count >= self.failure_threshold
            ):
                self._state = CircuitState.OPEN
                self._opened_at = time.time()

    def get_status(self) -> Dict:
        with self._lock:
            return {
                "service": self.service,
                "status": self._state.value,
                "last_failure": self._last_failure_time,
                "failure_count": self._failure_count,
            }

    def force_reset(self) -> None:
        """Manual override — e.g. for tests or an ops 'reset' button."""
        with self._lock:
            self._state = CircuitState.CLOSED
            self._failure_count = 0
            self._opened_at = None
            self._last_failure_time = None
            self._half_open_probe_in_flight = False


class CircuitBreakerManager:
    """
    Owns one CircuitBreaker per external service. Guarantees isolation:
    the NIM circuit opening never touches the Groq circuit, etc.
    """

    SERVICES = ["NIM", "Nemotron", "cuOpt", "Groq", "NemoClaw"]

    def __init__(self):
        self._breakers: Dict[str, CircuitBreaker] = {
            name: CircuitBreaker(service=name) for name in self.SERVICES
        }

    def get(self, service: str) -> CircuitBreaker:
        if service not in self._breakers:
            self._breakers[service] = CircuitBreaker(service=service)
        return self._breakers[service]

    def all_status(self) -> Dict[str, Dict]:
        return {name: cb.get_status() for name, cb in self._breakers.items()}


# Singleton used across the backend (import this, don't instantiate your own)
circuit_breaker_manager = CircuitBreakerManager()
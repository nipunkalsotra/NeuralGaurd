"""
Unit tests for the circuit breaker (Day 6 blocker checks).
Run with:
    pytest backend/tests/test_circuit_breaker.py -v
Covers:
1. After 3 consecutive failures, circuit status = OPEN, all traffic -> fallback.
2. After open_duration elapses, circuit enters HALF_OPEN, probe request sent.
3. Probe success -> CLOSED. Probe failure -> OPEN again (60s timer resets).
4. Circuits are isolated per service (NIM opening doesn't affect Groq).
"""
import time
from sentinel.fallback.circuit_breaker import CircuitBreaker, CircuitBreakerManager
def test_closed_by_default():
    cb = CircuitBreaker(service="TestService")
    assert cb.get_status()["status"] == "CLOSED"
    assert cb.allow_request() is True
def test_opens_after_three_consecutive_failures():
    cb = CircuitBreaker(service="TestService")
    cb.record_failure()
    assert cb.get_status()["status"] == "CLOSED"
    assert cb.allow_request() is True
    cb.record_failure()
    assert cb.get_status()["status"] == "CLOSED"
    cb.record_failure()  # 3rd consecutive failure
    status = cb.get_status()
    assert status["status"] == "OPEN"
    assert status["failure_count"] == 3
    # All traffic must route to fallback while OPEN
    assert cb.allow_request() is False
def test_success_resets_failure_count_while_closed():
    cb = CircuitBreaker(service="TestService")
    cb.record_failure()
    cb.record_failure()
    cb.record_success()
    assert cb.get_status()["failure_count"] == 0
    assert cb.get_status()["status"] == "CLOSED"
def test_half_open_after_open_duration():
    # Short open_duration so the test doesn't need to sleep 60 real seconds
    cb = CircuitBreaker(service="TestService", open_duration=0.2)
    for _ in range(3):
        cb.record_failure()
    assert cb.get_status()["status"] == "OPEN"
    assert cb.allow_request() is False
    time.sleep(0.25)
    # First request after the window is the probe -> allowed
    assert cb.allow_request() is True
    assert cb.get_status()["status"] == "HALF_OPEN"
    # A second concurrent request during HALF_OPEN must NOT get through
    assert cb.allow_request() is False
def test_probe_success_closes_circuit():
    cb = CircuitBreaker(service="TestService", open_duration=0.2)
    for _ in range(3):
        cb.record_failure()
    time.sleep(0.25)
    assert cb.allow_request() is True  # probe allowed
    cb.record_success()
    assert cb.get_status()["status"] == "CLOSED"
    assert cb.allow_request() is True
def test_probe_failure_reopens_circuit():
    cb = CircuitBreaker(service="TestService", open_duration=0.2)
    for _ in range(3):
        cb.record_failure()
    time.sleep(0.25)
    assert cb.allow_request() is True  # probe allowed
    cb.record_failure()  # probe fails
    status = cb.get_status()
    assert status["status"] == "OPEN"
    assert cb.allow_request() is False
def test_circuits_are_isolated_per_service():
    manager = CircuitBreakerManager()
    nim = manager.get("NIM")
    groq = manager.get("Groq")
    for _ in range(3):
        nim.record_failure()
    assert nim.get_status()["status"] == "OPEN"
    assert groq.get_status()["status"] == "CLOSED"
    assert groq.allow_request() is True
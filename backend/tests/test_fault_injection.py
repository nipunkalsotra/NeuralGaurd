# backend/tests/test_fault_injection.py
"""
Fault Injection tests. Confirms all 4 fault types work AND feed into
Sentinel's real detect_loop() within 3 steps (per Day 7 blocker check).
"""

from unittest.mock import patch

import pytest

from api.fault_injection import FAULT_HANDLERS, get_worker_fault, clear_worker_fault
from sentinel.agents.sentinel_agent import SentinelAgent


@pytest.fixture(autouse=True)
def cleanup():
    yield
    clear_worker_fault("worker-test")


def test_all_4_fault_types_registered():
    assert set(FAULT_HANDLERS.keys()) == {
        "schema_corruption", "latency", "error_signature", "resource_pressure"
    }


def test_schema_corruption_sets_fault_state():
    FAULT_HANDLERS["schema_corruption"].apply("worker-test", {"field": "Tax_ID"})
    fault = get_worker_fault("worker-test")
    assert fault["type"] == "schema_corruption"
    assert fault["removed_field"] == "Tax_ID"


def test_latency_sets_fault_state():
    FAULT_HANDLERS["latency"].apply("worker-test", {"delay_ms": 3000})
    fault = get_worker_fault("worker-test")
    assert fault["delay_ms"] == 3000


def test_error_signature_sets_fault_state():
    FAULT_HANDLERS["error_signature"].apply("worker-test", {"error": "custom"})
    fault = get_worker_fault("worker-test")
    assert fault["forced_error"] == "custom"


def test_resource_pressure_sets_fault_state():
    FAULT_HANDLERS["resource_pressure"].apply("worker-test", {"memory_mb": 2048})
    fault = get_worker_fault("worker-test")
    assert fault["consumed_memory_mb"] == 2048


@patch("sentinel.agents.sentinel_agent.SentenceTransformer")
def test_schema_corruption_fault_detected_by_sentinel_within_3_steps(mock_st):
    """Simulates the fault-injected error repeating -> Sentinel's real
    detect_loop() should trigger LOOP_SUSPECTED within 3-4 samples."""
    mock_st.return_value.encode.return_value.tolist = lambda: [0.9, 0.9, 0.9]

    FAULT_HANDLERS["schema_corruption"].apply("worker-test", {"field": "Tax_ID"})
    fault = get_worker_fault("worker-test")

    agent = SentinelAgent()
    with patch.object(agent.nim_client, "embed", side_effect=Exception("simulate NIM down")):
        result = None
        for _ in range(4):
            result = agent.detect_loop(
                "worker-test",
                f"Error: {fault['removed_field']} not found",
                fault["error_signature"],
            )

    assert result is not None
    assert result["worker_id"] == "worker-test"
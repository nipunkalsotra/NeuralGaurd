# backend/sentinel/agents/remediation_agent.py
"""
Remediation Agent — Patch Generation & Verification
Day 6: generates a targeted patch based on Triage's fix_type, calls the
wrapper service (mock or real — agent is completely agnostic to which)
over HTTP at POST /v1/remediate. Never calls NemoClaw CLI directly.
"""

import logging
import os

import httpx

from sentinel.fallback.circuit_breaker import CircuitBreaker
from sentinel.fallback.circuit_breaker import circuit_registry

logger = logging.getLogger("sentinel.remediation_agent")

WRAPPER_URL = os.getenv("WRAPPER_URL", "http://localhost:8081")


# Patch generation strategies per fix_type, per master doc Section 4.3
PATCH_TEMPLATES = {
    "SCHEMA_MISMATCH": lambda field: f"Make field '{field}' optional with default null",
    "TYPE_ERROR": lambda field: f"Add type coercion for field '{field}'",
    "MISSING_IMPORT": lambda field: f"Add import statement for '{field}'",
}


class RemediationAgent:
    def __init__(self, wrapper_url: str = None):
        self.wrapper_url = wrapper_url or WRAPPER_URL
        self.circuit_breaker = CircuitBreaker(failures=3, timeout=60)

    def generate_patch(self, fix_type: str, affected_field: str) -> str:
        """Generates a small targeted patch string based on fix_type."""
        template = PATCH_TEMPLATES.get(fix_type)
        if template is None:
            logger.warning("Unknown fix_type '%s', using generic patch", fix_type)
            return f"Generic patch for field '{affected_field}' (fix_type: {fix_type})"
        return template(affected_field)

    async def remediate(self, diagnosis: dict, test_fixture: str = "default_fixture.json") -> dict:
        """
        Receives diagnosis from Triage (root_cause, fix_type, affected_field,
        confidence), generates a patch, and calls the wrapper service.
        Agent code is IDENTICAL regardless of wrapper mode (mock/nemoclaw) —
        that's the wrapper's job to abstract, not this agent's.
        """
        fix_type = diagnosis.get("fix_type", "unknown")
        affected_field = diagnosis.get("affected_field", "unknown")
        patch = self.generate_patch(fix_type, affected_field)

        if not self.circuit_breaker.is_closed():
            logger.warning("Circuit breaker open — skipping wrapper call, escalating")
            return {
                "verified": False,
                "output": "Circuit breaker open — wrapper unavailable",
                "sandbox_log": "",
                "mode": "unavailable",
                "flagged": True,
            }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.wrapper_url}/v1/remediate",
                    json={"patch": patch, "test_fixture": test_fixture},
                )
                response.raise_for_status()
                result = response.json()
                self.circuit_breaker.record_success()
                circuit_registry.get("NemoClaw").record_success()  # NEW
                return result

        except httpx.TimeoutException:
            logger.error("Wrapper call timed out after 30s")
            self.circuit_breaker.record_failure()
            circuit_registry.get("NemoClaw").record_failure(reason="timeout")  # NEW
            return {
                "verified": False,
                "output": "Wrapper call timed out after 30s",
                "sandbox_log": "",
                "mode": "timeout",
                "flagged": True,
            }

        except Exception as e:
            logger.error("Wrapper call failed: %s", e)
            self.circuit_breaker.record_failure()
            circuit_registry.get("NemoClaw").record_failure(reason=str(e))  # NEW
            return {
                "verified": False,
                "output": f"Wrapper call failed: {e}",
                "sandbox_log": "",
                "mode": "error",
                "flagged": True,
            }
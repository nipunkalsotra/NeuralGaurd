# backend/sentinel/agents/remediation_agent.py
"""
Remediation Agent — Patch Generation & Verification
Day 6: generates a targeted patch based on Triage's fix_type, calls the
wrapper service (mock or real — agent is completely agnostic to which)
over HTTP at POST /v1/remediate. Never calls NemoClaw CLI directly.
"""

import asyncio
import logging
import os

import httpx

from sentinel.fallback.circuit_breaker import CircuitBreaker
from sentinel.fallback.circuit_breaker import circuit_registry

logger = logging.getLogger("sentinel.remediation_agent")

WRAPPER_URL = os.getenv("WRAPPER_URL", "http://localhost:8081")


# Patch generation strategies per fix_type, per master doc Section 4.3.
# Covers every fix_type value BOTH Triage paths can actually produce: the
# LLM paths (Nemotron/Groq, constrained to this same enum in build_prompt())
# and the rule-based heuristic's PATTERNS list (Day 4). TIMEOUT/
# CONNECTION_ERROR/RESOURCE_ERROR were previously missing here even though
# the heuristic could emit them — same "unknown fix_type" gap as the LLM
# free-text problem, just from a different source.
PATCH_TEMPLATES = {
    "SCHEMA_MISMATCH": lambda field: f"Make field '{field}' optional with default null",
    "TYPE_ERROR": lambda field: f"Add type coercion for field '{field}'",
    "MISSING_IMPORT": lambda field: f"Add import statement for '{field}'",
    "TIMEOUT": lambda field: "Increase downstream timeout and add retry with backoff",
    "CONNECTION_ERROR": lambda field: "Verify downstream service health, retry connection",
    "RESOURCE_ERROR": lambda field: "Reduce batch size / free memory before retrying",
}


class RemediationAgent:
    def __init__(self, wrapper_url: str = None, wrapper_timeout: float = 30.0):
        self.wrapper_url = wrapper_url or WRAPPER_URL
        self.wrapper_timeout = wrapper_timeout
        self.circuit_breaker = CircuitBreaker(failures=3, timeout=60)
        # Day 13 perf tuning: a fresh httpx.AsyncClient (and its own new
        # TCP connection) was being opened AND torn down on every single
        # remediate() call — httpx.AsyncClient's whole point is to be
        # created once and reused, so it can pool/keep-alive connections
        # across requests. One long-lived client for this agent's
        # lifetime, matching httpx's own documented recommendation for
        # long-running processes.
        self._client = httpx.AsyncClient(timeout=self.wrapper_timeout)

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
        worker_id = diagnosis.get("worker_id", "worker-unknown")
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
            response = await self._client.post(
                f"{self.wrapper_url}/v1/remediate",
                json={"patch": patch, "test_fixture": test_fixture, "worker_id": worker_id},
            )
            response.raise_for_status()
            result = response.json()
            self.circuit_breaker.record_success()
            circuit_registry.get("NemoClaw").record_success()  # NEW
            # Demo pacing: the wrapper call above frequently resolves in
            # single-digit milliseconds (the mock wrapper does no real
            # work), so the gap between the reroute plan landing
            # (OPTIMIZATION_COMPLETE, where throughput visibly dips) and
            # the worker fully RESUMING (where it recovers) was often
            # under 100ms end to end — too tight for a human watching
            # the Control Plane's live throughput number to ever
            # perceive the dip, even with an event-reactive frontend
            # fetch. Widens that window without touching the real
            # verification result or its timing-sensitive circuit
            # breaker bookkeeping above.
            await asyncio.sleep(0.45)
            return result

        except httpx.TimeoutException:
            logger.error("Wrapper call timed out after %ss", self.wrapper_timeout)
            self.circuit_breaker.record_failure()
            circuit_registry.get("NemoClaw").record_failure(reason="timeout")  # NEW
            return {
                "verified": False,
                "output": f"Wrapper call timed out after {self.wrapper_timeout}s",
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
# backend/sentinel/agents/triage_agent.py
"""
Triage Agent — Root Cause Analysis
Day 2: LoopEvent + log lines -> structured JSON diagnosis (Nemotron primary, Groq fallback).
Day 4: DiagnosisCache wired in (30 min TTL, fallback_origin tracking).
Day 4: Rule-based heuristic added as Fallback 2 (last resort, zero API cost, always works).

Full fallback chain: Nemotron -> Groq -> rule-based heuristic.
"""

import hashlib
import os
import re

import httpx

from sentinel.cache.diagnosis_cache import DiagnosisCache
from sentinel.fallback.circuit_breaker import CircuitBreaker
from sentinel.fallback.circuit_breaker import circuit_registry
from sentinel.fallback.json_repair import repair_json
from sentinel.metrics.token_counter import token_counter


class NemotronClient:
    """Primary LLM: NVIDIA Nemotron via NIM."""

    def __init__(self):
        self.api_key = os.getenv("NVIDIA_NIM_API_KEY")
        self.url = "https://integrate.api.nvidia.com/v1/chat/completions"
        self.model = "nvidia/llama-3.3-nemotron-super-49b-v1"

    def chat(self, prompt: str) -> str:
        response = httpx.post(
            self.url,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self.model,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 300,
            },
            # Was 25.0 — on a cache miss with Nemotron unreachable, that
            # meant the PRIMARY tier alone could burn 25s before even
            # attempting the fallback chain, undermining the entire
            # fail-fast/graceful-degradation pitch this project makes.
            # Confirmed live: a real timeout here took the full 25s
            # before Groq was even tried. A short diagnostic completion
            # that hasn't returned in 6s isn't coming back fast enough
            # to matter for a live healing cycle either way.
            timeout=6.0,
        )
        response.raise_for_status()
        data = response.json()
        token_counter.record("TriageAgent", "Nemotron", data.get("usage", {}).get("total_tokens", 0))
        return data["choices"][0]["message"]["content"]


class GroqClient:
    """Fallback 1: Groq Llama 3.3 70B (no native JSON mode)."""

    def __init__(self):
        self.api_key = os.getenv("GROQ_API_KEY")
        self.url = "https://api.groq.com/openai/v1/chat/completions"
        self.model = "llama-3.3-70b-versatile"

    def chat(self, prompt: str) -> str:
        response = httpx.post(
            self.url,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self.model,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 300,
            },
            timeout=6.0,  # same reasoning as NemotronClient.chat() above
        )
        response.raise_for_status()
        data = response.json()
        token_counter.record("TriageAgent", "Groq", data.get("usage", {}).get("total_tokens", 0))
        return data["choices"][0]["message"]["content"]


class RuleBasedHeuristic:
    """
    Fallback 2 (last resort) for Triage. Zero API cost, zero network
    dependency. Matches error signatures against known patterns.
    Catches ~60-70% of common loop patterns per master doc Section 9.2.
    """

    # (regex to match in log lines, root_cause template, fix_type, affected_field template)
    PATTERNS = [
        (
            # "field" prefix optional — real error messages often just say
            # "Tax_ID not found" without the literal word "field" (Day 12:
            # this is exactly ErrorSignatureFault's default text).
            r"(?:field ['\"]?)?(\w+)['\"]? not found",
            "Field '{field}' missing from expected schema",
            "SCHEMA_MISMATCH",
            "{field}",
        ),
        (
            r"['\"]?(\w+)['\"]? is required",
            "Required field '{field}' missing",
            "SCHEMA_MISMATCH",
            "{field}",
        ),
        (
            r"expected (\w+), got (\w+)",
            "Type mismatch: expected {field} type",
            "TYPE_ERROR",
            "unknown",
        ),
        (
            r"timeout|timed out",
            "Operation timed out, likely downstream service unavailable",
            "TIMEOUT",
            "unknown",
        ),
        (
            r"connection refused|econnrefused",
            "Downstream service connection refused",
            "CONNECTION_ERROR",
            "unknown",
        ),
        (
            r"out of memory|oom",
            "Worker ran out of memory during processing",
            "RESOURCE_ERROR",
            "unknown",
        ),
    ]

    # backend/sentinel/agents/triage_agent.py
# Replace the classify() method in RuleBasedHeuristic

    def classify(self, log_lines: list) -> dict:
        original_logs = "\n".join(log_lines[-50:])

        for pattern, root_cause_template, fix_type, field_template in self.PATTERNS:
            match = re.search(pattern, original_logs, re.IGNORECASE)
            if match:
                field = match.group(1) if match.groups() else "unknown"
                return {
                    "root_cause": root_cause_template.format(field=field),
                    "fix_type": fix_type,
                    "affected_field": field_template.format(field=field),
                    "confidence": 0.65,
                    "fallback_used": True,
                    "fallback_origin": "rule_based_heuristic",
                }

        return {
            "root_cause": "unknown — no matching pattern in rule-based heuristic",
            "fix_type": "unknown",
            "affected_field": "unknown",
            "confidence": 0.0,
            "fallback_used": True,
            "fallback_origin": "rule_based_heuristic",
        }


class TriageAgent:
    def __init__(self):
        self.nemotron_client = NemotronClient()
        self.groq_client = GroqClient()
        self.circuit_breaker = CircuitBreaker(failures=3, timeout=60)
        self.diagnosis_cache = DiagnosisCache(ttl=1800)  # 30 min
        self.rule_based_heuristic = RuleBasedHeuristic()

    def _cache_key(self, log_lines: list, error_signature: str) -> str:
        content = "".join(log_lines[-50:]) + error_signature
        return hashlib.sha256(content.encode()).hexdigest()

    def build_prompt(self, loop_event: dict, log_lines: list) -> str:
        logs_text = "\n".join(log_lines[-50:])
        return f"""Analyze these logs. The worker is looping.

Worker ID: {loop_event.get('worker_id')}
Similarity score: {loop_event.get('similarity')}
Consecutive count: {loop_event.get('consecutive_count')}

Last log lines:
{logs_text}

Identify the root cause, classify the fix type, name the affected field, and provide a confidence score (0-1).

fix_type MUST be exactly one of these values — choose the closest match,
do not invent a new category or use free text:
- SCHEMA_MISMATCH: a field is missing, renamed, or a schema/format change broke parsing
- TYPE_ERROR: a value has the wrong type (e.g. expected a number, got a string)
- MISSING_IMPORT: a dependency or module failed to load
- TIMEOUT: a downstream call took too long / didn't respond in time
- CONNECTION_ERROR: a downstream service refused or dropped the connection
- RESOURCE_ERROR: the worker ran out of memory or another resource

Return ONLY valid JSON in this exact format, no other text:
{{"root_cause": "string", "fix_type": "SCHEMA_MISMATCH" | "TYPE_ERROR" | "MISSING_IMPORT" | "TIMEOUT" | "CONNECTION_ERROR" | "RESOURCE_ERROR", "affected_field": "string", "confidence": 0.0}}"""

    def diagnose(self, loop_event: dict, log_lines: list) -> dict:
        error_signature = loop_event.get("error_hash", "")
        cache_key = self._cache_key(log_lines, error_signature)

        cached = self.diagnosis_cache.get(cache_key)
        if cached is not None:
            if cached.get("fallback_origin") in ("nemotron", "groq"):
                token_counter.record_cache_hit_savings("TriageAgent", cached["fallback_origin"].capitalize())
            return cached

        prompt = self.build_prompt(loop_event, log_lines)

        # Primary: Nemotron — also skipped once its hourly token budget is
        # exhausted (Day 12: soft-limit enforcement), same idea as the
        # circuit breaker but for cost instead of failures.
        if self.circuit_breaker.is_closed() and not token_counter.is_over_budget("TriageAgent", "Nemotron"):
            try:
                raw = self.nemotron_client.chat(prompt)
                result = repair_json(raw)
                result["fallback_used"] = False
                self.circuit_breaker.record_success()
                circuit_registry.get("Nemotron").record_success()  # NEW
                self.diagnosis_cache.set(cache_key, result, fallback_origin="nemotron")
                return result
            except Exception as e:
                print(f"[TriageAgent] Nemotron failed, falling back to Groq: {e}")
                self.circuit_breaker.record_failure()
                circuit_registry.get("Nemotron").record_failure(reason=str(e))  # NEW

        try:
            raw = self.groq_client.chat(prompt)
            result = repair_json(raw)
            result["fallback_used"] = True
            result["fallback_origin"] = "groq"
            circuit_registry.get("Groq").record_success()  # NEW
            self.diagnosis_cache.set(cache_key, result, fallback_origin="groq")
            return result
        except Exception as e:
            print(f"[TriageAgent] Groq failed too, using rule-based heuristic: {e}")
            circuit_registry.get("Groq").record_failure(reason=str(e))  # NEW

        # Fallback 2 (last resort): rule-based heuristic — zero API cost, always works
        result = self.rule_based_heuristic.classify(log_lines)
        self.diagnosis_cache.set(cache_key, result, fallback_origin="rule_based_heuristic")
        return result
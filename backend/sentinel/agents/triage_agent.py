# backend/sentinel/agents/triage_agent.py
"""
Triage Agent — Root Cause Analysis
Day 2: LoopEvent + log lines -> structured JSON diagnosis.
Day 4: DiagnosisCache wired in (30 min TTL, fallback_origin tracking).
Primary: Nemotron. Fallback 1: Groq. Fallback 2: rule-based heuristic (Day 3+ TODO).
"""

import hashlib
import os

import httpx

from sentinel.cache.diagnosis_cache import DiagnosisCache
from sentinel.fallback.circuit_breaker import CircuitBreaker
from sentinel.fallback.json_repair import repair_json


class NemotronClient:
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
            timeout=25.0,
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]


class GroqClient:
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
            timeout=15.0,
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]


class TriageAgent:
    def __init__(self):
        self.nemotron_client = NemotronClient()
        self.groq_client = GroqClient()
        self.circuit_breaker = CircuitBreaker(failures=3, timeout=60)
        self.diagnosis_cache = DiagnosisCache(ttl=1800)  # 30 min

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

Return ONLY valid JSON in this exact format, no other text:
{{"root_cause": "string", "fix_type": "string", "affected_field": "string", "confidence": 0.0}}"""

    def diagnose(self, loop_event: dict, log_lines: list) -> dict:
        error_signature = loop_event.get("error_hash", "")
        cache_key = self._cache_key(log_lines, error_signature)

        cached = self.diagnosis_cache.get(cache_key)
        if cached is not None:
            return cached

        prompt = self.build_prompt(loop_event, log_lines)

        # Try Nemotron (primary)
        if self.circuit_breaker.is_closed():
            try:
                raw = self.nemotron_client.chat(prompt)
                result = repair_json(raw)
                result["fallback_used"] = False
                self.circuit_breaker.record_success()
                self.diagnosis_cache.set(cache_key, result, fallback_origin="nemotron")
                return result
            except Exception as e:
                print(f"[TriageAgent] Nemotron failed, falling back to Groq: {e}")
                self.circuit_breaker.record_failure()

        # Fallback 1: Groq
        try:
            raw = self.groq_client.chat(prompt)
            result = repair_json(raw)
            result["fallback_used"] = True
            result["fallback_origin"] = "groq"
            self.diagnosis_cache.set(cache_key, result, fallback_origin="groq")
            return result
        except Exception as e:
            print(f"[TriageAgent] Groq failed too: {e}")

        # Fallback 2: rule-based heuristic — TODO Day 3+
        return {
            "root_cause": "unknown",
            "fix_type": "unknown",
            "affected_field": "unknown",
            "confidence": 0.0,
            "fallback_used": True,
            "fallback_origin": "none_available",
        }
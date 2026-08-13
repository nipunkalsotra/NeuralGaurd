# backend/sentinel/metrics/token_counter.py
"""
Token Counter — Day 12 (Shreshtha).
Tracks real API token usage per agent, per service, per hour, from the
actual `usage` field NIM/Nemotron/Groq responses return (OpenAI-compatible
chat/embeddings APIs report `usage.total_tokens`). Soft-limit enforcement:
once an (agent, service) pair exceeds its hourly budget, callers are
expected to skip straight to the next fallback rather than call it again
this hour (see TriageAgent.diagnose()).

tokens_saved is inherently an estimate on a cache hit — there is no
response to measure tokens from when nothing was called. Estimated using
the last real token cost actually observed for that (agent, service)
pair, which is the best available real signal rather than a made-up
constant.
"""

import time
from collections import defaultdict
from typing import Dict, List, Tuple

DEFAULT_HOURLY_BUDGET = 100_000
DEFAULT_TOKEN_ESTIMATE = 250  # used only if a cache hit occurs before any real call was ever observed


class TokenCounter:
    def __init__(self, hourly_budget: int = DEFAULT_HOURLY_BUDGET):
        self.hourly_budget = hourly_budget
        self._usage: Dict[Tuple[str, str, int], int] = defaultdict(int)
        self._saved: Dict[Tuple[str, str], int] = defaultdict(int)
        self._last_real_cost: Dict[Tuple[str, str], int] = {}

    def _hour_bucket(self) -> int:
        return int(time.time() // 3600)

    def record(self, agent: str, service: str, tokens: int) -> None:
        if tokens <= 0:
            return
        self._usage[(agent, service, self._hour_bucket())] += tokens
        self._last_real_cost[(agent, service)] = tokens

    def record_cache_hit_savings(self, agent: str, service: str) -> None:
        estimate = self._last_real_cost.get((agent, service), DEFAULT_TOKEN_ESTIMATE)
        self._saved[(agent, service)] += estimate

    def usage_this_hour(self, agent: str, service: str) -> int:
        return self._usage.get((agent, service, self._hour_bucket()), 0)

    def is_over_budget(self, agent: str, service: str) -> bool:
        return self.usage_this_hour(agent, service) >= self.hourly_budget

    def total_saved(self) -> int:
        return sum(self._saved.values())

    def all_usage(self) -> List[dict]:
        current_hour = self._hour_bucket()
        return [
            {
                "agent": agent,
                "service": service,
                "hour": hour,
                "tokens": tokens,
                "over_budget": tokens >= self.hourly_budget and hour == current_hour,
            }
            for (agent, service, hour), tokens in self._usage.items()
        ]

    def reset(self) -> None:
        """Test-only: clear all state between test cases."""
        self._usage.clear()
        self._saved.clear()
        self._last_real_cost.clear()


token_counter = TokenCounter()

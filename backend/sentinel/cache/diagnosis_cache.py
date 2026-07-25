"""
In-memory diagnosis cache keyed by hash of (log_lines + error_signature).
Used by Triage Agent to avoid redundant Nemotron/Groq calls. TTL: 30 min.
"""

import time


class DiagnosisCache:
    def __init__(self, ttl: int = 1800):
        self.ttl = ttl
        self._store = {}  # key -> (value, expires_at, fallback_origin)

    def get(self, key: str):
        entry = self._store.get(key)
        if entry is None:
            return None
        value, expires_at, _ = entry
        if time.time() > expires_at:
            del self._store[key]
            return None
        return value

    def set(self, key: str, value, fallback_origin: str = "nemotron"):
        self._store[key] = (value, time.time() + self.ttl, fallback_origin)
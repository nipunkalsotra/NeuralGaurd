# backend/sentinel/cache/embedding_cache.py
"""
In-memory embedding cache keyed by content hash, TTL-based.
Tracks fallback_origin so the dashboard can show where each embedding came from.
"""

import time


class EmbeddingCache:
    def __init__(self, ttl: int = 3600):
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

    def set(self, key: str, value, fallback_origin: str = "NIM"):
        self._store[key] = (value, time.time() + self.ttl, fallback_origin)
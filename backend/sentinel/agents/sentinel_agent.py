# backend/sentinel/agents/sentinel_agent.py
"""
Sentinel Agent — Loop Detection
Day 1 Scaffold: fallback structure only (NIM -> sentence-transformers -> hash).
Full detect_loop() logic with cosine similarity is a Day 2 task.
"""

import hashlib
import time
from collections import deque
from datetime import datetime, timezone

import httpx
from sentence_transformers import SentenceTransformer


class CircuitBreaker:
    """After 3 consecutive failures, opens circuit for 60s."""

    def __init__(self, failures: int = 3, timeout: int = 60):
        self.max_failures = failures
        self.timeout = timeout
        self.failure_count = 0
        self.opened_at = None

    def is_closed(self) -> bool:
        if self.opened_at is None:
            return True
        if time.time() - self.opened_at > self.timeout:
            # half-open: allow a probe
            self.opened_at = None
            self.failure_count = 0
            return True
        return False

    def record_failure(self):
        self.failure_count += 1
        if self.failure_count >= self.max_failures:
            self.opened_at = time.time()

    def record_success(self):
        self.failure_count = 0
        self.opened_at = None


class EmbeddingCache:
    """In-memory cache keyed by content hash, TTL-based."""

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


class NIMEmbeddingClient:
    """Primary embedding source: NVIDIA NIM."""

    def __init__(self):
        import os
        self.api_key = os.getenv("NVIDIA_NIM_API_KEY")
        self.url = "https://integrate.api.nvidia.com/v1/embeddings"
        self.model = "nvidia/llama-nemotron-embed-vl-1b-v2"

    def embed(self, text: str) -> list:
        response = httpx.post(
            self.url,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "input": [text],
                "model": self.model,
                "input_type": "query",
                "modality": "text",
                "encoding_format": "float",
            },
            timeout=10.0,
        )
        response.raise_for_status()
        return response.json()["data"][0]["embedding"]


class SentinelAgent:
    def __init__(self):
        self.nim_client = NIMEmbeddingClient()  # Primary
        self.local_embedder = SentenceTransformer("all-MiniLM-L6-v2")  # Fallback 1
        self.circuit_breaker = CircuitBreaker(failures=3, timeout=60)
        self.embedding_cache = EmbeddingCache(ttl=3600)
        self.windows = {}  # Sliding window per worker, populated on Day 2

    def embed(self, output_text: str) -> list:
        cache_key = hashlib.sha256(output_text.encode()).hexdigest()
        cached = self.embedding_cache.get(cache_key)
        if cached is not None:
            return cached

        # Try NIM (primary)
        if self.circuit_breaker.is_closed():
            try:
                embedding = self.nim_client.embed(output_text)
                self.embedding_cache.set(cache_key, embedding, fallback_origin="NIM")
                self.circuit_breaker.record_success()
                return embedding
            except Exception:
                self.circuit_breaker.record_failure()

        # Fallback 1: sentence-transformers
        try:
            embedding = self.local_embedder.encode(output_text).tolist()
            self.embedding_cache.set(
                cache_key, embedding, fallback_origin="sentence-transformers"
            )
            return embedding
        except Exception:
            pass

        # Fallback 2: hash exact-match (last resort)
        hash_val = int(hashlib.sha256(output_text.encode()).hexdigest(), 16) % (10**8)
        return [float(hash_val)]

    def detect_loop(self, worker_id: str, output_text: str, error_signature: str):
        """
        Sliding window loop detection.
        Day 1: scaffold only. Full implementation (cosine similarity,
        k=3 consecutive check, error signature match) is Day 2.
        """
        window = self.windows.setdefault(worker_id, deque(maxlen=10))
        window.append(
            {
                "output": output_text,
                "embedding": self.embed(output_text),
                "error_signature": error_signature,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )
        # TODO (Day 2): cosine similarity check + LOOP_SUSPECTED event
        return None
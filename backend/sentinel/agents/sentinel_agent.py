# backend/sentinel/agents/sentinel_agent.py
"""
Sentinel Agent — Loop Detection
Day 1 Scaffold: fallback structure (NIM -> sentence-transformers -> hash).
Full detect_loop() logic with cosine similarity is a Day 2 task.
"""

import hashlib
from collections import deque
from datetime import datetime, timezone

import httpx
from sentence_transformers import SentenceTransformer

from sentinel.fallback.circuit_breaker import CircuitBreaker
from sentinel.cache.embedding_cache import EmbeddingCache


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
        self.nim_client = NIMEmbeddingClient()
        self.local_embedder = SentenceTransformer("all-MiniLM-L6-v2")
        self.circuit_breaker = CircuitBreaker(failures=3, timeout=60)
        self.embedding_cache = EmbeddingCache(ttl=3600)
        self.windows = {}

    def embed(self, output_text: str) -> list:
        cache_key = hashlib.sha256(output_text.encode()).hexdigest()
        cached = self.embedding_cache.get(cache_key)
        if cached is not None:
            return cached

        if self.circuit_breaker.is_closed():
            try:
                embedding = self.nim_client.embed(output_text)
                self.embedding_cache.set(cache_key, embedding, fallback_origin="NIM")
                self.circuit_breaker.record_success()
                return embedding
            except Exception as e:
                print(f"[SentinelAgent] NIM embed failed, falling back: {e}")
                self.circuit_breaker.record_failure()

        try:
            embedding = self.local_embedder.encode(output_text).tolist()
            self.embedding_cache.set(
                cache_key, embedding, fallback_origin="sentence-transformers"
            )
            return embedding
        except Exception as e:
            print(f"[SentinelAgent] sentence-transformers failed: {e}")

        hash_val = int(hashlib.sha256(output_text.encode()).hexdigest(), 16) % (10**8)
        return [float(hash_val)]

    def detect_loop(self, worker_id: str, output_text: str, error_signature: str):
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
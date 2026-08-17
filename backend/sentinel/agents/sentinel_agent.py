# backend/sentinel/agents/sentinel_agent.py
"""
Sentinel Agent — Loop Detection
Day 1 Scaffold: fallback structure (NIM -> sentence-transformers -> hash).
Full detect_loop() logic with cosine similarity is a Day 2 task.
"""

# backend/sentinel/agents/sentinel_agent.py
# Add these imports at top, keep everything else from Day 1 as-is

import hashlib
from collections import deque
from datetime import datetime, timezone

import httpx
import numpy as np
from sentence_transformers import SentenceTransformer

from sentinel.fallback.circuit_breaker import circuit_registry
from sentinel.fallback.circuit_breaker import CircuitBreaker
from sentinel.cache.embedding_cache import EmbeddingCache
from sentinel.metrics.token_counter import token_counter


def cosine_similarity(vec_a: list, vec_b: list) -> float:
    a = np.array(vec_a)
    b = np.array(vec_b)
    if a.shape != b.shape:
        # Different embedding sources (e.g. NIM vs hash fallback) produce
        # different dims — can't compare meaningfully, treat as dissimilar.
        return 0.0
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


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
        data = response.json()
        token_counter.record("SentinelAgent", "NIM", data.get("usage", {}).get("total_tokens", 0))
        return data["data"][0]["embedding"]


class SentinelAgent:
    def __init__(self):
        self.nim_client = NIMEmbeddingClient()
        # Lazy-loaded on first actual use in embed()'s fallback path, not
        # here. Constructing SentenceTransformer(...) eagerly meant the
        # backend's ability to even BOOT depended on reaching HuggingFace
        # at process startup — undermining the entire point of this being
        # a *fallback* model, which should only need network reachability
        # when NIM has already failed and it's actually needed. Confirmed
        # live: a container with no route to huggingface.co (DNS failure)
        # crashed on import before the app ever started serving requests.
        self._local_embedder: SentenceTransformer | None = None
        self.circuit_breaker = CircuitBreaker(failures=3, timeout=60)
        self.embedding_cache = EmbeddingCache(ttl=3600)
        self.windows = {}
        # Day 12: which source produced the MOST RECENT embed() call —
        # detect_loop() reads this to attach fallback_origin onto the
        # LOOP_SUSPECTED audit record, which is what drives the Sentinel
        # node's fallback ring on the dashboard. embed()'s own return
        # contract (just the vector) stays unchanged for existing callers.
        self.last_embed_origin = "NIM"
        # Most recent similarity score detect_loop() computed for a given
        # worker, regardless of whether that step actually crossed the
        # LOOP_SUSPECTED threshold — read by fault_injection.py after each
        # detect_loop() call to broadcast a "similarity" envelope, so the
        # dashboard's Similarity Graph has a real per-step trace instead
        # of only ever seeing the final threshold-crossing sample.
        self.last_similarity = None

    def _get_local_embedder(self) -> SentenceTransformer:
        """Constructs (and caches) the sentence-transformers fallback
        model on first real use. Callers must handle this raising — a
        network failure downloading model weights, or a bad local cache,
        should fall through to the next tier ("hash"), not crash."""
        if self._local_embedder is None:
            self._local_embedder = SentenceTransformer("all-MiniLM-L6-v2")
        return self._local_embedder

    def embed(self, output_text: str) -> list:
        cache_key = hashlib.sha256(output_text.encode()).hexdigest()
        cached_entry = self.embedding_cache._store.get(cache_key)
        cached = self.embedding_cache.get(cache_key)
        if cached is not None:
            if cached_entry is not None:
                self.last_embed_origin = cached_entry[2]
            return cached

        if self.circuit_breaker.is_closed():
            try:
                embedding = self.nim_client.embed(output_text)
                self.embedding_cache.set(cache_key, embedding, fallback_origin="NIM")
                self.circuit_breaker.record_success()
                circuit_registry.get("NIM").record_success()  # NEW
                self.last_embed_origin = "NIM"
                return embedding
            except Exception as e:
                print(f"[SentinelAgent] NIM embed failed, falling back: {e}")
                self.circuit_breaker.record_failure()
                circuit_registry.get("NIM").record_failure(reason=str(e))  # NEW

        try:
            embedder = self._get_local_embedder()
            embedding = embedder.encode(output_text).tolist()
            self.embedding_cache.set(
                cache_key, embedding, fallback_origin="sentence-transformers"
            )
            self.last_embed_origin = "sentence-transformers"
            return embedding
        except Exception as e:
            # Covers both "couldn't download/load the model at all" (the
            # lazy-construction case this fix targets) and "model loaded
            # fine but encode() itself failed" — either way, fall through
            # to the hash tier below rather than raising.
            print(f"[SentinelAgent] sentence-transformers failed: {e}")

        self.last_embed_origin = "hash"
        hash_val = int(hashlib.sha256(output_text.encode()).hexdigest(), 16) % (10**8)
        return [float(hash_val)]

    def detect_loop(self, worker_id: str, output_text: str, error_signature: str):
        """
        Sliding window of last N=10 (output, embedding) pairs per worker.
        Trigger LOOP_SUSPECTED when cosine similarity > 0.92 for k=3
        consecutive steps AND error_signature repeats across those steps.
        """
        window = self.windows.setdefault(worker_id, deque(maxlen=10))

        embedding = self.embed(output_text)
        window.append(
            {
                "output": output_text,
                "embedding": embedding,
                "error_signature": error_signature,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )

        if len(window) < 4:
            # need at least 4 samples to compute 3 consecutive similarities
            return None

        window_list = list(window)
        similarities = []
        for i in range(-3, 0):
            sim = cosine_similarity(
                window_list[i - 1]["embedding"], window_list[i]["embedding"]
            )
            similarities.append(sim)

        self.last_similarity = similarities[-1]
        all_similar = all(s > 0.92 for s in similarities)

        last_three_errors = [w["error_signature"] for w in window_list[-3:]]
        error_repeats = len(set(last_three_errors)) == 1

        if all_similar and error_repeats:
            event = {
                "worker_id": worker_id,
                "similarity": similarities[-1],
                "consecutive_count": 3,
                "error_hash": hashlib.sha256(error_signature.encode()).hexdigest(),
                "embedding_vector": embedding,
                "embedding_origin": self.last_embed_origin,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            return event

        return None
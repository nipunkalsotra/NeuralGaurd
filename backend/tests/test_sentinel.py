"""
Sentinel Agent tests.

embed() fallback chain (NIM -> sentence-transformers -> hash) — Day 1.
detect_loop() sliding window + cosine similarity + LOOP_SUSPECTED — Day 2.
Both fully implemented and tested below.
"""

from unittest.mock import patch, MagicMock

import pytest

from sentinel.agents.sentinel_agent import SentinelAgent


@pytest.fixture
def agent():
    with patch("sentinel.agents.sentinel_agent.SentenceTransformer") as mock_st:
        mock_st.return_value.encode.return_value = MagicMock(
            tolist=lambda: [0.1, 0.2, 0.3]
        )
        yield SentinelAgent()


# ── embed() fallback chain — Day 1 ──────────────────────────────────────

def test_embed_nim_success(agent):
    """NIM is primary — if it succeeds, use it and cache with fallback_origin=NIM."""
    with patch.object(agent.nim_client, "embed", return_value=[0.5, 0.6, 0.7]):
        result = agent.embed("test output")
    assert result == [0.5, 0.6, 0.7]

    cache_key = list(agent.embedding_cache._store.keys())[0]
    _, _, origin = agent.embedding_cache._store[cache_key]
    assert origin == "NIM"


def test_embed_nim_fails_falls_back_to_sentence_transformers(agent):
    """NIM down -> sentence-transformers fallback triggers."""
    with patch.object(agent.nim_client, "embed", side_effect=Exception("NIM 429")):
        result = agent.embed("test output")
    assert result == [0.1, 0.2, 0.3]

    cache_key = list(agent.embedding_cache._store.keys())[0]
    _, _, origin = agent.embedding_cache._store[cache_key]
    assert origin == "sentence-transformers"


def test_embed_both_fail_falls_back_to_hash(agent):
    """NIM and sentence-transformers both down -> hash exact-match, last resort."""
    with patch.object(agent.nim_client, "embed", side_effect=Exception("NIM down")):
        with patch.object(
            agent.local_embedder, "encode", side_effect=Exception("model OOM")
        ):
            result = agent.embed("test output")
    assert isinstance(result, list)
    assert len(result) == 1


def test_embed_cache_hit_skips_api_call(agent):
    """Second call with same text should hit cache, not call NIM again."""
    with patch.object(
        agent.nim_client, "embed", return_value=[0.5, 0.6, 0.7]
    ) as mock_nim:
        agent.embed("repeated text")
        agent.embed("repeated text")
    assert mock_nim.call_count == 1


def test_circuit_breaker_opens_after_3_failures(agent):
    """After 3 consecutive NIM failures, circuit opens and skips NIM entirely."""
    with patch.object(agent.nim_client, "embed", side_effect=Exception("NIM down")):
        for i in range(3):
            agent.embed(f"unique text {i}")
    assert agent.circuit_breaker.is_closed() is False


# ── detect_loop() — Day 2 ────────────────────────────────────────────────

def test_detect_loop_nim_up(agent):
    """Mock NIM returns valid embeddings. Inject same-error outputs 4x
    (need 4 samples to compute 3 consecutive similarity comparisons)."""
    similar_embedding = [0.9, 0.9, 0.9]
    with patch.object(agent.nim_client, "embed", return_value=similar_embedding):
        result = None
        for _ in range(4):
            result = agent.detect_loop(
                "worker-1", "Error: Tax_ID missing", "Tax_ID_missing"
            )
    assert result is not None
    assert result["similarity"] > 0.92
    assert result["worker_id"] == "worker-1"


def test_detect_loop_nim_down(agent):
    """NIM down -> sentence-transformers fallback. Loop still detected."""
    with patch.object(agent.nim_client, "embed", side_effect=Exception("NIM 429")):
        result = None
        for _ in range(4):
            result = agent.detect_loop(
                "worker-2", "Error: Tax_ID missing", "Tax_ID_missing"
            )
    assert result is not None
    assert result["similarity"] > 0.92


def test_detect_loop_both_down(agent):
    """NIM and sentence-transformers both down -> hash exact-match fallback."""
    with patch.object(agent.nim_client, "embed", side_effect=Exception("NIM down")):
        with patch.object(
            agent.local_embedder, "encode", side_effect=Exception("model OOM")
        ):
            result = None
            for _ in range(4):
                result = agent.detect_loop(
                    "worker-3", "Error: Tax_ID missing", "Tax_ID_missing"
                )
    assert result is not None
    assert result["similarity"] > 0.92


def test_detect_loop_insufficient_samples_returns_none(agent):
    """Fewer than 4 samples in window -> not enough data, no event yet."""
    with patch.object(agent.nim_client, "embed", return_value=[0.9, 0.9, 0.9]):
        result = agent.detect_loop("worker-4", "Error: X", "error_x")
    assert result is None


def test_detect_loop_different_errors_does_not_trigger(agent):
    """High similarity but error_signature differs each time -> should NOT trigger
    (dual-condition check prevents false positives on legitimately repetitive work)."""
    similar_embedding = [0.9, 0.9, 0.9]
    with patch.object(agent.nim_client, "embed", return_value=similar_embedding):
        result = None
        for i in range(4):
            result = agent.detect_loop(
                "worker-5", "Processing item", f"different_error_{i}"
            )
    assert result is None
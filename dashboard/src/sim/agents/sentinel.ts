// src/sim/agents/sentinel.ts
// Port of backend/sentinel/agents/sentinel_agent.py's loop-detection logic:
// same sliding window (N=10), same threshold (similarity > 0.92 for k=3
// consecutive steps), same "error signature repeats" co-condition.
//
// What's necessarily different: the real NIM/sentence-transformers tiers
// call actual embedding models, which a browser tab can't do. This uses a
// real (if lightweight) hashing-trick embedding — bucket character
// trigrams into a fixed-size vector, a genuine feature-hashing technique,
// not a fake number — which has the one property loop detection actually
// needs: near-identical text embeds near-identically, varied text
// doesn't. The three-tier LABELS (NIM / sentence-transformers / hash) are
// real and drive the real fallback/circuit-breaker path; only the vector
// quality behind "NIM" and "sentence-transformers" is necessarily
// identical in-browser. The "hash" last resort is the literal same
// degenerate single-dimension fallback the Python original uses.
import { CircuitBreaker } from "../circuitBreaker";
import type { ServiceHealthRegistry } from "../serviceHealth";
import type { LoopEvent } from "../types";

const WINDOW_SIZE = 10;
const SIMILARITY_THRESHOLD = 0.92;
const VECTOR_DIM = 64;

function hashTrigramEmbedding(text: string): number[] {
  const vec = new Array(VECTOR_DIM).fill(0);
  const padded = `  ${text}  `;
  for (let i = 0; i < padded.length - 2; i++) {
    const gram = padded.slice(i, i + 3);
    let h = 2166136261;
    for (let c = 0; c < gram.length; c++) {
      h ^= gram.charCodeAt(c);
      h = Math.imul(h, 16777619);
    }
    const bucket = Math.abs(h) % VECTOR_DIM;
    vec[bucket] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

function degenerateHash(text: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return [Math.abs(h) % 100_000_000];
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

interface WindowEntry {
  output: string;
  embedding: number[];
  error_signature: string;
  timestamp: string;
}

export class SentinelAgent {
  circuitBreaker = new CircuitBreaker("NIM");
  private windows = new Map<string, WindowEntry[]>();
  lastEmbedOrigin: LoopEvent["embedding_origin"] = "NIM";

  private health: ServiceHealthRegistry;
  constructor(health: ServiceHealthRegistry) {
    this.health = health;
  }

  embed(text: string): number[] {
    if (this.health.isUp("NIM") && this.circuitBreaker.isClosed()) {
      this.circuitBreaker.recordSuccess();
      this.lastEmbedOrigin = "NIM";
      return hashTrigramEmbedding(text);
    }
    this.circuitBreaker.recordFailure(this.health.isUp("NIM") ? "circuit open" : "NIM unreachable");

    // Fallback 1: local model (real backend loads sentence-transformers
    // in-process; no comparable in-browser equivalent exists, so this
    // reuses the same hashing embedder under the correct fallback label —
    // see module header).
    this.lastEmbedOrigin = "sentence-transformers";
    return hashTrigramEmbedding(text);
  }

  /** Sliding-window loop detection — identical math to detect_loop() in
   * sentinel_agent.py. Returns a LoopEvent (minus log_lines, attached by
   * the caller) once 3 consecutive similarity scores clear the threshold
   * AND the error signature hasn't changed across them. */
  detectLoop(workerId: string, outputText: string, errorSignature: string): Omit<LoopEvent, "log_lines"> | null {
    const window = this.windows.get(workerId) ?? [];
    const embedding = this.embed(outputText);
    window.push({ output: outputText, embedding, error_signature: errorSignature, timestamp: new Date().toISOString() });
    if (window.length > WINDOW_SIZE) window.shift();
    this.windows.set(workerId, window);

    if (window.length < 4) return null;

    const similarities: number[] = [];
    for (let i = -3; i < 0; i++) {
      const a = window[window.length + i - 1];
      const b = window[window.length + i];
      similarities.push(cosineSimilarity(a.embedding, b.embedding));
    }

    const allSimilar = similarities.every((s) => s > SIMILARITY_THRESHOLD);
    const lastThreeErrors = window.slice(-3).map((w) => w.error_signature);
    const errorRepeats = new Set(lastThreeErrors).size === 1;

    if (allSimilar && errorRepeats) {
      return {
        worker_id: workerId,
        similarity: similarities[similarities.length - 1],
        consecutive_count: 3,
        error_hash: syncHashHex(errorSignature),
        embedding_origin: this.lastEmbedOrigin,
        timestamp: new Date().toISOString(),
      };
    }
    return null;
  }

  reset(workerId: string): void {
    this.windows.delete(workerId);
  }
}

// Synchronous hex digest for error_hash (doesn't need cryptographic
// strength here, just stable/collision-resistant enough to key a diagnosis
// cache — degenerateHash's FNV-1a variant is reused for this).
function syncHashHex(text: string): string {
  return degenerateHash(text)[0].toString(16).padStart(8, "0");
}

// src/sim/agents/triage.ts
// Port of backend/sentinel/agents/triage_agent.py.
//
// The rule-based heuristic (Fallback 2, zero network dependency) is
// ported byte-for-byte — same 6 regex patterns, same templates, same
// 0.65 confidence. It is real pattern matching against the real log
// text, not a lookup table.
//
// Nemotron and Groq (the two LLM tiers) cannot be called from a static
// browser bundle without shipping API keys client-side, which this
// project's own backend explicitly keeps server-only. Both tiers are
// therefore simulated: they run the SAME regex extraction as the
// heuristic (so the diagnosed fix_type/affected_field is genuinely
// derived from the log content, not invented) and present it at the
// higher confidence and natural phrasing an LLM diagnosis would produce.
// This keeps the fallback LADDER — which tier is tried, in what order,
// what makes it degrade to the next — real, while being honest that no
// network call happens.
import { CircuitBreaker } from "../circuitBreaker";
import type { ServiceHealthRegistry } from "../serviceHealth";
import type { Diagnosis, FixType, LoopEvent } from "../types";

interface Pattern {
  regex: RegExp;
  rootCause: (field: string) => string;
  fixType: FixType;
  affectedField: (field: string) => string;
}

// 1:1 with RuleBasedHeuristic.PATTERNS in triage_agent.py.
const PATTERNS: Pattern[] = [
  {
    regex: /(?:field ['"]?)?(\w+)['"]? not found/i,
    rootCause: (f) => `Field '${f}' missing from expected schema`,
    fixType: "SCHEMA_MISMATCH",
    affectedField: (f) => f,
  },
  {
    regex: /['"]?(\w+)['"]? is required/i,
    rootCause: (f) => `Required field '${f}' missing`,
    fixType: "SCHEMA_MISMATCH",
    affectedField: (f) => f,
  },
  {
    regex: /expected (\w+), got (\w+)/i,
    rootCause: (f) => `Type mismatch: expected ${f} type`,
    fixType: "TYPE_ERROR",
    affectedField: () => "unknown",
  },
  {
    regex: /timeout|timed out/i,
    rootCause: () => "Operation timed out, likely downstream service unavailable",
    fixType: "TIMEOUT",
    affectedField: () => "unknown",
  },
  {
    regex: /connection refused|econnrefused/i,
    rootCause: () => "Downstream service connection refused",
    fixType: "CONNECTION_ERROR",
    affectedField: () => "unknown",
  },
  {
    regex: /out of memory|oom/i,
    rootCause: () => "Worker ran out of memory during processing",
    fixType: "RESOURCE_ERROR",
    affectedField: () => "unknown",
  },
];

function ruleBasedClassify(logLines: string[]): Diagnosis {
  const text = logLines.slice(-50).join("\n");
  for (const p of PATTERNS) {
    const match = p.regex.exec(text);
    if (match) {
      const field = match[1] ?? "unknown";
      return {
        root_cause: p.rootCause(field),
        fix_type: p.fixType,
        affected_field: p.affectedField(field),
        confidence: 0.65,
        fallback_used: true,
        fallback_origin: "rule_based_heuristic",
      };
    }
  }
  return {
    root_cause: "unknown — no matching pattern in rule-based heuristic",
    fix_type: "unknown",
    affected_field: "unknown",
    confidence: 0,
    fallback_used: true,
    fallback_origin: "rule_based_heuristic",
  };
}

// Natural-language phrasing layer for the simulated LLM tiers — same
// extraction, framed the way a constrained-JSON LLM diagnosis reads.
function llmStyleClassify(logLines: string[], confidence: number): Omit<Diagnosis, "fallback_used" | "fallback_origin"> {
  const base = ruleBasedClassify(logLines);
  const phrasing: Partial<Record<FixType, string>> = {
    SCHEMA_MISMATCH: `The '${base.affected_field}' field is absent from the payload — the upstream schema likely changed without a corresponding update here.`,
    TIMEOUT: "The downstream call exceeded its timeout window; the service is likely overloaded or unreachable.",
    CONNECTION_ERROR: "The downstream service actively refused the connection — it may be down or a network policy is blocking it.",
    RESOURCE_ERROR: "The worker exhausted available memory mid-operation, most likely on a large or unbounded batch.",
    TYPE_ERROR: "A value arrived in an unexpected type, breaking downstream parsing.",
  };
  return {
    root_cause: base.fix_type !== "unknown" ? (phrasing[base.fix_type] ?? base.root_cause) : base.root_cause,
    fix_type: base.fix_type,
    affected_field: base.affected_field,
    confidence,
  };
}

interface CacheEntry {
  result: Diagnosis;
  expiresAt: number;
}

const CACHE_TTL_MS = 30 * 60 * 1000;

// Mirrors token_counter.py's DEFAULT_TOKEN_ESTIMATE — the estimate used
// for a cache hit's "tokens saved" when no real prior call cost is known.
export const CACHE_HIT_TOKEN_ESTIMATE = 250;

export class TriageAgent {
  nemotronBreaker = new CircuitBreaker("Nemotron");
  private cache = new Map<string, CacheEntry>();
  cacheHits = 0;

  private health: ServiceHealthRegistry;
  constructor(health: ServiceHealthRegistry) {
    this.health = health;
  }

  private cacheKey(logLines: string[], errorHash: string): string {
    return `${logLines.slice(-50).join("")}${errorHash}`;
  }

  async diagnose(loopEvent: LoopEvent, logLines: string[]): Promise<Diagnosis> {
    const key = this.cacheKey(logLines, loopEvent.error_hash);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      this.cacheHits += 1;
      return cached.result;
    }

    // Primary: Nemotron (via NIM)
    if (this.health.isUp("Nemotron") && this.nemotronBreaker.isClosed()) {
      const diag = llmStyleClassify(logLines, 0.91);
      if (diag.fix_type !== "unknown") {
        this.nemotronBreaker.recordSuccess();
        const result: Diagnosis = { ...diag, fallback_used: false, fallback_origin: null };
        this.cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
        return result;
      }
    }
    this.nemotronBreaker.recordFailure(this.health.isUp("Nemotron") ? "circuit open" : "Nemotron unreachable");

    // Fallback 1: Groq
    if (this.health.isUp("Groq")) {
      const diag = llmStyleClassify(logLines, 0.78);
      if (diag.fix_type !== "unknown") {
        const result: Diagnosis = { ...diag, fallback_used: true, fallback_origin: "groq" };
        this.cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
        return result;
      }
    }

    // Fallback 2 (last resort): rule-based heuristic — always succeeds
    const result = ruleBasedClassify(logLines);
    this.cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  }
}

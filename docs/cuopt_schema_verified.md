# cuOpt Schema Verification — Day 11

**Owner:** Rashi | **Date:** 2026-08-13

## Status: N/A — no live verification performed

Day 11's guide marks a 30-minute live schema check against
`api.nvidia.com/cuopt/solve` as mandatory, on the assumption that cuOpt
is the live primary solver and a schema drift there would be a Day-13
integration disaster.

That assumption doesn't hold for this build. Per the Day 4-5 decision
already recorded in `docs/api_contracts.md` ("Optimization Agent —
Solver Status"), cuOpt was skipped project-wide before any schema draft
was even written — no stable public endpoint was found (`HTTP 000` on
attempted calls), and the API access this task requires (a working
`CUOPT_API_KEY` against a real NVIDIA cuOpt endpoint) was never
available. There is no `/docs/cuopt_schema.md` draft to verify against
either, for the same reason.

**Why this is genuinely not a gap, not a skipped mandatory task:**
`OptimizationAgent`'s production code path never calls cuOpt at all —
the real chain is OR-Tools (primary) -> greedy round-robin (last
resort), see `sentinel/agents/optimization_agent.py` and
`test_fallback_chains.py::test_optimization_ortools_to_greedy`. A
schema mismatch in an API the code never calls cannot cause a Day-13
integration disaster. `CircuitBreakerPanel.tsx` already renders cuOpt as
a static "Unused" card rather than a live health indicator, consistent
with this.

**If real cuOpt access becomes available later:** re-open this file,
run the guide's `curl` procedure for real, and document the actual
response schema here before wiring `OptimizationAgent` to call it — do
not fabricate a verified schema without a real response to check it
against.

## Fallback-path support (the other half of Rashi's Day-11 task)
Verified alongside Nipun's Day-11 fallback chain suite —
`test_optimization_ortools_to_greedy` (Optimization) and
`test_sentinel_nim_to_sentence_transformers` /
`test_sentinel_sentence_transformers_to_hash` (Sentinel) all pass. See
`docs/api_contracts.md`'s Day 11 status section for the full run.

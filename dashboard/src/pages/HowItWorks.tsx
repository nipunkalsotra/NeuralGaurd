// src/pages/HowItWorks.tsx
import { Link } from "react-router-dom";
import { useScrollReveal } from "../hooks/useScrollReveal";
import Section, { Eyebrow } from "../components/marketing/Section";
import { HeadlineNoiseFilter, Shiny } from "../components/marketing/aura";

const STEPS = [
  {
    n: "01",
    title: "Detect",
    agent: "Sentinel",
    body: "Every worker output is embedded and compared against a sliding window of its last 10 outputs. When cosine similarity clears 0.92 for 3 consecutive steps — and the error signature hasn't changed across them — that's not noise, it's a loop.",
    detail: "Primary: NVIDIA NIM embeddings. Falls back to a local sentence-transformers model, then to a SHA-256 hash comparison if both are unreachable — detection never goes fully dark.",
  },
  {
    n: "02",
    title: "Diagnose",
    agent: "Triage",
    body: "The last 50 log lines are sent to a model constrained to a 6-value fix_type enum — no free text, no guessing at a schema. It returns a root cause, the affected field, and a confidence score.",
    detail: "Primary: Nemotron. Falls back to Groq's Llama 3.3 70B, then to a zero-cost regex-based heuristic that alone catches roughly 60-70% of common patterns.",
  },
  {
    n: "03",
    title: "Decide",
    agent: "Orchestrator",
    body: "Confidence ≥ 0.7 clears the bar for an automatic fix attempt. Below that, the worker escalates to a human immediately — there is no retry loop, no repeated guessing at a diagnosis the system isn't confident in.",
    detail: "This threshold is the one deliberate place the system chooses caution over autonomy.",
  },
  {
    n: "04",
    title: "Remediate",
    agent: "Remediation",
    body: "A targeted patch is generated from the diagnosed fix_type and run against a sandboxed verification service. Verified → the worker resumes. Not verified → straight to escalation, no partial fixes shipped.",
    detail: "Primary: a real NemoClaw CLI sandbox. Falls back to a mock wrapper with an identical HTTP contract — flagged, not hidden.",
  },
  {
    n: "05",
    title: "Reroute",
    agent: "Optimization",
    body: "Dispatched concurrently with diagnosis, not after it. Solves a constrained assignment problem that excludes the failing worker, so overall throughput doesn't collapse while the fix is in flight.",
    detail: "Primary: an OR-Tools ILP solver. Falls back to greedy round-robin — not optimal, but it always produces an assignment.",
  },
  {
    n: "06",
    title: "Report",
    agent: "Orchestrator",
    body: "A Post-Heal report shows real, computed numbers pulled from the same hash-chained audit trail everything else reads from — time to detect, tokens saved by caching, throughput maintained, fixes applied, escalations, fallbacks triggered.",
    detail: "Nothing here is narrative gloss. If a number can't be computed honestly, it's reported as null, not invented.",
  },
];

export default function HowItWorks() {
  const scope = useScrollReveal<HTMLDivElement>();

  return (
    <div ref={scope} className="pt-32">
      <HeadlineNoiseFilter />
      <Section
        eyebrow={<Eyebrow>How it works</Eyebrow>}
        title={<>One healing cycle,<br /><Shiny>start to finish</Shiny></>}
        lede="Six steps. No human in the loop unless confidence genuinely warrants it. Every one of these runs for real on the Control Plane — live backend or in-browser simulator, same behavior."
      />

      <div className="mx-auto max-w-4xl px-6 pb-24">
        <ol className="relative border-l border-border ml-3">
          {STEPS.map((s) => (
            <li key={s.n} data-reveal className="relative pl-10 pb-16 last:pb-0">
              <span className="absolute -left-[9px] top-1 h-4 w-4 rounded-full bg-accent ring-4 ring-canvas" />
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="text-xs font-mono text-text-tertiary">{s.n}</span>
                <h2 className="text-2xl font-semibold text-text-primary">{s.title}</h2>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-surface-2 text-text-tertiary border border-border">{s.agent}</span>
              </div>
              <p className="mt-4 text-text-secondary leading-relaxed max-w-2xl">{s.body}</p>
              <p className="mt-3 text-sm text-text-tertiary leading-relaxed max-w-2xl border-l-2 border-border pl-4">{s.detail}</p>
            </li>
          ))}
        </ol>
      </div>

      <Section align="center" className="pt-0 pb-32">
        <div data-reveal>
          <Link to="/dashboard" className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent-2 transition-all active:scale-95">
            Watch a real cycle run →
          </Link>
        </div>
      </Section>
    </div>
  );
}

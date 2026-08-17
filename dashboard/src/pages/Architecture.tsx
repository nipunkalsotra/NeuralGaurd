// src/pages/Architecture.tsx
import { Link } from "react-router-dom";
import { useScrollReveal } from "../hooks/useScrollReveal";
import Section, { Eyebrow } from "../components/marketing/Section";
import { HeadlineNoiseFilter, Shiny } from "../components/marketing/aura";
import TrustChainDemo from "../components/marketing/TrustChainDemo";
import { VALID_TRANSITIONS } from "../sim/fsm";
import type { WorkerState } from "../sim/types";

const STATE_ORDER: WorkerState[] = ["HEALTHY", "LOOP_SUSPECTED", "DIAGNOSING", "REMEDIATING", "VERIFYING", "RESUMED", "ESCALATED"];

const FALLBACK_MATRIX = [
  { agent: "Sentinel", capability: "Embeddings", primary: "NVIDIA NIM", f1: "sentence-transformers (local)", f2: "SHA-256 hash exact-match" },
  { agent: "Triage", capability: "Diagnosis", primary: "Nemotron", f1: "Groq Llama 3.3 70B", f2: "Rule-based heuristic" },
  { agent: "Optimization", capability: "Reroute", primary: "OR-Tools ILP", f1: "Greedy round-robin", f2: "—" },
  { agent: "Remediation", capability: "Verify", primary: "NemoClaw CLI (real sandbox)", f1: "Mock wrapper", f2: "Escalate to human" },
];

const STACK = [
  { layer: "Backend", items: "Python 3.14, FastAPI, asyncio, httpx, OR-Tools, sentence-transformers, WebSockets" },
  { layer: "Control plane", items: "React 19, Vite, TypeScript, Tailwind CSS v4, Zustand, Framer Motion, GSAP, React Flow, Recharts" },
  { layer: "Simulator", items: "A TypeScript port of the orchestration core — real FSM, real Web Crypto SHA-256 chain, real circuit breakers" },
  { layer: "Wrapper", items: "FastAPI, mode-switches between a real NemoClaw CLI adapter and a mock simulator with an identical HTTP contract" },
];

export default function Architecture() {
  const scope = useScrollReveal<HTMLDivElement>();

  return (
    <div ref={scope} className="pt-32">
      <HeadlineNoiseFilter />
      <Section
        eyebrow={<Eyebrow>Architecture</Eyebrow>}
        title={<>Every diagram here<br /><Shiny>reflects the real code</Shiny></>}
        lede="The state table below is read directly from the same VALID_TRANSITIONS map the orchestrator enforces — not hand-copied prose that can drift from what's actually running."
      />

      {/* FSM */}
      <Section eyebrow={<Eyebrow>Orchestration</Eyebrow>} title="A 7-state finite-state machine">
        <div data-reveal className="liquid-glass overflow-x-auto rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-1/70">
                <th className="text-left px-4 py-3 font-medium text-text-tertiary text-xs uppercase tracking-wider">From state</th>
                <th className="text-left px-4 py-3 font-medium text-text-tertiary text-xs uppercase tracking-wider">Legal transitions</th>
              </tr>
            </thead>
            <tbody>
              {STATE_ORDER.map((state) => (
                <tr key={state} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-text-primary whitespace-nowrap">{state}</td>
                  <td className="px-4 py-3">
                    {VALID_TRANSITIONS[state].length === 0 ? (
                      <span className="text-xs text-text-tertiary italic">terminal — no outgoing transition</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {VALID_TRANSITIONS[state].map((to) => (
                          <span key={to} className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-surface-2 border border-border text-text-secondary">→ {to}</span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Audit chain */}
      <Section eyebrow={<Eyebrow>Audit</Eyebrow>} title="Tamper-evident by construction" lede="Every transition writes previous_hash + this record's content through SHA-256. Mutate anything and the chain fails verification from that point forward — try it below.">
        <div data-reveal>
          <TrustChainDemo />
        </div>
      </Section>

      {/* Fallback matrix */}
      <Section eyebrow={<Eyebrow>Resilience</Eyebrow>} title="Every external dependency has a real fallback ladder" lede="Not a try/catch that gives up — a full second and often third tier, each one visibly different on the Control Plane.">
        <div data-reveal className="liquid-glass overflow-x-auto rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-1/70">
                {["Agent", "Primary", "Fallback 1", "Fallback 2"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-text-tertiary text-xs uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FALLBACK_MATRIX.map((row) => (
                <tr key={row.agent} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-text-primary whitespace-nowrap">{row.agent}</td>
                  <td className="px-4 py-3 text-text-secondary whitespace-nowrap">{row.primary}</td>
                  <td className="px-4 py-3 text-text-secondary whitespace-nowrap">{row.f1}</td>
                  <td className="px-4 py-3 text-text-tertiary whitespace-nowrap">{row.f2}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div data-reveal className="mt-6">
          <Link to="/fallbacks" className="text-sm font-medium text-accent hover:text-accent-2 transition-colors">See it degrade live, interactively →</Link>
        </div>
      </Section>

      {/* Stack */}
      <Section eyebrow={<Eyebrow>Stack</Eyebrow>} title="What it's actually built with">
        <div className="grid sm:grid-cols-2 gap-4">
          {STACK.map((s) => (
            <div key={s.layer} data-reveal className="liquid-glass rounded-xl p-5">
              <div className="text-sm font-semibold text-text-primary">{s.layer}</div>
              <div className="mt-1.5 text-xs text-text-tertiary leading-relaxed">{s.items}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

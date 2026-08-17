// src/pages/About.tsx
import { useScrollReveal } from "../hooks/useScrollReveal";
import Section, { Eyebrow } from "../components/marketing/Section";
import { HeadlineNoiseFilter, Shiny } from "../components/marketing/aura";

const TEAM = [
  {
    name: "Nipun",
    role: "Agent Intelligence & Resilience",
    body: "Designed and built the four autonomous agents — embedding-based loop detection with cosine-similarity windowing, LLM root-cause diagnosis under a constrained output enum, OR-Tools constrained-assignment rerouting — and the 3-tier fallback architecture with circuit breakers behind every external dependency.",
  },
  {
    name: "Shreshtha",
    role: "Orchestration, Infrastructure & Control Plane",
    body: "Built the 7-state FSM orchestrator and concurrent event bus, the tamper-evident SHA-256 TrustChain audit log, the metrics pipeline, the sandboxed verification wrapper service and its deployment, the real-time WebSocket layer, and this entire control-plane interface.",
  },
];

const NOTES = [
  { title: "In-memory by design", body: "Caches, circuit breakers, and token counters reset on process restart. Fine for a single-session demo system; not production-durable — a deliberate scope choice, not an oversight." },
  { title: "cuOpt is skipped", body: "Hosted API access was never confirmed working. OR-Tools — always intended as cuOpt's own fallback — is the practical primary solver instead." },
  { title: "Single-process by design", body: "The backend deliberately runs with one worker — several agents hold in-memory singleton state that multiple processes would silently fork into inconsistent copies." },
];

export default function About() {
  const scope = useScrollReveal<HTMLDivElement>();

  return (
    <div ref={scope} className="pt-32">
      <HeadlineNoiseFilter />
      <Section eyebrow={<Eyebrow>About</Eyebrow>} title={<>Two people,<br /><Shiny>every layer</Shiny></>} lede="NeuralGuard was designed and built end to end by two engineers — no separate design team, no outsourced infrastructure." />

      <Section className="pt-0">
        <div className="grid sm:grid-cols-2 gap-6">
          {TEAM.map((p) => (
            <div key={p.name} data-reveal className="liquid-glass rounded-2xl p-7">
              <div className="h-11 w-11 rounded-full bg-accent/15 border border-accent/30 grid place-items-center text-accent font-semibold">{p.name[0]}</div>
              <h3 className="mt-4 text-lg font-semibold text-text-primary">{p.name}</h3>
              <p className="text-xs uppercase tracking-wider text-accent mt-1">{p.role}</p>
              <p className="mt-4 text-sm text-text-secondary leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow={<Eyebrow>Honest scope</Eyebrow>} title="Documented limitations, not glossed over" lede="Every deliberate scope decision, stated plainly rather than hidden.">
        <div className="space-y-4">
          {NOTES.map((n) => (
            <div key={n.title} data-reveal className="liquid-glass rounded-xl p-5">
              <p className="text-sm font-semibold text-text-primary">{n.title}</p>
              <p className="mt-1.5 text-sm text-text-tertiary leading-relaxed">{n.body}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

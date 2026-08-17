// src/pages/Landing.tsx
// Cinematic landing in the reference design's visual language, carrying
// NeuralGuard's real content. Two sections from that reference were
// deliberately NOT reproduced as specified:
//
//   - The "Trusted by Linear, Vercel, Figma, Stripe…" logo cloud, which
//     would be a fabricated claim that named real companies use this
//     product. Replaced with an honest "Built with" stack strip.
//   - The three named testimonials from invented people at real
//     companies. Replaced with the Resilience section — the actual
//     fallback chains, which is a stronger claim anyway because a
//     visitor can verify it themselves on /fallbacks.
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Search } from "lucide-react";
import { useScrollReveal } from "../hooks/useScrollReveal";
import Section from "../components/marketing/Section";
import ControlPlanePreview from "../components/marketing/ControlPlanePreview";
import {
  HeadlineNoiseFilter,
  WatermarkNoiseFilter,
  Shiny,
  PillButton,
  SectionEyebrow,
  MenuBarStrip,
} from "../components/marketing/aura";

const PROOF = [
  { value: "<1s", label: "To detect a stuck agent", detail: "Cosine similarity across a sliding window — 3 consecutive steps above 0.92" },
  { value: "4", label: "Independent fallback chains", detail: "Every external dependency degrades instead of taking the run down with it" },
  { value: "SHA-256", label: "Hash-chained audit trail", detail: "Every transition, tamper-evident — and verifiable live on this site" },
];

const TRIAGE_CHIPS = ["Constrained fix_type enum", "Confidence threshold 0.7", "Zero-cost heuristic tier", "No retry loops"];

const TRIAGE_BUCKETS = [
  { label: "Auto-remediated", count: 18, color: "#ffffff", items: ["Schema drift — Tax_ID", "Type coercion — amount"] },
  { label: "Rerouted", count: 7, color: "#e5e5e5", items: ["worker-3 excluded", "6 items reassigned"] },
  { label: "Fell back", count: 4, color: "#a3a3a3", items: ["Nemotron → Groq", "NemoClaw → mock wrapper"] },
  { label: "Escalated", count: 2, color: "#525252", items: ["Confidence 0.61 · below threshold"] },
];

const STACK = ["Python 3.14", "FastAPI", "OR-Tools", "React 19", "TypeScript", "Tailwind v4", "GSAP", "WebGL"];

const RESILIENCE = [
  {
    agent: "Sentinel",
    capability: "Embeddings",
    tiers: ["NVIDIA NIM", "sentence-transformers", "SHA-256 hash match"],
    body: "Loop detection never goes fully dark. If the hosted embedding API is unreachable a local model takes over; if that fails too, exact-match hashing still catches verbatim repeats.",
  },
  {
    agent: "Triage",
    capability: "Diagnosis",
    tiers: ["Nemotron", "Groq Llama 3.3 70B", "Rule-based heuristic"],
    body: "The last tier costs nothing and needs no network at all. It alone catches roughly 60–70% of common loop patterns through real regex extraction against the log text.",
  },
  {
    agent: "Remediation",
    capability: "Verification",
    tiers: ["NemoClaw sandbox", "Mock wrapper", "Escalate to human"],
    body: "A patch is never shipped unverified. If the real sandbox is unreachable the mock wrapper takes over — flagged loudly on the dashboard, never silently swapped in.",
  },
];

const PHASES = [
  {
    tier: "Phase 1",
    title: "Shipped",
    desc: "The full healing loop, running end to end today — and simulated in your browser on this very site.",
    status: "Shipped",
    featured: false,
    items: [
      "7-state FSM orchestrator",
      "All four agents, concurrent dispatch",
      "3-tier fallback chains + circuit breakers",
      "SHA-256 hash-chained audit log",
      "Real-time WebSocket control plane",
    ],
  },
  {
    tier: "Phase 2",
    title: "In design",
    desc: "The real gaps found during Phase 1 testing — deferred deliberately rather than rushed in before they were ready.",
    status: "In design",
    featured: true,
    items: [
      "Async LLM + embedding clients",
      "Lazy-loaded local fallback model",
      "Durable persistence for the audit log",
      "Full dashboard component test suite",
      "Per-worker concurrency isolation",
    ],
  },
  {
    tier: "Phase 3",
    title: "Exploring",
    desc: "Out of scope for now, and labelled honestly as such rather than implied to already exist.",
    status: "Exploring",
    featured: false,
    items: [
      "Kubernetes deployment",
      "OAuth2 / authentication",
      "Metrics + distributed tracing",
      "CI/CD pipeline",
      "Real cuOpt integration",
    ],
  },
];

export default function Landing() {
  const scope = useScrollReveal<HTMLDivElement>();

  return (
    <div ref={scope}>
      <HeadlineNoiseFilter />
      <WatermarkNoiseFilter />

      {/* ---------------- HERO ---------------- */}
      <section className="pt-28 md:pt-36 pb-16 text-center flex flex-col items-center px-6">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: "easeOut" }}>
          <SectionEyebrow label="Self-healing agentic infrastructure" tag="Live, no backend" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="mt-8 text-4xl md:text-7xl font-semibold tracking-tight leading-[0.9]"
        >
          <span className="block text-white">Your agents break.</span>
          <span className="block mt-1">
            <Shiny>This heals them.</Shiny>
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mt-8 text-white/60 max-w-lg text-base leading-[1.6]"
        >
          NeuralGuard detects a looping AI worker in under a second, diagnoses the root cause, verifies a patch in a
          sandbox, and reroutes work around the failure — with zero human intervention, and a tamper-evident record of
          every decision it made along the way.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="mt-10 flex flex-col items-center gap-3"
        >
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link to="/dashboard">
              <PillButton>Open the control plane</PillButton>
            </Link>
            <Link to="/how-it-works">
              <PillButton variant="outline">See how it works</PillButton>
            </Link>
          </div>
          <p className="text-xs text-white/40">Runs a real in-browser simulation — no backend required</p>
        </motion.div>
      </section>

      {/* ---------------- MENU BAR STRIP ---------------- */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.9 }}>
        <MenuBarStrip
          items={["Sentinel", "Triage", "Remediation", "Optimization", "Orchestrator"]}
          right={
            <>
              <Search className="w-3.5 h-3.5" strokeWidth={1.5} />
              <span className="font-mono">worker-3 · RESUMED</span>
            </>
          }
        />
      </motion.div>

      {/* ---------------- CONTROL PLANE PREVIEW ---------------- */}
      <div className="max-w-6xl mx-auto px-6 py-16 md:py-24">
        <ControlPlanePreview />
      </div>

      {/* ---------------- PROOF STRIP ---------------- */}
      <Section className="py-14 sm:py-16 border-y border-white/10">
        <div className="grid sm:grid-cols-3 gap-8">
          {PROOF.map((p) => (
            <div key={p.label} data-reveal>
              <div className="text-4xl font-semibold text-white tabular-nums tracking-tight">{p.value}</div>
              <div className="mt-2 text-sm font-medium text-white">{p.label}</div>
              <div className="mt-1 text-xs text-white/40 leading-relaxed">{p.detail}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* ---------------- TRIAGE FEATURE ---------------- */}
      <Section className="py-20 md:py-28">
        <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-start">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <SectionEyebrow label="Triage" tag="AI-native" />
            <h2 className="mt-5 text-3xl md:text-5xl font-semibold tracking-tight leading-[1.02]">
              Diagnose the cause,
              <br />
              not the symptom.
            </h2>
            <p className="mt-6 text-white/60 text-base leading-[1.6] max-w-md">
              Triage reads the real log lines, constrains the model to a six-value fix type, and returns a confidence
              score. Above 0.7 it repairs automatically. Below it, it escalates immediately — no retry loop, no guessing
              at a diagnosis the system isn't sure of.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              {TRIAGE_CHIPS.map((c) => (
                <span key={c} className="text-xs text-white/70 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03]">
                  {c}
                </span>
              ))}
            </div>
          </motion.div>

          <div data-reveal className="liquid-glass rounded-2xl p-5">
            <p className="text-xs text-white/40 mb-4">Last session · 31 incidents handled</p>
            <div className="space-y-3">
              {TRIAGE_BUCKETS.map((b) => (
                <div key={b.label} className="liquid-glass rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: b.color }} />
                    <span className="text-xs font-medium text-white">{b.label}</span>
                    <span className="ml-auto text-xs text-white/40 tabular-nums">{b.count}</span>
                  </div>
                  <div className="mt-2 space-y-1">
                    {b.items.map((it) => (
                      <p key={it} className="text-[11px] text-white/45 font-mono truncate">
                        {it}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ---------------- BUILT WITH ---------------- */}
      <Section className="py-14 md:py-16">
        <p className="text-center text-xs uppercase tracking-widest text-white/40">Built with</p>
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-6">
          {STACK.map((name, i) => (
            <motion.div
              key={name}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05, duration: 0.4 }}
              className="text-center text-sm font-semibold tracking-tight text-white/50 hover:text-white transition-colors"
            >
              {name}
            </motion.div>
          ))}
        </div>
      </Section>

      {/* ---------------- RESILIENCE ---------------- */}
      <Section className="py-20 md:py-28 border-t border-white/10">
        <div className="mb-12 max-w-2xl">
          <SectionEyebrow label="Resilience" tag="4 chains" />
          <h2 data-reveal className="mt-5 text-3xl md:text-5xl font-semibold tracking-tight leading-[1.02]">
            Every dependency has
            <br />
            somewhere to fall.
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {RESILIENCE.map((r) => (
            <figure key={r.agent} data-reveal className="liquid-glass rounded-2xl p-6">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-white">{r.agent}</span>
                <span className="text-[10px] uppercase tracking-wider text-white/40">{r.capability}</span>
              </div>

              <div className="mt-4 space-y-1.5">
                {r.tiers.map((t, i) => (
                  <div key={t} className="flex items-center gap-2 text-[11px] font-mono">
                    <span className={`w-4 shrink-0 ${i === 0 ? "text-state-healthy" : "text-white/30"}`}>
                      {i === 0 ? "●" : "└"}
                    </span>
                    <span className={i === 0 ? "text-white/80" : "text-white/45"}>{t}</span>
                  </div>
                ))}
              </div>

              <figcaption className="mt-5 pt-5 border-t border-white/10 text-sm text-white/60 leading-[1.6]">
                {r.body}
              </figcaption>
            </figure>
          ))}
        </div>

        <div data-reveal className="mt-8">
          <Link to="/fallbacks" className="text-sm font-medium text-cyan-bright hover:text-white transition-colors">
            Kill one yourself and watch it degrade →
          </Link>
        </div>
      </Section>

      {/* ---------------- ROADMAP (cinematic cards) ----------------
          The reference design's pricing treatment, carrying an honest
          roadmap instead of invented tiers. NeuralGuard isn't a paid
          product, so a pricing table would be fiction — but the
          three-card rhythm, watermark and glass all survive intact. */}
      <section className="c3-section">
        <div className="c3-watermark-container">
          <div className="c3-watermark-main">
            <span className="c3-watermark-line-1">Your agents break.</span>
            <span className="c3-watermark-line-2">This heals them.</span>
          </div>
        </div>

        <div className="c3-grid">
          {PHASES.map((p) => (
            <article key={p.tier} className={`c3-card ${p.featured ? "c3-card-featured" : ""}`}>
              <div className="relative">
                <p className="c3-tier-small">{p.tier}</p>
                <p className="c3-tier-large">{p.title}</p>
                <p className="c3-desc">{p.desc}</p>
                <ul className="c3-list">
                  {p.items.map((item) => (
                    <li key={item}>
                      <span className="c3-check">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <span className={`c3-status ${p.status === "Shipped" ? "c3-status-shipped" : ""}`}>{p.status}</span>
            </article>
          ))}
        </div>
      </section>

      {/* ---------------- FINAL CTA ---------------- */}
      <Section className="py-20 md:py-32">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="liquid-glass relative overflow-hidden rounded-3xl px-8 py-16 md:py-24 text-center"
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(600px circle at 50% 0%, rgba(255,255,255,0.15), transparent 70%)",
              opacity: 0.3,
            }}
          />
          <div className="relative">
            <h2 className="text-4xl md:text-6xl font-semibold tracking-tight leading-[1.02]">
              Stop babysitting
              <br />
              your agents.
            </h2>
            <p className="mt-6 text-white/60 max-w-md mx-auto text-sm leading-[1.6]">
              Break a worker on purpose and watch the whole cycle run — detection, diagnosis, sandboxed repair, reroute,
              and a hash-chained record of all of it.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link to="/dashboard">
                <PillButton>Open the control plane</PillButton>
              </Link>
              <Link to="/architecture">
                <PillButton variant="outline">Read the architecture</PillButton>
              </Link>
            </div>
          </div>
        </motion.div>
      </Section>
    </div>
  );
}

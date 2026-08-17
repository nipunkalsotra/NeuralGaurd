// src/components/marketing/ControlPlanePreview.tsx
// A framed, static preview of the real Control Plane — the marketing
// equivalent of the reference design's inbox mockup, mapped onto this
// product's actual domain:
//
//   sidebar   -> the five agents + their live states
//   list      -> the TrustChain audit stream
//   reader    -> a Triage diagnosis report
//
// Every string here mirrors what the running app genuinely emits (see
// sim/agents/triage.ts's SCHEMA_MISMATCH path and the orchestrator's
// real transition sequence) — it's a faithful still of the product,
// not invented UI.
import { motion } from "framer-motion";
import { Activity, Stethoscope, Wrench, Route, GitBranch, Search, Sparkles, ChevronRight, ShieldCheck } from "lucide-react";
import { WindowChrome } from "./aura";

const AGENTS = [
  { icon: Activity, label: "Sentinel", state: "LOOP_SUSPECTED", color: "var(--color-state-suspected)", active: true },
  { icon: Stethoscope, label: "Triage", state: "DIAGNOSING", color: "var(--color-state-diagnosing)" },
  { icon: Wrench, label: "Remediation", state: "REMEDIATING", color: "var(--color-state-remediating)" },
  { icon: Route, label: "Optimization", state: "REROUTING", color: "var(--color-state-verifying)" },
  { icon: GitBranch, label: "Orchestrator", state: "HEALTHY", color: "var(--color-state-healthy)" },
];

const CHAINS = [
  { label: "NIM", color: "#00d2ff" },
  { label: "Nemotron", color: "#A4F4FD" },
  { label: "OR-Tools", color: "#f59e0b" },
  { label: "NemoClaw", color: "#10b981" },
];

const AUDIT = [
  { agent: "SentinelAgent", event: "LOOP_SUSPECTED", detail: "similarity 0.97 · 3 consecutive steps", time: "12:04:31", unread: true, active: true },
  { agent: "Orchestrator", event: "DIAGNOSIS_STARTED", detail: "worker-3 → DIAGNOSING", time: "12:04:31", unread: true },
  { agent: "TriageAgent", event: "DIAGNOSIS_COMPLETE", detail: "SCHEMA_MISMATCH · confidence 0.91", time: "12:04:32" },
  { agent: "RemediationAgent", event: "REMEDIATION_ATTEMPTED", detail: "patch verified in sandbox", time: "12:04:33" },
  { agent: "OptimizationAgent", event: "OPTIMIZATION_COMPLETE", detail: "reroute · 97% throughput held", time: "12:04:33" },
  { agent: "RemediationAgent", event: "REMEDIATION_SUCCESS", detail: "worker-3 → RESUMED", time: "12:04:34" },
];

export default function ControlPlanePreview() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, delay: 1.1, ease: [0.22, 1, 0.36, 1] }}
      className="relative rounded-2xl overflow-hidden border border-white/10 bg-[#0e1014]/90 backdrop-blur-2xl"
    >
      <WindowChrome title="NeuralGuard — Control Plane" />

      <div className="grid grid-cols-12 h-[520px]">
        {/* ---- Agents sidebar ---- */}
        <div className="col-span-3 border-r border-white/10 bg-black/30 p-4 hidden md:block">
          <button className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-white text-black text-xs font-semibold px-3 py-2">
            <Sparkles size={13} strokeWidth={2} />
            Inject a fault
          </button>

          <div className="mt-5 space-y-0.5">
            {AGENTS.map((a) => {
              const Icon = a.icon;
              return (
                <div
                  key={a.label}
                  className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs ${
                    a.active ? "bg-white/10 text-white" : "text-white/60"
                  }`}
                >
                  <Icon size={13} strokeWidth={1.5} />
                  <span className="flex-1 truncate">{a.label}</span>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: a.color }} />
                </div>
              );
            })}
          </div>

          <div className="mt-6">
            <p className="text-[10px] uppercase tracking-widest text-white/35 mb-2.5">Fallback chains</p>
            <div className="space-y-2">
              {CHAINS.map((c) => (
                <div key={c.label} className="flex items-center gap-2 text-[11px] text-white/55">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.color }} />
                  {c.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ---- Audit stream ---- */}
        <div className="col-span-12 md:col-span-4 border-r border-white/10 flex flex-col">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10 text-white/40">
            <Search size={13} strokeWidth={1.5} />
            <span className="text-xs">Filter audit stream</span>
          </div>
          <div className="flex-1 overflow-hidden">
            {AUDIT.map((m, i) => (
              <div
                key={i}
                className={`px-3 py-2.5 border-b border-white/[0.06] ${m.active ? "bg-white/[0.06]" : ""}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-xs truncate ${m.unread ? "text-white font-semibold" : "text-white/70"}`}>
                    {m.agent}
                  </span>
                  <span className="text-[10px] text-white/35 shrink-0 font-mono">{m.time}</span>
                </div>
                <p className={`text-[11px] mt-0.5 truncate font-mono ${m.unread ? "text-white/80" : "text-white/50"}`}>
                  {m.event}
                </p>
                <p className="text-[11px] text-white/35 truncate mt-0.5">{m.detail}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ---- Triage report ---- */}
        <div className="col-span-5 hidden md:flex flex-col">
          <div className="flex items-center gap-1 px-3 py-2 border-b border-white/10">
            {["Escalate", "Re-run", "Archive"].map((t) => (
              <span key={t} className="text-[11px] text-white/50 px-2 py-1 rounded-md hover:bg-white/5">
                {t}
              </span>
            ))}
            <span className="ml-auto text-[11px] text-white/30 font-mono">#482</span>
          </div>

          <div className="px-4 py-4 overflow-hidden">
            <h3 className="text-sm font-semibold text-white">Field 'Tax_ID' not found in invoice schema</h3>

            <div className="flex items-center gap-2.5 mt-3">
              <div className="w-7 h-7 rounded-full grid place-items-center text-[11px] font-bold text-white bg-gradient-to-br from-[#00d2ff] to-[#0B2551]">
                T
              </div>
              <div className="min-w-0">
                <p className="text-xs text-white">TriageAgent</p>
                <p className="text-[10px] text-white/40">worker-3 · 12:04:32</p>
              </div>
              <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full border border-white/10 text-white/60">
                SCHEMA_MISMATCH
              </span>
            </div>

            {/* Diagnosis summary card */}
            <div className="liquid-glass rounded-lg p-3 mt-4">
              <div className="flex items-center gap-1.5">
                <Sparkles size={12} style={{ color: "#A4F4FD" }} />
                <span className="text-[11px] font-semibold text-white">Diagnosis</span>
              </div>
              <p className="text-[11px] text-white/65 leading-relaxed mt-1.5">
                The 'Tax_ID' field is absent from the payload — the upstream schema likely changed without a
                corresponding update here.
              </p>
            </div>

            <div className="mt-4 space-y-2.5">
              <div>
                <div className="flex items-center justify-between text-[10px] text-white/40 mb-1">
                  <span className="uppercase tracking-wider">Confidence</span>
                  <span className="text-state-healthy font-semibold">91%</span>
                </div>
                <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full bg-state-healthy" style={{ width: "91%" }} />
                </div>
              </div>

              <p className="text-[11px] text-white/50 leading-relaxed pt-1">
                Confidence cleared the 0.7 threshold — remediation attempted automatically, no human escalation.
              </p>
            </div>

            <div className="mt-4 inline-flex items-center gap-1.5 text-[11px] text-white/60 px-2.5 py-1.5 rounded-md border border-white/10 bg-white/[0.03]">
              <Wrench size={11} strokeWidth={1.5} />
              Make field 'Tax_ID' optional with default null
            </div>

            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-state-healthy">
              <ShieldCheck size={12} strokeWidth={1.5} />
              Sandbox verified · worker resumed
              <ChevronRight size={11} strokeWidth={2} className="text-white/25" />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

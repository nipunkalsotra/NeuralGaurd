// src/pages/Fallbacks.tsx
// The most interactive page in the product: a dedicated SentinelSimulator
// instance (independent of whatever DataSource the Control Plane is
// using) that visitors can genuinely break. Kill a service, inject a
// fault, and watch the real fallback ladder — real circuit breakers,
// real degraded diagnosis quality, real mock-mode banners — respond live.
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Cpu, Brain, Route, Zap, Terminal } from "lucide-react";
import { useScrollReveal } from "../hooks/useScrollReveal";
import Section, { Eyebrow } from "../components/marketing/Section";
import { HeadlineNoiseFilter, Shiny } from "../components/marketing/aura";
import { SentinelSimulator } from "../sim";
import type { CircuitStatus, ServiceName, WsEnvelope } from "../sim/types";

const SERVICES: { name: ServiceName; icon: typeof Cpu; owner: string }[] = [
  { name: "NIM", icon: Cpu, owner: "Sentinel — primary embeddings" },
  { name: "Nemotron", icon: Brain, owner: "Triage — primary diagnosis" },
  { name: "cuOpt", icon: Route, owner: "Optimization — constraint solver" },
  { name: "Groq", icon: Zap, owner: "Triage — fallback 1" },
  { name: "NemoClaw", icon: Terminal, owner: "Remediation — sandbox verify" },
];

const STATUS_DOT: Record<string, string> = { CLOSED: "bg-state-healthy", OPEN: "bg-state-escalated", HALF_OPEN: "bg-state-suspected" };

export default function Fallbacks() {
  const scope = useScrollReveal<HTMLDivElement>();
  const [sim] = useState(() => new SentinelSimulator());
  const [circuits, setCircuits] = useState<CircuitStatus[]>(sim.getCircuitStatuses());
  const [log, setLog] = useState<string[]>([]);
  const [injecting, setInjecting] = useState(false);
  const [, forceRerender] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = sim.subscribe((envelope: WsEnvelope) => {
      setCircuits(sim.getCircuitStatuses());
      if (envelope.type === "audit_event") {
        try {
          const rec = JSON.parse(envelope.payload);
          setLog((prev) => [...prev, `${rec.agent_name} → ${rec.to_state}${rec.fallback_origin ? ` (fallback: ${rec.fallback_origin})` : ""}`].slice(-40));
        } catch {
          /* ignore */
        }
      }
      if (envelope.type === "stdout" || envelope.type === "stderr" || envelope.type === "mock_banner") {
        setLog((prev) => [...prev, envelope.payload].slice(-40));
      }
    });
    const unsubHealth = sim.subscribeHealth(() => forceRerender((n) => n + 1));
    return () => {
      unsub();
      unsubHealth();
    };
  }, [sim]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [log]);

  const toggleService = (name: ServiceName) => {
    if (sim.isServiceUp(name)) sim.killService(name);
    else sim.reviveService(name);
  };

  const runFault = async () => {
    setInjecting(true);
    sim.reset("worker-3");
    setLog((prev) => [...prev, "— injecting schema_corruption on worker-3 —"]);
    await sim.injectFault("worker-3", "schema_corruption", { field: "Tax_ID" });
    setInjecting(false);
  };

  return (
    <div ref={scope} className="pt-32">
      <HeadlineNoiseFilter />
      <Section
        eyebrow={<Eyebrow>Fallbacks</Eyebrow>}
        title={<>Kill the primary.<br /><Shiny>It keeps going.</Shiny></>}
        lede="This is a real, independent simulator running in your browser right now — not a recording. Toggle a service off, then inject a fault, and watch the actual fallback ladder + circuit breakers respond."
      />

      <Section className="pt-0">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6">
          <div data-reveal className="liquid-glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-text-primary">Services</p>
              <button
                onClick={runFault}
                disabled={injecting}
                className="text-xs px-3.5 py-2 rounded-lg font-semibold bg-accent text-white hover:bg-accent-2 transition-all active:scale-95 disabled:opacity-50"
              >
                {injecting ? "Injecting…" : "Inject a fault"}
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {SERVICES.map((s) => {
                const status = circuits.find((c) => c.service === s.name);
                const up = sim.isServiceUp(s.name);
                const Icon = s.icon;
                return (
                  <div key={s.name} className="liquid-glass rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon size={16} strokeWidth={1.5} className="text-text-tertiary" />
                        <span className="text-sm font-semibold text-text-primary">{s.name}</span>
                      </div>
                      <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status?.status ?? "CLOSED"]}`} />
                    </div>
                    <p className="mt-1.5 text-[11px] text-text-tertiary">{s.owner}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[10px] font-mono text-text-tertiary">{status?.status ?? "CLOSED"} · {status?.failure_count ?? 0} fail</span>
                      <button
                        onClick={() => toggleService(s.name)}
                        className={`text-[10px] px-2.5 py-1 rounded-full font-semibold transition-colors ${up ? "bg-state-escalated/15 text-state-escalated hover:bg-state-escalated/25" : "bg-state-healthy/15 text-state-healthy hover:bg-state-healthy/25"}`}
                      >
                        {up ? "Kill" : "Revive"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div data-reveal className="liquid-glass rounded-2xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-border text-xs uppercase tracking-wider text-text-tertiary">Live trace</div>
            <div ref={logRef} className="flex-1 overflow-y-auto px-4 py-3 font-mono text-[11px] leading-relaxed h-[360px] text-text-secondary">
              {log.length === 0 && <p className="text-text-tertiary">Kill a service, then inject a fault, to see it here.</p>}
              {log.map((line, i) => (
                <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={line.includes("MOCK") ? "text-state-fallback" : line.includes("fallback") ? "text-state-suspected" : ""}>
                  {line}
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}

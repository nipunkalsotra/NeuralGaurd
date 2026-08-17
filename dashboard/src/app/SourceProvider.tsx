// src/app/SourceProvider.tsx
// Owns the ONE connection (live WebSocket or in-browser simulator) for
// the entire app and feeds every envelope into the store. Probes
// GET /health on mount; live backend wins whenever it's reachable, the
// simulator takes over otherwise — and takes over automatically if a
// backend that answered the probe never actually opens its WebSocket.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LiveBackendSource, probeBackend } from "../data/liveBackendSource";
import { SimulatedSource } from "../data/simulatedSource";
import type { DataSource } from "../data/types";
import { useDashboardStore } from "../store";
import { SourceContext, type SourceContextValue } from "./dataSourceContext";

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) || "http://localhost:8000";
const WS_URL = (import.meta.env.VITE_WS_URL as string | undefined) || BACKEND_URL.replace(/^http/, "ws") + "/ws/stream";
const LIVE_CONNECT_GRACE_MS = 4000;

export function SourceProvider({ children }: { children: ReactNode }) {
  const ingestEnvelope = useDashboardStore((s) => s.ingestEnvelope);
  const setConnection = useDashboardStore((s) => s.setConnection);

  const simulated = useMemo(() => new SimulatedSource(), []);
  const [source, setSource] = useState<DataSource>(simulated);
  const [kind, setKind] = useState<SourceContextValue["kind"]>("connecting");
  const settledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const reachable = await probeBackend(BACKEND_URL);
      if (cancelled) return;

      if (reachable) {
        const live = new LiveBackendSource(WS_URL, BACKEND_URL);
        setSource(live);
        // Grace window: if the WS never actually opens (CORS block, the
        // process died between the health probe and now, …) fall back
        // rather than leaving the UI stuck on "connecting" forever.
        setTimeout(() => {
          if (!cancelled && !settledRef.current) {
            setSource(simulated);
            setKind("simulated");
          }
        }, LIVE_CONNECT_GRACE_MS);
      } else {
        setSource(simulated);
        setKind("simulated");
        settledRef.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setConnection(kind === "connecting" ? "connecting" : source.kind, source.kind === "simulated" || kind !== "connecting");
    const unsubscribe = source.connect(
      (envelope) => ingestEnvelope(envelope),
      (connected) => {
        settledRef.current = true;
        setKind(source.kind);
        setConnection(source.kind, connected);
      }
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const value = useMemo<SourceContextValue>(() => ({ source, kind }), [source, kind]);

  return <SourceContext.Provider value={value}>{children}</SourceContext.Provider>;
}

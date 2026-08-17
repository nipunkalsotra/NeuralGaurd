// src/app/SourceProvider.tsx
// Owns the ONE connection (live WebSocket or in-browser simulator) for
// the entire app and feeds every envelope into the store. Probes
// GET /health on mount; live backend wins whenever it's reachable, the
// simulator takes over otherwise — and takes over automatically if a
// backend that answered the probe never actually opens its WebSocket.
//
// Host override ported from main's ConnectionSettings.tsx (commit
// "Fixed 2 bugs"): Vite only reads VITE_BACKEND_URL/VITE_WS_URL at
// startup, so a deployed dashboard could never be repointed at a
// different backend (e.g. a demo host's LAN IP) without a rebuild.
// `host` is now live state — changing it re-probes and reconnects, and
// persists to localStorage so the choice survives a reload.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LiveBackendSource, probeBackend } from "../data/liveBackendSource";
import { SimulatedSource } from "../data/simulatedSource";
import type { DataSource } from "../data/types";
import { useDashboardStore } from "../store";
import { SourceContext, type SourceContextValue } from "./dataSourceContext";

const ENV_BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) || "http://localhost:8000";
const LIVE_CONNECT_GRACE_MS = 4000;
const HOST_STORAGE_KEY = "neuralguard:backend-host";

function hostFromUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "localhost:8000";
  }
}

function urlsForHost(host: string) {
  return {
    backendUrl: `http://${host}`,
    wsUrl: `ws://${host}/ws/stream`,
  };
}

const DEFAULT_HOST = hostFromUrl(ENV_BACKEND_URL);

export function SourceProvider({ children }: { children: ReactNode }) {
  const ingestEnvelope = useDashboardStore((s) => s.ingestEnvelope);
  const setConnection = useDashboardStore((s) => s.setConnection);

  const [host, setHostState] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_HOST;
    return localStorage.getItem(HOST_STORAGE_KEY) || DEFAULT_HOST;
  });

  const simulated = useMemo(() => new SimulatedSource(), []);
  const [source, setSource] = useState<DataSource>(simulated);
  const [kind, setKind] = useState<SourceContextValue["kind"]>("connecting");
  const settledRef = useRef(false);

  const setHost = useCallback((next: string) => {
    const trimmed = next.trim();
    if (!trimmed) return;
    localStorage.setItem(HOST_STORAGE_KEY, trimmed);
    // Reset to "connecting" here, in the event handler that actually
    // changes the host — not in the effect that reacts to it. Setting
    // state synchronously inside an effect body triggers a cascading
    // extra render; this is a genuine user-triggered state change.
    setKind("connecting");
    setHostState(trimmed);
  }, []);

  const resetHost = useCallback(() => {
    localStorage.removeItem(HOST_STORAGE_KEY);
    setKind("connecting");
    setHostState(DEFAULT_HOST);
  }, []);

  useEffect(() => {
    let cancelled = false;
    settledRef.current = false;

    const { backendUrl, wsUrl } = urlsForHost(host);

    (async () => {
      const reachable = await probeBackend(backendUrl);
      if (cancelled) return;

      if (reachable) {
        const live = new LiveBackendSource(wsUrl, backendUrl);
        setSource(live);
        // Grace window: if the WS never actually opens (CORS block, the
        // process died between the health probe and now, a bad host
        // was typed in, …) fall back rather than leaving the UI stuck
        // on "connecting" forever.
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
  }, [host]);

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

  const value = useMemo<SourceContextValue>(
    () => ({ source, kind, host, defaultHost: DEFAULT_HOST, setHost, resetHost }),
    [source, kind, host, setHost, resetHost]
  );

  return <SourceContext.Provider value={value}>{children}</SourceContext.Provider>;
}

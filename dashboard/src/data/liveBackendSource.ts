// src/data/liveBackendSource.ts
// Wraps exactly ONE WebSocket to /ws/stream (fixes the old 3-socket bug —
// App, AuditLogStream, and SandboxTerminal each opened their own) plus
// REST calls for metrics/circuit-status/audit-log/fault-injection.
import type { CircuitStatusEntry, DataSource, ReportCardMetrics, WsEnvelope } from "./types";

const MAX_RECONNECT_DELAY = 30_000;

export class LiveBackendSource implements DataSource {
  readonly kind = "live" as const;

  private wsUrl: string;
  private backendUrl: string;
  constructor(wsUrl: string, backendUrl: string) {
    this.wsUrl = wsUrl;
    this.backendUrl = backendUrl;
  }

  connect(onEnvelope: (e: WsEnvelope) => void, onStatus?: (connected: boolean) => void): () => void {
    let ws: WebSocket | null = null;
    let cancelled = false;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const open = () => {
      if (cancelled) return;
      ws = new WebSocket(this.wsUrl);

      ws.onopen = () => {
        if (cancelled) return;
        attempt = 0;
        onStatus?.(true);
      };

      ws.onmessage = (e) => {
        try {
          onEnvelope(JSON.parse(e.data) as WsEnvelope);
        } catch {
          // malformed frame — ignore, matches the old per-component guards
        }
      };

      ws.onerror = () => {
        /* onclose follows every onerror in browsers; handle there */
      };

      ws.onclose = () => {
        if (cancelled) return;
        onStatus?.(false);
        const delay = Math.min(1000 * 2 ** attempt, MAX_RECONNECT_DELAY);
        attempt += 1;
        reconnectTimer = setTimeout(open, delay);
      };
    };

    open();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }

  async injectFault(target: string, faultType: string, payload: Record<string, unknown> = {}): Promise<boolean> {
    try {
      const res = await fetch(`${this.backendUrl}/demo/inject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, fault_type: faultType, payload }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async fetchMetrics(): Promise<ReportCardMetrics> {
    const res = await fetch(`${this.backendUrl}/api/metrics`);
    if (!res.ok) throw new Error("metrics fetch failed");
    return res.json();
  }

  async fetchCircuitStatus(): Promise<CircuitStatusEntry[]> {
    const res = await fetch(`${this.backendUrl}/api/circuit-status`);
    if (!res.ok) throw new Error("circuit status fetch failed");
    const data = await res.json();
    return data.services;
  }

  async fetchAuditLog(limit = 200): Promise<unknown[]> {
    const res = await fetch(`${this.backendUrl}/api/audit-log?limit=${limit}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.records ?? [];
  }

  reset(): void {
    // Live backend state resets server-side only (no client-side control).
  }
}

/** Health probe used by SourceProvider to decide live vs. simulated on
 * mount — short timeout so a deployed link with no backend doesn't hang. */
export async function probeBackend(backendUrl: string, timeoutMs = 1800): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${backendUrl}/health`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

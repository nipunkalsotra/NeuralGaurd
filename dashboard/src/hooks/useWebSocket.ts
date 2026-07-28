// src/hooks/useWebSocket.ts
import { useEffect, useRef, useState } from "react";

interface UseWebSocketOptions<T> {
  url?: string;
  onMessage?: (data: T) => void;
  mockFallback?: () => void;
}

const MAX_RECONNECT_DELAY = 30000;

export function useWebSocket<T = unknown>({ url, onMessage, mockFallback }: UseWebSocketOptions<T>) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mockStarted = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    if (!url) {
      mockFallback?.();
      return () => {
        cancelledRef.current = true;
      };
    }

    const connect = () => {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelledRef.current) return;
        setConnected(true);
        reconnectAttempt.current = 0;
        console.log("WebSocket connected:", url);
      };

      ws.onmessage = (e) => {
        try {
          const parsed = JSON.parse(e.data) as T;
          onMessage?.(parsed);
        } catch {
          console.warn("Malformed WebSocket message, ignoring:", e.data);
        }
      };

      ws.onerror = (err) => {
        console.warn("WebSocket error:", err);
      };

      ws.onclose = () => {
        if (cancelledRef.current) return;
        setConnected(false);

        // Start mock on first disconnect, keep retrying real connection in background
        if (!mockStarted.current) {
          mockStarted.current = true;
          mockFallback?.();
        }

        const delay = Math.min(1000 * 2 ** reconnectAttempt.current, MAX_RECONNECT_DELAY);
        reconnectAttempt.current += 1;
        reconnectTimeout.current = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      cancelledRef.current = true;
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return { connected };
}
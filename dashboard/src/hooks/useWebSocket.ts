import { useEffect, useRef, useState, useCallback } from 'react';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface WSMessage {
  type: string;
  event_type: string;
  worker_id: string;
  payload: string;
  timestamp: string;
}

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/stream';
const MAX_RECONNECT_DELAY = 30000;
const MAX_EVENTS = 500; // cap in-memory event history

export function useWebSocket() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [events, setEvents] = useState<WSMessage[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isUnmounting = useRef(false);

  const connect = useCallback(() => {
    setConnectionStatus('connecting');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
      reconnectAttempt.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data);
        setEvents((prev) => {
          const next = [...prev, message];
          return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
        });
      } catch (e) {
        console.error('Failed to parse WS message:', e);
      }
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');

      // Don't reconnect if we intentionally closed this during unmount
      if (isUnmounting.current) return;

      const delay = Math.min(1000 * 2 ** reconnectAttempt.current, MAX_RECONNECT_DELAY);
      reconnectAttempt.current += 1;
      reconnectTimeout.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      setConnectionStatus('error');
    };
  }, []);

  useEffect(() => {
    isUnmounting.current = false;
    connect();

    return () => {
      isUnmounting.current = true;
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const sendMessage = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return {
    connected: connectionStatus === 'connected',
    connectionStatus,
    events,
    sendMessage,
  };
}
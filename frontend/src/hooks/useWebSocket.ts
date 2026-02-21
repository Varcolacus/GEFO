"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ───

export type WSChannel = "trade" | "ports" | "alerts" | "geopolitical" | "vessels" | "system";

export interface WSEvent {
  type: string;        // channel name
  event: string;       // e.g. "trade_flow", "vessel_arrival", …
  id?: string;
  ts: number;
  description?: string;
  [key: string]: unknown;
}

export type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

interface UseWebSocketOptions {
  /** Channels to subscribe to on connect (default: all) */
  channels?: WSChannel[];
  /** Max events to keep in buffer (default: 100) */
  maxEvents?: number;
  /** Auto-reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
  /** Reconnect delay in ms (default: 3000) */
  reconnectDelay?: number;
  /** Enable the connection (default: true) — lets the caller toggle on/off */
  enabled?: boolean;
}

// ─── Hook ───

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    channels = ["trade", "ports", "alerts", "geopolitical"],
    maxEvents = 150,
    autoReconnect = true,
    reconnectDelay = 3000,
    enabled = true,
  } = options;

  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [events, setEvents] = useState<WSEvent[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);
  const [stats, setStats] = useState<{ clients: number } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const channelsRef = useRef(channels);
  channelsRef.current = channels;

  const clearEvents = useCallback(() => setEvents([]), []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // Derive WS URL from the API URL
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const wsUrl = apiUrl.replace(/^http/, "ws") + "/ws/live";

    setConnectionState("connecting");
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setConnectionState("connected");
      // Subscribe to configured channels
      ws.send(JSON.stringify({ action: "subscribe", channels: channelsRef.current }));
    };

    ws.onmessage = (ev) => {
      if (!mountedRef.current) return;
      try {
        const data: WSEvent = JSON.parse(ev.data);

        // Handle system events
        if (data.type === "system") {
          if (data.event === "connected") {
            setClientId(data.client_id as string);
          } else if (data.event === "heartbeat") {
            setStats(data.stats as { clients: number } | null);
          }
          // Don't push system events into the user-visible feed
          return;
        }

        // Skip error messages
        if (data.type === "error") return;

        setEvents((prev) => {
          const next = [data, ...prev];
          return next.length > maxEvents ? next.slice(0, maxEvents) : next;
        });
      } catch {
        // ignore malformed
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setConnectionState("disconnected");
      wsRef.current = null;
      if (autoReconnect && mountedRef.current) {
        reconnectTimer.current = setTimeout(() => {
          if (mountedRef.current) connect();
        }, reconnectDelay);
      }
    };

    ws.onerror = () => {
      if (!mountedRef.current) return;
      setConnectionState("error");
    };
  }, [autoReconnect, reconnectDelay, maxEvents]);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    wsRef.current?.close();
    wsRef.current = null;
    setConnectionState("disconnected");
  }, []);

  // Connect / disconnect based on `enabled`
  useEffect(() => {
    mountedRef.current = true;
    if (enabled) {
      connect();
    } else {
      disconnect();
    }
    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  // Re-subscribe when channels change while connected
  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "subscribe", channels }));
    }
  }, [channels]);

  return {
    connectionState,
    events,
    clientId,
    stats,
    clearEvents,
    connect,
    disconnect,
  };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ───

export type WSChannel = "trade" | "ports" | "alerts" | "geopolitical" | "vessels" | "aircraft" | "system";

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
  const reconnectAttemptsRef = useRef(0);
  const mountedRef = useRef(true);
  const channelsRef = useRef(channels);
  channelsRef.current = channels;

  const clearEvents = useCallback(() => setEvents([]), []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // Derive WS URL — WebSocket must go directly to the backend
    // because Next.js API routes can't proxy WebSocket upgrades.
    // The backend port is injected at build time via NEXT_PUBLIC_WS_PORT (default 8000).
    const backendPort = process.env.NEXT_PUBLIC_WS_PORT || "8000";
    let wsUrl = "";
    if (typeof window !== "undefined") {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      // In Codespaces, replace the frontend port number in the tunnel URL
      const portMatch = host.match(/-(\d+)\.app\.github\.dev/);
      if (portMatch) {
        wsUrl = `${proto}//${host.replace(`-${portMatch[1]}.`, `-${backendPort}.`)}/ws/live`;
      } else {
        // Local development
        wsUrl = `ws://localhost:${backendPort}/ws/live`;
      }
    }
    if (!wsUrl) wsUrl = `ws://localhost:${backendPort}/ws/live`;

    setConnectionState("connecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      setConnectionState("error");
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setConnectionState("connected");
      reconnectAttemptsRef.current = 0;
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
      // Limit reconnect attempts to avoid console spam
      if (autoReconnect && mountedRef.current && (reconnectAttemptsRef.current ?? 0) < 3) {
        reconnectAttemptsRef.current = (reconnectAttemptsRef.current ?? 0) + 1;
        reconnectTimer.current = setTimeout(() => {
          if (mountedRef.current) connect();
        }, reconnectDelay * (reconnectAttemptsRef.current ?? 1));
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

"use client";

import type { ConnectionState } from "@/hooks/useWebSocket";

interface ConnectionStatusProps {
  state: ConnectionState;
  eventCount: number;
  clientId: string | null;
}

export default function ConnectionStatus({ state, eventCount, clientId }: ConnectionStatusProps) {
  const config: Record<ConnectionState, { dot: string; label: string; cls: string }> = {
    connected:    { dot: "bg-green-400 animate-pulse", label: "Live",         cls: "bg-green-500/15 text-green-400 border-green-500/30" },
    connecting:   { dot: "bg-yellow-400 animate-pulse", label: "Connecting",  cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
    disconnected: { dot: "bg-gray-500",                label: "Offline",      cls: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
    error:        { dot: "bg-red-500",                 label: "Error",        cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  };

  const c = config[state];

  return (
    <div
      className={`text-xs px-3 py-1 rounded-full border flex items-center gap-1.5 ${c.cls}`}
      title={clientId ? `Client: ${clientId}` : undefined}
    >
      <span className={`w-2 h-2 rounded-full inline-block ${c.dot}`} />
      <span>{c.label}</span>
      {state === "connected" && eventCount > 0 && (
        <span className="text-[9px] opacity-60">({eventCount})</span>
      )}
    </div>
  );
}

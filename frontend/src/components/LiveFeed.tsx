"use client";

import { useState, useMemo } from "react";
import type { WSEvent, ConnectionState } from "@/hooks/useWebSocket";

// ─── Helpers ───

function timeAgo(ts: number): string {
  const diff = Math.max(0, Math.floor((Date.now() / 1000) - ts));
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function channelIcon(type: string): string {
  switch (type) {
    case "trade": return "📦";
    case "ports": return "🚢";
    case "alerts": return "🔔";
    case "geopolitical": return "⚠️";
    default: return "📡";
  }
}

function channelColor(type: string): string {
  switch (type) {
    case "trade": return "text-cyan-400";
    case "ports": return "text-blue-400";
    case "alerts": return "text-amber-400";
    case "geopolitical": return "text-red-400";
    default: return "text-gray-400";
  }
}

function channelBg(type: string): string {
  switch (type) {
    case "trade": return "bg-cyan-500/10 border-cyan-500/20";
    case "ports": return "bg-blue-500/10 border-blue-500/20";
    case "alerts": return "bg-amber-500/10 border-amber-500/20";
    case "geopolitical": return "bg-red-500/10 border-red-500/20";
    default: return "bg-gray-500/10 border-gray-500/20";
  }
}

function severityDot(severity?: string): string {
  switch (severity) {
    case "critical": return "bg-red-500";
    case "high": return "bg-orange-500";
    case "warning": return "bg-amber-400";
    case "info": return "bg-blue-400";
    default: return "bg-gray-400";
  }
}

// ─── Props ───

interface LiveFeedProps {
  events: WSEvent[];
  connectionState: ConnectionState;
  onClose: () => void;
  onClearEvents: () => void;
  onFlyTo?: (lat: number, lon: number) => void;
}

type FilterChannel = "all" | "trade" | "ports" | "alerts" | "geopolitical";

// ─── Component ───

export default function LiveFeed({
  events,
  connectionState,
  onClose,
  onClearEvents,
  onFlyTo,
}: LiveFeedProps) {
  const [filter, setFilter] = useState<FilterChannel>("all");
  const [paused, setPaused] = useState(false);

  const filtered = useMemo(() => {
    const list = filter === "all" ? events : events.filter((e) => e.type === filter);
    return paused ? list : list.slice(0, 80);
  }, [events, filter, paused]);

  // Channel counts
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of events) {
      c[e.type] = (c[e.type] || 0) + 1;
    }
    return c;
  }, [events]);

  const filters: { key: FilterChannel; label: string; icon: string }[] = [
    { key: "all", label: "All", icon: "📡" },
    { key: "trade", label: "Trade", icon: "📦" },
    { key: "ports", label: "Ports", icon: "🚢" },
    { key: "alerts", label: "Alerts", icon: "🔔" },
    { key: "geopolitical", label: "Geo", icon: "⚠️" },
  ];

  return (
    <div className="absolute top-16 right-4 z-[60] w-96 max-h-[80vh] bg-gray-900/95 backdrop-blur-md
                    text-white rounded-xl border border-gray-700 shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            connectionState === "connected" ? "bg-green-400 animate-pulse" :
            connectionState === "connecting" ? "bg-yellow-400 animate-pulse" :
            "bg-red-400"
          }`} />
          <h2 className="text-sm font-bold tracking-wide">Live Feed</h2>
          <span className="text-[10px] text-gray-500">
            {events.length} events
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPaused((v) => !v)}
            className="text-[10px] px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white"
            title={paused ? "Resume" : "Pause"}
          >
            {paused ? "▶" : "⏸"}
          </button>
          <button
            onClick={onClearEvents}
            className="text-[10px] px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white"
            title="Clear"
          >
            🗑️
          </button>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-lg px-1"
          >
            ×
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-3 py-2 border-b border-gray-800 overflow-x-auto">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-[10px] px-2 py-1 rounded-full whitespace-nowrap flex items-center gap-1 transition-colors ${
              filter === f.key
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                : "bg-gray-800 text-gray-500 border border-transparent hover:text-gray-300"
            }`}
          >
            <span>{f.icon}</span>
            <span>{f.label}</span>
            {f.key !== "all" && counts[f.key] ? (
              <span className="ml-0.5 bg-gray-700/80 text-gray-400 rounded-full px-1.5 text-[9px]">
                {counts[f.key]}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-600 text-xs">
            {connectionState !== "connected"
              ? "Connecting to live feed…"
              : "Waiting for events…"}
          </div>
        ) : (
          <div className="divide-y divide-gray-800/50">
            {filtered.map((evt, i) => (
              <div
                key={evt.id || i}
                className={`px-3 py-2.5 hover:bg-gray-800/50 transition-colors cursor-pointer border-l-2 ${channelBg(evt.type)}`}
                onClick={() => {
                  const lat = evt.lat ?? evt.exporter_lat ?? evt.importer_lat;
                  const lon = evt.lon ?? evt.exporter_lon ?? evt.importer_lon;
                  if (onFlyTo && typeof lat === "number" && typeof lon === "number") {
                    onFlyTo(lat as number, lon as number);
                  }
                }}
              >
                <div className="flex items-start gap-2">
                  <span className="text-sm mt-0.5">{channelIcon(evt.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`text-[10px] font-medium uppercase tracking-wider ${channelColor(evt.type)}`}>
                        {evt.type}
                      </span>
                      {typeof evt.severity === "string" && (
                        <span className={`w-1.5 h-1.5 rounded-full ${severityDot(evt.severity)}`} />
                      )}
                      <span className="text-[9px] text-gray-600 ml-auto flex-shrink-0">
                        {timeAgo(evt.ts)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-300 leading-snug truncate">
                      {evt.description || evt.event}
                    </p>
                    {typeof evt.value_usd === "number" && (
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        ${((evt.value_usd as number) / 1e6).toFixed(0)}M
                        {typeof evt.change_pct === "number" && (
                          <span className={`ml-1 ${(evt.change_pct as number) > 0 ? "text-green-400" : "text-red-400"}`}>
                            {(evt.change_pct as number) > 0 ? "+" : ""}{evt.change_pct as number}%
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {paused && (
        <div className="px-3 py-1.5 border-t border-gray-800 bg-amber-500/10">
          <p className="text-[10px] text-amber-400 text-center">
            ⏸ Feed paused — events still arriving in background
          </p>
        </div>
      )}
    </div>
  );
}

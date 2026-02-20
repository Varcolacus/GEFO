"use client";

import { useState, useEffect } from "react";
import {
  fetchIntelligenceDashboard,
  type IntelligenceDashboard,
  type ChokepointStatus,
  type PortStressEntry,
  type TFIICorridor,
  type EnergyExposureEntry,
} from "@/lib/api";

// ─── Utility formatters ───

function fmtUsd(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
}

function stressColor(level: string): string {
  switch (level) {
    case "critical":
      return "text-red-400";
    case "high":
      return "text-orange-400";
    case "elevated":
      return "text-yellow-400";
    case "normal":
      return "text-green-400";
    case "low":
      return "text-gray-400";
    default:
      return "text-gray-300";
  }
}

function stressBg(level: string): string {
  switch (level) {
    case "critical":
      return "bg-red-500/20 border-red-500/40";
    case "high":
      return "bg-orange-500/20 border-orange-500/40";
    case "elevated":
      return "bg-yellow-500/20 border-yellow-500/40";
    case "normal":
      return "bg-green-500/20 border-green-500/40";
    case "low":
      return "bg-gray-500/20 border-gray-500/40";
    default:
      return "bg-gray-500/20 border-gray-500/40";
  }
}

function zBadge(z: number): React.ReactElement {
  const abs = Math.abs(z);
  const color =
    abs > 2
      ? "text-red-400"
      : abs > 1.5
      ? "text-orange-400"
      : abs > 1
      ? "text-yellow-400"
      : "text-green-400";
  return <span className={`font-mono ${color}`}>{z > 0 ? "+" : ""}{z.toFixed(2)}</span>;
}

// ─── Tab Components ───

function ChokepointTab({ data }: { data: ChokepointStatus[] }) {
  return (
    <div className="space-y-2">
      {data.map((cp) => (
        <div
          key={cp.name}
          className={`p-3 rounded-lg border ${stressBg(cp.stress_level)}`}
        >
          <div className="flex justify-between items-start mb-1">
            <h4 className="text-sm font-semibold text-white">{cp.name}</h4>
            <span
              className={`text-xs px-2 py-0.5 rounded-full uppercase font-bold ${stressColor(
                cp.stress_level
              )}`}
            >
              {cp.stress_level}
            </span>
          </div>
          <p className="text-xs text-gray-400 mb-2">{cp.description}</p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <span className="text-gray-500">Density</span>
              <div className="text-white font-medium">{cp.current_density}</div>
            </div>
            <div>
              <span className="text-gray-500">Baseline</span>
              <div className="text-white font-medium">{cp.baseline_mean}</div>
            </div>
            <div>
              <span className="text-gray-500">Z-Score</span>
              <div>{zBadge(cp.z_score)}</div>
            </div>
          </div>
          <div className="flex gap-4 mt-2 text-xs text-gray-400">
            <span>🛢️ Oil: {cp.oil_share_pct}%</span>
            <span>⛽ LNG: {cp.lng_share_pct}%</span>
            <span>🚢 Cap: {cp.capacity_daily_transits}/day</span>
          </div>
          {cp.quarterly.length > 0 && (
            <div className="flex gap-1 mt-2">
              {cp.quarterly.map((q) => (
                <div
                  key={q.quarter}
                  className="flex-1 text-center text-xs bg-gray-800/50 rounded p-1"
                >
                  <div className="text-gray-500">Q{q.quarter}</div>
                  <div className="text-white">{q.density}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PortStressTab({ ports }: { ports: PortStressEntry[] }) {
  return (
    <div className="space-y-2">
      {ports.slice(0, 15).map((p) => (
        <div
          key={p.port_id}
          className={`p-3 rounded-lg border ${stressBg(p.stress_level)}`}
        >
          <div className="flex justify-between items-center mb-1">
            <div>
              <h4 className="text-sm font-semibold text-white">{p.port_name}</h4>
              <span className="text-xs text-gray-400">
                {p.country_iso} · {p.region} · {p.port_type}
              </span>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-white">{p.psi.toFixed(2)}</div>
              <span
                className={`text-xs uppercase font-bold ${stressColor(
                  p.stress_level
                )}`}
              >
                {p.stress_level}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 text-xs mt-2">
            <div>
              <span className="text-gray-500">TEU</span>
              <div className="text-white">{(p.throughput_teu / 1e6).toFixed(1)}M</div>
            </div>
            <div>
              <span className="text-gray-500">Tput Ratio</span>
              <div className="text-white">{p.components.throughput_ratio.toFixed(2)}</div>
            </div>
            <div>
              <span className="text-gray-500">Density</span>
              <div className="text-white">{p.components.density_factor.toFixed(2)}</div>
            </div>
            <div>
              <span className="text-gray-500">Utilization</span>
              <div className="text-white">{p.components.utilization.toFixed(2)}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TFIITab({ corridors }: { corridors: TFIICorridor[] }) {
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-12 gap-1 text-xs text-gray-500 px-2 mb-1">
        <span className="col-span-4">Corridor</span>
        <span className="col-span-2 text-right">Value</span>
        <span className="col-span-2 text-right">TFII</span>
        <span className="col-span-4">Rating</span>
      </div>
      {corridors.slice(0, 20).map((c, i) => (
        <div
          key={`${c.exporter_iso}-${c.importer_iso}`}
          className="grid grid-cols-12 gap-1 text-xs px-2 py-1.5 rounded-md hover:bg-gray-800/50"
        >
          <span className="col-span-4 text-white font-medium">
            <span className="text-gray-500 mr-1">{i + 1}.</span>
            {c.exporter_iso} → {c.importer_iso}
          </span>
          <span className="col-span-2 text-right text-cyan-400">
            {fmtUsd(c.trade_value_usd)}
          </span>
          <span className="col-span-2 text-right font-mono text-white">
            {c.tfii.toFixed(1)}
          </span>
          <span
            className={`col-span-4 text-xs ${
              c.interpretation.includes("high-value")
                ? "text-green-400"
                : c.interpretation.includes("balanced")
                ? "text-yellow-400"
                : "text-red-400"
            }`}
          >
            {c.interpretation}
          </span>
        </div>
      ))}
      {corridors.length > 0 && (
        <div className="mt-3 px-2 text-xs text-gray-500">
          <p className="mb-1">TFII = (Trade Value / Median) ÷ Lane Density × 100</p>
          <p>Higher = more trade per unit of shipping congestion</p>
        </div>
      )}
    </div>
  );
}

function EnergyTab({ countries }: { countries: EnergyExposureEntry[] }) {
  return (
    <div className="space-y-2">
      {countries.slice(0, 15).map((c) => (
        <div
          key={c.iso_code}
          className={`p-3 rounded-lg border ${stressBg(c.risk_level)}`}
        >
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-sm font-semibold text-white">{c.iso_code}</h4>
            <div className="text-right">
              <div className="text-sm font-bold text-white">
                ECEI: {c.ecei.toFixed(3)}
              </div>
              <span
                className={`text-xs uppercase font-bold ${stressColor(
                  c.risk_level === "moderate" ? "elevated" : c.risk_level
                )}`}
              >
                {c.risk_level}
              </span>
            </div>
          </div>
          <div className="text-xs text-gray-400 mb-1">
            Total trade: {fmtUsd(c.total_trade_usd)}
          </div>
          {c.chokepoint_exposure.slice(0, 3).map((cp) => (
            <div
              key={cp.chokepoint}
              className="flex justify-between text-xs py-0.5"
            >
              <span className="text-gray-400">{cp.chokepoint}</span>
              <span className="text-white">{cp.trade_share.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function BaselineTab({
  baselines,
}: {
  baselines: IntelligenceDashboard["baselines"];
}) {
  return (
    <div className="space-y-3">
      {baselines.metrics.map((m) => (
        <div
          key={m.metric}
          className="p-3 rounded-lg border border-gray-700 bg-gray-800/30"
        >
          <h4 className="text-sm font-semibold text-white mb-2">{m.metric}</h4>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-gray-500">Current</span>
              <div className="text-white font-medium">
                {m.metric.includes("Trade")
                  ? fmtUsd(m.current_value)
                  : m.current_value.toFixed(2)}
              </div>
            </div>
            <div>
              <span className="text-gray-500">Baseline (5y)</span>
              <div className="text-white font-medium">
                {m.metric.includes("Trade")
                  ? fmtUsd(m.baseline_mean)
                  : m.baseline_mean.toFixed(2)}
              </div>
            </div>
            <div>
              <span className="text-gray-500">Z-Score</span>
              <div>{zBadge(m.z_score)}</div>
            </div>
            <div>
              <span className="text-gray-500">Trend</span>
              <div className="text-white">
                {m.trend === "increasing"
                  ? "📈 Increasing"
                  : m.trend === "decreasing"
                  ? "📉 Decreasing"
                  : "➡️ Stable"}
              </div>
            </div>
          </div>
          {m.yoy_growth != null && (
            <div className="mt-2 text-xs">
              <span className="text-gray-500">YoY Growth: </span>
              <span
                className={
                  m.yoy_growth > 0 ? "text-green-400" : "text-red-400"
                }
              >
                {m.yoy_growth > 0 ? "+" : ""}
                {m.yoy_growth.toFixed(1)}%
              </span>
            </div>
          )}
          <div
            className={`mt-2 text-xs px-2 py-1 rounded inline-block ${
              m.classification === "normal"
                ? "bg-green-500/20 text-green-400"
                : m.classification === "notable"
                ? "bg-yellow-500/20 text-yellow-400"
                : m.classification === "significant"
                ? "bg-orange-500/20 text-orange-400"
                : "bg-red-500/20 text-red-400"
            }`}
          >
            {m.classification.toUpperCase()}
          </div>
        </div>
      ))}
      <div className="text-xs text-gray-500 p-2">
        <p>Z-Score interpretation:</p>
        <p>|z| &lt; 1.0 → Normal · 1.0–1.5 → Notable · 1.5–2.0 → Significant · &gt;2.0 → Extreme</p>
      </div>
    </div>
  );
}

// ─── Main Intelligence Panel ───

type IntelTab = "chokepoints" | "ports" | "tfii" | "energy" | "baselines";

interface IntelligencePanelProps {
  year: number;
  onClose: () => void;
  onChokepointClick?: (lat: number, lon: number) => void;
}

export default function IntelligencePanel({
  year,
  onClose,
}: IntelligencePanelProps) {
  const [tab, setTab] = useState<IntelTab>("chokepoints");
  const [data, setData] = useState<IntelligenceDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchIntelligenceDashboard(year)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError("Failed to load intelligence data");
          setLoading(false);
          console.error("Intelligence fetch error:", err);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [year]);

  const tabs: { id: IntelTab; label: string; icon: string }[] = [
    { id: "chokepoints", label: "Chokepoints", icon: "⚓" },
    { id: "ports", label: "Port Stress", icon: "🏗️" },
    { id: "tfii", label: "TFII", icon: "📊" },
    { id: "energy", label: "Energy", icon: "⚡" },
    { id: "baselines", label: "Baselines", icon: "📈" },
  ];

  return (
    <div className="absolute top-4 right-4 z-50 w-[420px] max-h-[calc(100vh-6rem)] bg-gray-900/95 backdrop-blur-sm text-white rounded-xl border border-gray-700 shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-400">
            🧠 Intelligence
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">Phase 2 Analytical Engine · {year}</p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors text-lg"
        >
          ✕
        </button>
      </div>

      {/* Alerts Banner */}
      {data && data.alerts.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-700 bg-red-950/30">
          {data.alerts.slice(0, 3).map((a, i) => (
            <div key={i} className="text-xs flex items-start gap-1 py-0.5">
              <span>
                {a.severity === "critical"
                  ? "🔴"
                  : a.severity === "warning"
                  ? "🟠"
                  : "🔵"}
              </span>
              <span className="text-gray-300">{a.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Summary Bar */}
      {data && (
        <div className="grid grid-cols-4 gap-0 text-center text-xs border-b border-gray-700">
          <div className="py-2 border-r border-gray-800">
            <div className="text-white font-bold">{data.chokepoint_monitor.total}</div>
            <div className="text-gray-500">Chokepoints</div>
          </div>
          <div className="py-2 border-r border-gray-800">
            <div className="text-white font-bold">{data.port_stress.total_ports}</div>
            <div className="text-gray-500">Ports</div>
          </div>
          <div className="py-2 border-r border-gray-800">
            <div className="text-white font-bold">{data.port_stress.mean_psi?.toFixed(2)}</div>
            <div className="text-gray-500">Avg PSI</div>
          </div>
          <div className="py-2">
            <div className="text-white font-bold">{data.baselines.summary.anomalies}</div>
            <div className="text-gray-500">Anomalies</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2 text-xs text-center transition-colors ${
              tab === t.id
                ? "text-cyan-400 border-b-2 border-cyan-400 bg-cyan-500/5"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <span className="mr-0.5">{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-gray-700">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="text-center py-12 text-red-400 text-sm">{error}</div>
        )}

        {data && !loading && (
          <>
            {tab === "chokepoints" && (
              <ChokepointTab data={data.chokepoint_monitor.all} />
            )}
            {tab === "ports" && (
              <PortStressTab
                ports={[
                  ...(data.port_stress.most_stressed || []),
                  ...(data.port_stress.least_stressed || []),
                ]}
              />
            )}
            {tab === "tfii" && (
              <TFIITab corridors={data.top_tfii_corridors} />
            )}
            {tab === "energy" && (
              <EnergyTab countries={data.energy_exposure.most_exposed} />
            )}
            {tab === "baselines" && (
              <BaselineTab baselines={data.baselines} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

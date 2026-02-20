"use client";

import { useState, useEffect } from "react";
import {
  fetchAnalyticsDashboard,
  fetchGlobalTrend,
  fetchCountryAnalytics,
  fetchYoYGrowth,
  fetchTopMovers,
  type AnalyticsDashboard,
  type GlobalTrend,
  type CountryAnalyticsResult,
  type YoYGrowthEntry,
  type TopMovers,
  type ForecastPoint,
  type AnomalyEntry,
} from "@/lib/api";

// ─── Utility formatters ───

function fmtUsd(v: number): string {
  if (Math.abs(v) >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
}

function pctColor(v: number): string {
  if (v > 10) return "text-green-400";
  if (v > 0) return "text-green-300";
  if (v > -10) return "text-red-300";
  return "text-red-400";
}

function severityColor(s: string): string {
  switch (s) {
    case "critical": return "text-red-400";
    case "high": return "text-orange-400";
    case "medium": return "text-yellow-400";
    default: return "text-gray-400";
  }
}

function severityBg(s: string): string {
  switch (s) {
    case "critical": return "bg-red-500/20 border-red-500/40";
    case "high": return "bg-orange-500/20 border-orange-500/40";
    case "medium": return "bg-yellow-500/20 border-yellow-500/40";
    default: return "bg-gray-500/20 border-gray-500/40";
  }
}

function trendIcon(dir: string): string {
  return dir === "growing" ? "📈" : dir === "declining" ? "📉" : "➡️";
}

// ─── Mini Sparkline (pure CSS / divs) ───

function Sparkline({ values, color = "cyan" }: { values: number[]; color?: string }) {
  if (!values.length) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  return (
    <div className="flex items-end gap-px h-10">
      {values.map((v, i) => (
        <div
          key={i}
          className={`w-1.5 rounded-t bg-${color}-400/70`}
          style={{ height: `${((v - min) / range) * 100}%`, minHeight: "2px" }}
        />
      ))}
    </div>
  );
}

// ─── Tab: Overview (Dashboard) ───

function OverviewTab({ year }: { year: number }) {
  const [data, setData] = useState<AnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchAnalyticsDashboard(year)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [year]);

  if (loading) return <LoadingSpinner />;
  if (!data) return <EmptyState msg="No analytics data available." />;

  const g = data.global_trend;
  const m = data.top_movers;
  const a = data.anomaly_summary;

  return (
    <div className="space-y-4">
      {/* Global summary cards */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Global Trade" value={g.summary?.latest ? fmtUsd(g.summary.latest) : "—"} />
        <StatCard
          label="Trend"
          value={`${g.trend?.direction ?? "—"}`}
          extra={`R²=${g.trend?.r_squared?.toFixed(2) ?? "—"}`}
        />
        <StatCard label="CAGR" value={g.summary?.cagr != null ? `${g.summary.cagr}%` : "—"} />
        <StatCard
          label="Anomalies"
          value={`${a.total_anomalies}`}
          extra={`${a.critical_anomalies} critical`}
          alert={a.critical_anomalies > 0}
        />
      </div>

      {/* Mini sparkline */}
      {g.values && g.values.length > 0 && (
        <div className="bg-gray-800/50 rounded p-3 border border-gray-700/50">
          <p className="text-xs text-gray-400 mb-1">Global Trade Trend</p>
          <Sparkline values={g.values} />
          <div className="flex justify-between text-[10px] text-gray-500 mt-1">
            <span>{g.labels?.[0]}</span>
            <span>{g.labels?.[g.labels.length - 1]}</span>
          </div>
        </div>
      )}

      {/* Forecast preview */}
      {g.forecast?.predictions && g.forecast.predictions.length > 0 && (
        <div className="bg-gray-800/50 rounded p-3 border border-gray-700/50">
          <p className="text-xs text-gray-400 mb-2">📊 Forecast</p>
          {g.forecast.predictions.map((fc: ForecastPoint, i: number) => (
            <div key={i} className="flex justify-between text-xs py-0.5">
              <span className="text-gray-300">{g.forecast.labels?.[i] ?? `+${i + 1}`}</span>
              <span className="text-cyan-300 font-mono">{fmtUsd(fc.predicted)}</span>
              <span className="text-gray-500 text-[10px]">
                [{fmtUsd(fc.lower)} – {fmtUsd(fc.upper)}]
              </span>
            </div>
          ))}
          <p className="text-[10px] text-gray-500 mt-1">
            Model: {g.forecast.predictions[0]?.model ?? "—"}
          </p>
        </div>
      )}

      {/* Top Gainers */}
      {m.gainers && m.gainers.length > 0 && (
        <div className="bg-gray-800/50 rounded p-3 border border-gray-700/50">
          <p className="text-xs text-gray-400 mb-2">🏆 Top Gainers</p>
          {m.gainers.slice(0, 5).map((g: YoYGrowthEntry) => (
            <div key={g.iso_code} className="flex justify-between text-xs py-0.5">
              <span className="text-gray-200 w-16">{g.iso_code}</span>
              <span className="text-gray-400 truncate flex-1 mx-2">{g.name}</span>
              <span className={`font-mono ${pctColor(g.growth_pct)}`}>
                {g.growth_pct > 0 ? "+" : ""}{g.growth_pct.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Top Losers */}
      {m.losers && m.losers.length > 0 && (
        <div className="bg-gray-800/50 rounded p-3 border border-gray-700/50">
          <p className="text-xs text-gray-400 mb-2">⚠️ Top Losers</p>
          {m.losers.slice(0, 5).map((l: YoYGrowthEntry) => (
            <div key={l.iso_code} className="flex justify-between text-xs py-0.5">
              <span className="text-gray-200 w-16">{l.iso_code}</span>
              <span className="text-gray-400 truncate flex-1 mx-2">{l.name}</span>
              <span className={`font-mono ${pctColor(l.growth_pct)}`}>
                {l.growth_pct > 0 ? "+" : ""}{l.growth_pct.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Anomaly summary */}
      {a.by_country && a.by_country.length > 0 && (
        <div className="bg-gray-800/50 rounded p-3 border border-gray-700/50">
          <p className="text-xs text-gray-400 mb-2">🔍 Anomaly Hotspots</p>
          {a.by_country.slice(0, 5).map((c: { iso_code: string; count: number; critical: number; worst_z: number }) => (
            <div key={c.iso_code} className="flex justify-between text-xs py-0.5">
              <span className="text-gray-200 w-16">{c.iso_code}</span>
              <span className="text-gray-400">{c.count} anomalies</span>
              {c.critical > 0 && <span className="text-red-400">{c.critical} critical</span>}
              <span className="font-mono text-yellow-400">z={c.worst_z}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Country Drill-down ───

function CountryTab() {
  const [iso, setIso] = useState("USA");
  const [direction, setDirection] = useState<"export" | "import" | "total">("export");
  const [data, setData] = useState<CountryAnalyticsResult | null>(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    fetchCountryAnalytics(iso, direction, 3)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-3">
      {/* Search controls */}
      <div className="flex gap-2">
        <input
          type="text"
          value={iso}
          onChange={(e) => setIso(e.target.value.toUpperCase())}
          placeholder="ISO code"
          className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs w-20 text-white"
          maxLength={3}
        />
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as "export" | "import" | "total")}
          className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white"
        >
          <option value="export">Exports</option>
          <option value="import">Imports</option>
          <option value="total">Total</option>
        </select>
        <button
          onClick={load}
          className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs px-3 py-1 rounded"
        >
          Analyze
        </button>
      </div>

      {loading && <LoadingSpinner />}

      {data && !loading && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="Latest" value={fmtUsd(data.summary?.latest ?? 0)} small />
            <StatCard label="Mean" value={fmtUsd(data.summary?.mean ?? 0)} small />
            <StatCard label="CAGR" value={data.summary?.cagr != null ? `${data.summary.cagr}%` : "—"} small />
          </div>

          {/* Trend */}
          {data.trend && (
            <div className="bg-gray-800/50 rounded p-3 border border-gray-700/50">
              <p className="text-xs text-gray-400 mb-1">
                {trendIcon(data.trend.direction)} Trend: {data.trend.direction}
              </p>
              <p className="text-xs text-gray-300">
                Slope: <span className="font-mono text-cyan-300">{fmtUsd(data.trend.slope)}/yr</span>
                {" · "}R² = <span className="font-mono">{data.trend.r_squared?.toFixed(3)}</span>
              </p>
            </div>
          )}

          {/* Historical sparkline */}
          {data.historical && data.historical.values.length > 0 && (
            <div className="bg-gray-800/50 rounded p-3 border border-gray-700/50">
              <p className="text-xs text-gray-400 mb-1">Historical</p>
              <Sparkline values={data.historical.values} />
              <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                <span>{data.historical.labels[0]}</span>
                <span>{data.historical.labels[data.historical.labels.length - 1]}</span>
              </div>
            </div>
          )}

          {/* Forecast */}
          {data.forecast?.predictions && data.forecast.predictions.length > 0 && (
            <div className="bg-gray-800/50 rounded p-3 border border-gray-700/50">
              <p className="text-xs text-gray-400 mb-2">📊 Forecast</p>
              {data.forecast.predictions.map((fc: ForecastPoint, i: number) => (
                <div key={i} className="flex justify-between text-xs py-0.5">
                  <span className="text-gray-300">
                    {data.forecast?.labels?.[i] ?? `+${i + 1}`}
                  </span>
                  <span className="text-cyan-300 font-mono">{fmtUsd(fc.predicted)}</span>
                  <span className="text-gray-500 text-[10px]">
                    [{fmtUsd(fc.lower)} – {fmtUsd(fc.upper)}]
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Anomalies */}
          {data.anomalies && data.anomalies.length > 0 && (
            <div className="bg-gray-800/50 rounded p-3 border border-gray-700/50">
              <p className="text-xs text-gray-400 mb-2">
                🔍 Anomalies ({data.anomalies.length})
              </p>
              {data.anomalies.map((a: AnomalyEntry, i: number) => (
                <div
                  key={i}
                  className={`rounded px-2 py-1 mb-1 border text-xs ${severityBg(a.severity)}`}
                >
                  <div className="flex justify-between">
                    <span className="text-gray-200">{a.label}</span>
                    <span className={severityColor(a.severity)}>
                      {a.type} · z={a.z_score}
                    </span>
                  </div>
                  <div className="text-gray-400 text-[10px]">
                    Actual: {fmtUsd(a.value)} vs Expected: {fmtUsd(a.expected)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Tab: Growth Rankings ───

function GrowthTab({ year }: { year: number }) {
  const [data, setData] = useState<YoYGrowthEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchYoYGrowth(year, 50)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [year]);

  if (loading) return <LoadingSpinner />;
  if (!data.length) return <EmptyState msg="No growth data available." />;

  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-400 mb-2">YoY Export Growth — {year}</p>
      <div className="bg-gray-800/50 rounded border border-gray-700/50">
        {data.map((entry, i) => (
          <div
            key={entry.iso_code}
            className={`flex items-center justify-between px-3 py-1.5 text-xs ${
              i % 2 === 0 ? "" : "bg-gray-700/20"
            }`}
          >
            <span className="text-gray-500 w-6">{i + 1}</span>
            <span className="text-gray-200 w-14">{entry.iso_code}</span>
            <span className="text-gray-400 truncate flex-1 mx-2">{entry.name}</span>
            <span className="text-gray-300 font-mono w-20 text-right mr-3">
              {fmtUsd(entry.current_value)}
            </span>
            <span className={`font-mono w-16 text-right ${pctColor(entry.growth_pct)}`}>
              {entry.growth_pct > 0 ? "+" : ""}
              {entry.growth_pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab: Forecasts (Global) ───

function ForecastTab() {
  const [data, setData] = useState<GlobalTrend | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchGlobalTrend()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;
  if (!data) return <EmptyState msg="No forecast data." />;

  return (
    <div className="space-y-3">
      {/* Historical overview */}
      <div className="bg-gray-800/50 rounded p-3 border border-gray-700/50">
        <p className="text-xs text-gray-400 mb-1">Global Trade History</p>
        {data.values && <Sparkline values={data.values} color="blue" />}
        <div className="flex justify-between text-[10px] text-gray-500 mt-1">
          <span>{data.labels?.[0]}</span>
          <span>{data.labels?.[data.labels.length - 1]}</span>
        </div>
      </div>

      {/* Trend */}
      {data.trend && (
        <div className="bg-gray-800/50 rounded p-3 border border-gray-700/50">
          <p className="text-xs text-gray-400">
            {trendIcon(data.trend.direction)} Direction:{" "}
            <span className="text-white">{data.trend.direction}</span>
          </p>
          <p className="text-xs text-gray-300 mt-1">
            Slope: <span className="font-mono text-cyan-300">{fmtUsd(data.trend.slope)}/yr</span>
            {" · "}R² = <span className="font-mono">{data.trend.r_squared?.toFixed(3)}</span>
          </p>
        </div>
      )}

      {/* Forecast table */}
      {data.forecast?.predictions && (
        <div className="bg-gray-800/50 rounded p-3 border border-gray-700/50">
          <p className="text-xs text-gray-400 mb-2">📊 Multi-year Forecast</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-700">
                <th className="text-left py-1">Year</th>
                <th className="text-right py-1">Predicted</th>
                <th className="text-right py-1">Lower</th>
                <th className="text-right py-1">Upper</th>
              </tr>
            </thead>
            <tbody>
              {data.forecast.predictions.map((fc: ForecastPoint, i: number) => (
                <tr key={i} className="border-b border-gray-800">
                  <td className="py-1 text-gray-300">{data.forecast?.labels?.[i]}</td>
                  <td className="py-1 text-right text-cyan-300 font-mono">{fmtUsd(fc.predicted)}</td>
                  <td className="py-1 text-right text-gray-500 font-mono">{fmtUsd(fc.lower)}</td>
                  <td className="py-1 text-right text-gray-500 font-mono">{fmtUsd(fc.upper)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-gray-500 mt-2">
            Model: {data.forecast.predictions[0]?.model ?? "—"} · 80% confidence interval
          </p>
        </div>
      )}

      {/* Summary stats */}
      {data.summary && (
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="Min" value={fmtUsd(data.summary.min)} small />
          <StatCard label="Max" value={fmtUsd(data.summary.max)} small />
          <StatCard label="Years" value={`${data.summary.total_years}`} small />
          <StatCard label="CAGR" value={data.summary.cagr != null ? `${data.summary.cagr}%` : "—"} small />
        </div>
      )}
    </div>
  );
}

// ─── Shared components ───

function StatCard({
  label,
  value,
  extra,
  alert,
  small,
}: {
  label: string;
  value: string;
  extra?: string;
  alert?: boolean;
  small?: boolean;
}) {
  return (
    <div
      className={`bg-gray-800/50 rounded ${small ? "p-2" : "p-3"} border ${
        alert ? "border-red-500/50" : "border-gray-700/50"
      }`}
    >
      <p className="text-[10px] text-gray-500 uppercase">{label}</p>
      <p className={`${small ? "text-sm" : "text-lg"} font-bold text-white leading-tight`}>
        {value}
      </p>
      {extra && <p className="text-[10px] text-gray-400">{extra}</p>}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="animate-spin rounded-full h-6 w-6 border-2 border-cyan-400 border-t-transparent" />
    </div>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return <p className="text-center text-gray-500 text-xs py-6">{msg}</p>;
}

// ─── Main Panel ───

const TABS = ["Overview", "Country", "Growth", "Forecast"] as const;
type TabName = (typeof TABS)[number];

interface Props {
  year: number;
  onClose: () => void;
}

export default function AnalyticsPanel({ year, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<TabName>("Overview");

  return (
    <div className="absolute top-16 right-4 w-[420px] max-h-[calc(100vh-5rem)] bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          📊 Analytics &amp; Forecasting
        </h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-lg leading-none"
        >
          ×
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 text-xs py-2 transition-colors ${
              activeTab === tab
                ? "text-cyan-400 border-b-2 border-cyan-400"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-gray-700">
        {activeTab === "Overview" && <OverviewTab year={year} />}
        {activeTab === "Country" && <CountryTab />}
        {activeTab === "Growth" && <GrowthTab year={year} />}
        {activeTab === "Forecast" && <ForecastTab />}
      </div>
    </div>
  );
}

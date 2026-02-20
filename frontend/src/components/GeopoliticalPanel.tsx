"use client";

import { useState, useEffect } from "react";
import {
  fetchGeoDashboard,
  fetchSanctionedEntities,
  fetchConflictZones,
  fetchSupplyChains,
  fetchRiskScores,
  type GeoDashboard,
  type SanctionedEntity,
  type ConflictZone,
  type SupplyChainRoute,
  type CountryRiskEntry,
} from "@/lib/api";

// ─── Utility formatters ───

function fmtUsd(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
}

function riskColor(level: string): string {
  switch (level) {
    case "critical": return "text-red-400";
    case "high": return "text-orange-400";
    case "elevated": return "text-yellow-400";
    case "moderate": return "text-blue-400";
    case "low": return "text-green-400";
    default: return "text-gray-300";
  }
}

function riskBg(level: string): string {
  switch (level) {
    case "critical": return "bg-red-500/20 border-red-500/40";
    case "high": return "bg-orange-500/20 border-orange-500/40";
    case "elevated": return "bg-yellow-500/20 border-yellow-500/40";
    case "moderate": return "bg-blue-500/20 border-blue-500/40";
    case "low": return "bg-green-500/20 border-green-500/40";
    default: return "bg-gray-500/20 border-gray-500/40";
  }
}

function severityBg(s: string): string {
  switch (s) {
    case "critical": return "bg-red-500/30 text-red-300";
    case "high": return "bg-orange-500/30 text-orange-300";
    case "moderate": return "bg-yellow-500/30 text-yellow-300";
    case "low": return "bg-green-500/30 text-green-300";
    default: return "bg-gray-500/30 text-gray-300";
  }
}

function zoneTypeIcon(t: string): string {
  switch (t) {
    case "armed_conflict": return "⚔️";
    case "piracy": return "🏴‍☠️";
    case "territorial_dispute": return "🗺️";
    case "civil_unrest": return "🔥";
    default: return "⚠️";
  }
}

// ─── Types ───

type TabKey = "overview" | "risks" | "sanctions" | "conflicts" | "supply";

interface Props {
  year?: number;
  onClose: () => void;
  onFlyTo?: (lat: number, lon: number) => void;
}

// ─── Component ───

export default function GeopoliticalPanel({ year = 2023, onClose, onFlyTo }: Props) {
  const [tab, setTab] = useState<TabKey>("overview");
  const [dashboard, setDashboard] = useState<GeoDashboard | null>(null);
  const [riskEntries, setRiskEntries] = useState<CountryRiskEntry[]>([]);
  const [sanctions, setSanctions] = useState<SanctionedEntity[]>([]);
  const [conflicts, setConflicts] = useState<ConflictZone[]>([]);
  const [supplyChains, setSupplyChains] = useState<SupplyChainRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [sanctionFilter, setSanctionFilter] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [dash, risks, sEntities, czones, chains] = await Promise.all([
          fetchGeoDashboard().catch(() => null),
          fetchRiskScores(year, 50).catch(() => null),
          fetchSanctionedEntities().catch(() => []),
          fetchConflictZones().catch(() => []),
          fetchSupplyChains().catch(() => []),
        ]);
        if (dash) setDashboard(dash);
        if (risks) setRiskEntries(risks.countries);
        setSanctions(sEntities as SanctionedEntity[]);
        setConflicts(czones as ConflictZone[]);
        setSupplyChains(chains as SupplyChainRoute[]);
      } catch {
        setError("Failed to load geopolitical data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [year]);

  const tabs: { key: TabKey; label: string; icon: string }[] = [
    { key: "overview", label: "Overview", icon: "🌐" },
    { key: "risks", label: "Risk Map", icon: "🎯" },
    { key: "sanctions", label: "Sanctions", icon: "🚫" },
    { key: "conflicts", label: "Conflicts", icon: "⚔️" },
    { key: "supply", label: "Supply Chain", icon: "🔗" },
  ];

  const filteredSanctions = sanctionFilter
    ? sanctions.filter((s) => s.sanctioning_body === sanctionFilter)
    : sanctions;

  return (
    <div className="absolute top-4 right-4 z-[9999] w-[440px] max-h-[calc(100vh-2rem)]
                    bg-gray-950/95 backdrop-blur-md border border-gray-700 rounded-xl
                    shadow-2xl shadow-black/50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-white font-semibold text-sm flex items-center gap-2">
            ⚠️ Geopolitical Risk & Sanctions
          </h2>
          <p className="text-gray-500 text-[10px] mt-0.5">
            Risk scoring • Sanctions tracking • Conflict monitoring
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-white text-lg leading-none px-1"
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800 shrink-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 text-[10px] font-medium transition-colors ${
              tab === t.key
                ? "text-cyan-400 border-b-2 border-cyan-400 bg-cyan-500/5"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="overflow-y-auto flex-1 p-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-red-400 text-xs text-center py-8">{error}</div>
        ) : (
          <>
            {tab === "overview" && <OverviewTab dashboard={dashboard} />}
            {tab === "risks" && <RiskMapTab entries={riskEntries} onFlyTo={onFlyTo} />}
            {tab === "sanctions" && (
              <SanctionsTab
                sanctions={filteredSanctions}
                allSanctions={sanctions}
                filter={sanctionFilter}
                onFilter={setSanctionFilter}
              />
            )}
            {tab === "conflicts" && <ConflictsTab zones={conflicts} onFlyTo={onFlyTo} />}
            {tab === "supply" && <SupplyChainTab routes={supplyChains} />}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Overview Tab ───

function OverviewTab({ dashboard }: { dashboard: GeoDashboard | null }) {
  if (!dashboard) return <p className="text-gray-500 text-xs">No data available</p>;

  const ro = dashboard.risk_overview;
  const sa = dashboard.sanctions;
  const cz = dashboard.conflict_zones;
  const sc = dashboard.supply_chain;

  return (
    <div className="space-y-4">
      {/* Risk Distribution */}
      <div>
        <h3 className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-2">
          Global Risk Distribution
        </h3>
        <div className="grid grid-cols-5 gap-1">
          {([
            ["Critical", ro.critical, "bg-red-500"],
            ["High", ro.high, "bg-orange-500"],
            ["Elevated", ro.elevated, "bg-yellow-500"],
            ["Moderate", ro.moderate, "bg-blue-500"],
            ["Low", ro.low, "bg-green-500"],
          ] as [string, number, string][]).map(([label, count, color]) => (
            <div key={label} className="text-center">
              <div className={`${color}/20 rounded-lg py-2`}>
                <div className="text-white font-bold text-sm">{count}</div>
              </div>
              <div className="text-[9px] text-gray-500 mt-1">{label}</div>
            </div>
          ))}
        </div>
        <div className="mt-2 text-center">
          <span className="text-[10px] text-gray-500">
            Avg Composite Risk: <span className="text-cyan-400 font-medium">{ro.avg_composite.toFixed(1)}</span> / 100
          </span>
        </div>
      </div>

      {/* Highest Risk Countries */}
      <div>
        <h3 className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-2">
          Highest Risk Countries
        </h3>
        <div className="space-y-1">
          {ro.top_risk.slice(0, 5).map((c) => (
            <div key={c.iso_code} className={`flex items-center justify-between px-3 py-1.5 rounded-lg border ${riskBg(c.risk_level)}`}>
              <div>
                <span className="text-white text-xs font-medium">{c.name}</span>
                <span className="text-gray-500 text-[10px] ml-1">({c.iso_code})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      c.composite_risk >= 80
                        ? "bg-red-500"
                        : c.composite_risk >= 60
                        ? "bg-orange-500"
                        : c.composite_risk >= 40
                        ? "bg-yellow-500"
                        : "bg-blue-500"
                    }`}
                    style={{ width: `${c.composite_risk}%` }}
                  />
                </div>
                <span className={`text-xs font-bold ${riskColor(c.risk_level)}`}>
                  {c.composite_risk.toFixed(0)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sanctions Summary */}
      <div>
        <h3 className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-2">
          Active Sanctions
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-800/50 rounded-lg p-2 text-center">
            <div className="text-white font-bold text-lg">{sa.total_active}</div>
            <div className="text-[9px] text-gray-500">Total Designations</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-2 text-center">
            <div className="text-white font-bold text-lg">{sa.most_sanctioned_countries.length}</div>
            <div className="text-[9px] text-gray-500">Countries Affected</div>
          </div>
        </div>
        <div className="flex gap-1 mt-2 flex-wrap">
          {Object.entries(sa.by_sanctioning_body).map(([body, count]) => (
            <span key={body} className="text-[9px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
              {body}: {count}
            </span>
          ))}
        </div>
      </div>

      {/* Conflict Zones */}
      <div>
        <h3 className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-2">
          Active Conflict Zones
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-800/50 rounded-lg p-2 text-center">
            <div className="text-white font-bold text-lg">{cz.total_active}</div>
            <div className="text-[9px] text-gray-500">Active Zones</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-2">
            <div className="flex flex-wrap gap-1 justify-center">
              {Object.entries(cz.by_severity).map(([sev, count]) => (
                <span key={sev} className={`text-[9px] px-1.5 py-0.5 rounded ${severityBg(sev)}`}>
                  {sev}: {count}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Supply Chain Vulnerability */}
      <div>
        <h3 className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-2">
          Supply Chain Vulnerability
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-800/50 rounded-lg p-2 text-center">
            <div className="text-white font-bold text-lg">{sc.total_routes}</div>
            <div className="text-[9px] text-gray-500">Routes Monitored</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-2 text-center">
            <div className={`font-bold text-lg ${sc.avg_vulnerability > 60 ? "text-red-400" : sc.avg_vulnerability > 40 ? "text-orange-400" : "text-green-400"}`}>
              {sc.avg_vulnerability.toFixed(0)}
            </div>
            <div className="text-[9px] text-gray-500">Avg Vulnerability</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Risk Map Tab ───

function RiskMapTab({ entries, onFlyTo }: { entries: CountryRiskEntry[]; onFlyTo?: (lat: number, lon: number) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] text-gray-500 mb-3">
        Country risk rankings based on sanctions, conflict exposure, trade dependency, chokepoint vulnerability, and energy risk.
      </p>
      {entries.map((e, i) => (
        <div
          key={e.iso_code}
          className={`px-3 py-2 rounded-lg border cursor-pointer hover:bg-gray-800/50 transition-colors ${riskBg(e.risk_level)}`}
          onClick={() => onFlyTo?.(e.lat, e.lon)}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-600 font-mono w-5">#{i + 1}</span>
              <span className="text-white text-xs font-medium">{e.name}</span>
              <span className="text-gray-600 text-[10px]">{e.iso_code}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`text-[9px] px-1.5 py-0.5 rounded ${severityBg(e.risk_level)}`}>
                {e.risk_level.toUpperCase()}
              </span>
              <span className={`text-sm font-bold ${riskColor(e.risk_level)}`}>
                {e.composite_risk.toFixed(1)}
              </span>
            </div>
          </div>
          {/* Component bars */}
          <div className="grid grid-cols-5 gap-0.5 mt-1">
            {([
              ["SAN", e.scores.sanctions, "bg-red-500"],
              ["CON", e.scores.conflict, "bg-orange-500"],
              ["TRD", e.scores.trade_dependency, "bg-yellow-500"],
              ["CHK", e.scores.chokepoint_vulnerability, "bg-purple-500"],
              ["ENR", e.scores.energy_risk, "bg-cyan-500"],
            ] as [string, number, string][]).map(([label, val, color]) => (
              <div key={label} className="text-center">
                <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${color}`} style={{ width: `${val}%` }} />
                </div>
                <div className="text-[7px] text-gray-600 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {entries.length === 0 && (
        <p className="text-gray-500 text-xs text-center py-8">No risk data available</p>
      )}
    </div>
  );
}

// ─── Sanctions Tab ───

function SanctionsTab({
  sanctions,
  allSanctions,
  filter,
  onFilter,
}: {
  sanctions: SanctionedEntity[];
  allSanctions: SanctionedEntity[];
  filter: string;
  onFilter: (v: string) => void;
}) {
  const bodies = Array.from(new Set(allSanctions.map((s) => s.sanctioning_body)));

  return (
    <div className="space-y-3">
      {/* Filter buttons */}
      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => onFilter("")}
          className={`text-[9px] px-2 py-1 rounded-md border transition-colors ${
            !filter ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" : "bg-gray-800 text-gray-500 border-gray-700"
          }`}
        >
          All ({allSanctions.length})
        </button>
        {bodies.map((b) => (
          <button
            key={b}
            onClick={() => onFilter(b)}
            className={`text-[9px] px-2 py-1 rounded-md border transition-colors ${
              filter === b ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" : "bg-gray-800 text-gray-500 border-gray-700"
            }`}
          >
            {b} ({allSanctions.filter((s) => s.sanctioning_body === b).length})
          </button>
        ))}
      </div>

      {/* Entity list */}
      <div className="space-y-1.5">
        {sanctions.map((s) => (
          <div key={s.id} className="px-3 py-2 rounded-lg bg-gray-800/40 border border-gray-700/50">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[8px] px-1 py-0.5 rounded ${
                    s.entity_type === "country" ? "bg-red-500/20 text-red-400" :
                    s.entity_type === "entity" ? "bg-orange-500/20 text-orange-400" :
                    s.entity_type === "vessel" ? "bg-blue-500/20 text-blue-400" :
                    "bg-gray-500/20 text-gray-400"
                  }`}>
                    {s.entity_type.toUpperCase()}
                  </span>
                  <span className="text-white text-xs">{s.name}</span>
                </div>
                {s.reason && (
                  <p className="text-gray-500 text-[9px] mt-0.5 line-clamp-2">{s.reason}</p>
                )}
              </div>
              <div className="text-right ml-2 shrink-0">
                <div className="text-[8px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">
                  {s.sanctioning_body}
                </div>
                {s.country_iso && (
                  <div className="text-[9px] text-gray-500 mt-0.5">{s.country_iso}</div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1">
              {s.programme && (
                <span className="text-[8px] text-gray-600">{s.programme}</span>
              )}
              {s.date_listed && (
                <span className="text-[8px] text-gray-600 ml-auto">
                  Listed: {new Date(s.date_listed).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      {sanctions.length === 0 && (
        <p className="text-gray-500 text-xs text-center py-8">No sanctions found</p>
      )}
    </div>
  );
}

// ─── Conflicts Tab ───

function ConflictsTab({ zones, onFlyTo }: { zones: ConflictZone[]; onFlyTo?: (lat: number, lon: number) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] text-gray-500 mb-2">
        Active conflict zones, piracy hotspots, and territorial disputes affecting global trade.
      </p>
      {zones.map((z) => (
        <div
          key={z.id}
          className={`px-3 py-2.5 rounded-lg border cursor-pointer hover:bg-gray-800/60 transition-colors ${riskBg(z.severity)}`}
          onClick={() => onFlyTo?.(z.lat, z.lon)}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <span>{zoneTypeIcon(z.zone_type)}</span>
                <span className="text-white text-xs font-medium">{z.name}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[8px] px-1.5 py-0.5 rounded ${severityBg(z.severity)}`}>
                  {z.severity.toUpperCase()}
                </span>
                <span className="text-[9px] text-gray-500">
                  {z.zone_type.replace("_", " ")}
                </span>
                <span className="text-[9px] text-gray-600">
                  {z.radius_km.toFixed(0)} km radius
                </span>
              </div>
            </div>
          </div>
          {/* Affected countries */}
          {z.affected_countries.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {z.affected_countries.map((iso) => (
                <span key={iso} className="text-[8px] px-1 py-0.5 rounded bg-gray-800 text-gray-400">
                  {iso}
                </span>
              ))}
            </div>
          )}
          {/* Affected chokepoints */}
          {z.affected_chokepoints.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {z.affected_chokepoints.map((cp) => (
                <span key={cp} className="text-[8px] px-1 py-0.5 rounded bg-red-900/30 text-red-400">
                  🚢 {cp}
                </span>
              ))}
            </div>
          )}
          {z.start_date && (
            <div className="text-[8px] text-gray-600 mt-1">
              Since {new Date(z.start_date).toLocaleDateString()}
            </div>
          )}
        </div>
      ))}
      {zones.length === 0 && (
        <p className="text-gray-500 text-xs text-center py-8">No active conflict zones</p>
      )}
    </div>
  );
}

// ─── Supply Chain Tab ───

function SupplyChainTab({ routes }: { routes: SupplyChainRoute[] }) {
  const sorted = [...routes].sort((a, b) => b.vulnerability_score - a.vulnerability_score);

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-gray-500 mb-2">
        Critical supply chain routes with vulnerability assessment based on geopolitical risk factors.
      </p>
      {sorted.map((r) => {
        const vulnLevel = r.vulnerability_score >= 70 ? "critical" : r.vulnerability_score >= 50 ? "high" : r.vulnerability_score >= 30 ? "elevated" : "moderate";
        return (
          <div key={r.id} className={`px-3 py-2.5 rounded-lg border ${riskBg(vulnLevel)}`}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <span className="text-white text-xs font-medium">{r.name}</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[9px] text-gray-500">
                    {r.origin_iso} → {r.destination_iso}
                  </span>
                  <span className="text-[9px] text-cyan-500">
                    {r.commodity}
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className={`text-sm font-bold ${riskColor(vulnLevel)}`}>
                  {r.vulnerability_score.toFixed(0)}
                </div>
                <div className="text-[8px] text-gray-600">vulnerability</div>
              </div>
            </div>
            {/* Value */}
            <div className="text-[9px] text-gray-500 mt-1">
              Annual value: <span className="text-gray-300">{fmtUsd(r.annual_value_usd)}</span>
            </div>
            {/* Chokepoints */}
            {r.chokepoints_transit.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {r.chokepoints_transit.map((cp) => (
                  <span key={cp} className="text-[8px] px-1 py-0.5 rounded bg-gray-800 text-gray-400">
                    🚢 {cp}
                  </span>
                ))}
              </div>
            )}
            {/* Risk factors */}
            {r.risk_factors.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {r.risk_factors.map((f, i) => (
                  <span key={i} className="text-[8px] px-1 py-0.5 rounded bg-red-900/20 text-red-400">
                    ⚠ {f}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {routes.length === 0 && (
        <p className="text-gray-500 text-xs text-center py-8">No supply chain data available</p>
      )}
    </div>
  );
}

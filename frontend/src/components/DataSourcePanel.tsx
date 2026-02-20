"use client";

import { useState, useEffect } from "react";
import {
  fetchDataSources,
  fetchDataSourceStats,
  fetchEconomicGroups,
  fetchEconomicGroup,
  type NationalDataSourceInfo,
  type DataSourceStats,
  type EconomicGroupInfo,
  type EconomicGroupDetail,
} from "@/lib/api";

// ─── Helpers ───

function tierColor(tier: string): string {
  switch (tier) {
    case "premium": return "text-yellow-400";
    case "standard": return "text-blue-400";
    case "limited": return "text-gray-400";
    default: return "text-gray-500";
  }
}

function qualityBadge(q: string) {
  const cls =
    q === "excellent" ? "bg-green-500/20 text-green-400" :
    q === "good" ? "bg-blue-500/20 text-blue-400" :
    "bg-orange-500/20 text-orange-400";
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cls}`}>{q}</span>;
}

function formatBadge(fmt: string) {
  const colors: Record<string, string> = {
    sdmx: "bg-purple-500/20 text-purple-400",
    pxweb: "bg-indigo-500/20 text-indigo-400",
    json: "bg-cyan-500/20 text-cyan-400",
    xlsx: "bg-green-500/20 text-green-400",
    csv: "bg-teal-500/20 text-teal-400",
    html_scrape: "bg-orange-500/20 text-orange-400",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${colors[fmt] || "bg-gray-500/20 text-gray-400"}`}>
      {fmt}
    </span>
  );
}

// ─── Sub-views ───

type Tab = "sources" | "groups";

function SourceRow({ s }: { s: NationalDataSourceInfo }) {
  const isBroken = s.circuit_breaker_until && new Date(s.circuit_breaker_until) > new Date();
  return (
    <div className={`p-3 rounded-lg border ${isBroken ? "border-red-500/40 bg-red-900/10" : "border-white/10 bg-white/5"} hover:bg-white/10 transition`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-white/90">{s.country_iso}</span>
            <span className="text-xs text-white/70 truncate">{s.institution}</span>
            <span className={`text-[10px] font-medium ${tierColor(s.tier)}`}>{s.tier.toUpperCase()}</span>
          </div>
          <div className="flex gap-2 mt-1.5 flex-wrap items-center">
            {qualityBadge(s.quality)}
            {s.data_format && formatBadge(s.data_format)}
            <span className="text-[10px] text-white/40">{s.update_frequency}</span>
            {s.auth_required && <span className="text-[10px] text-yellow-500/80">AUTH</span>}
            {isBroken && <span className="text-[10px] text-red-400 font-medium">CIRCUIT BROKEN</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {s.last_fetch_status && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              s.last_fetch_status === "success" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
            }`}>
              {s.last_fetch_status}
            </span>
          )}
          {s.docs_url && (
            <a href={s.docs_url} target="_blank" rel="noopener noreferrer"
               className="text-[10px] text-cyan-400 hover:text-cyan-300 underline">
              docs
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function GroupCard({ group, onClick }: { group: EconomicGroupInfo; onClick: () => void }) {
  const catColors: Record<string, string> = {
    political: "border-blue-500/40",
    economic: "border-yellow-500/40",
    trade: "border-green-500/40",
    regional: "border-purple-500/40",
  };
  return (
    <button onClick={onClick}
      className={`p-3 rounded-lg border ${catColors[group.category] || "border-white/10"} bg-white/5 hover:bg-white/10 transition text-left w-full`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-white">{group.code}</span>
        <span className="text-[10px] text-white/50 capitalize">{group.category}</span>
      </div>
      <div className="text-xs text-white/60 mt-1">{group.name}</div>
      <div className="text-[10px] text-white/40 mt-1">{group.member_count} members</div>
    </button>
  );
}

function GroupDetail({ detail, onBack }: { detail: EconomicGroupDetail; onBack: () => void }) {
  return (
    <div>
      <button onClick={onBack} className="text-xs text-cyan-400 hover:text-cyan-300 mb-3">&larr; Back to groups</button>
      <h3 className="text-sm font-bold text-white">{detail.code} — {detail.name}</h3>
      <p className="text-[10px] text-white/50 capitalize mb-3">{detail.category} &middot; {detail.member_count} members</p>
      <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
        {detail.members.map((m) => (
          <div key={m.iso_code} className="flex items-center gap-2 p-2 rounded bg-white/5 border border-white/5">
            <span className="text-base">{m.flag_emoji || "🏳️"}</span>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-white/90 truncate">{m.name}</div>
              <div className="text-[10px] text-white/50">{m.capital} &middot; {m.income_group || "N/A"}</div>
            </div>
            <span className="text-[10px] text-white/40 font-mono">{m.iso_code}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Stats cards ───

function StatsRow({ stats }: { stats: DataSourceStats }) {
  return (
    <div className="grid grid-cols-3 gap-2 mb-4">
      <div className="p-2 rounded bg-white/5 border border-white/10 text-center">
        <div className="text-lg font-bold text-white">{stats.total}</div>
        <div className="text-[10px] text-white/50">Total APIs</div>
      </div>
      <div className="p-2 rounded bg-white/5 border border-white/10 text-center">
        <div className="text-lg font-bold text-green-400">{stats.by_status.active}</div>
        <div className="text-[10px] text-white/50">Active</div>
      </div>
      <div className="p-2 rounded bg-white/5 border border-white/10 text-center">
        <div className="text-lg font-bold text-yellow-400">{stats.by_tier.premium || 0}</div>
        <div className="text-[10px] text-white/50">Premium</div>
      </div>
    </div>
  );
}

// ─── Main Component ───

interface DataSourcePanelProps {
  onClose: () => void;
}

export default function DataSourcePanel({ onClose }: DataSourcePanelProps) {
  const [tab, setTab] = useState<Tab>("sources");
  const [sources, setSources] = useState<NationalDataSourceInfo[]>([]);
  const [stats, setStats] = useState<DataSourceStats | null>(null);
  const [groups, setGroups] = useState<EconomicGroupInfo[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<EconomicGroupDetail | null>(null);
  const [tierFilter, setTierFilter] = useState<string>("");
  const [searchQ, setSearchQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [srcRes, statsRes, grpRes] = await Promise.all([
          fetchDataSources(),
          fetchDataSourceStats(),
          fetchEconomicGroups(),
        ]);
        setSources(srcRes.sources);
        setStats(statsRes);
        setGroups(grpRes.groups);
      } catch (e) {
        console.error("DataSourcePanel load error:", e);
      }
      setLoading(false);
    })();
  }, []);

  const handleGroupClick = async (code: string) => {
    try {
      const detail = await fetchEconomicGroup(code);
      setSelectedGroup(detail);
    } catch (e) {
      console.error("Failed to load group", code, e);
    }
  };

  // Filtering
  const filtered = sources.filter((s) => {
    if (tierFilter && s.tier !== tierFilter) return false;
    if (searchQ) {
      const q = searchQ.toLowerCase();
      return (
        s.country_iso.toLowerCase().includes(q) ||
        s.institution.toLowerCase().includes(q) ||
        (s.data_format || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="absolute top-16 right-4 w-[420px] max-h-[calc(100vh-80px)] bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-white tracking-wide">
            DATA SOURCES & GROUPS
          </h2>
          <button onClick={onClose} className="text-white/50 hover:text-white text-lg leading-none">&times;</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          {(["sources", "groups"] as Tab[]).map((t) => (
            <button key={t} onClick={() => { setTab(t); setSelectedGroup(null); }}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition ${
                tab === t ? "bg-cyan-500/20 text-cyan-400" : "text-white/50 hover:text-white/80"
              }`}>
              {t === "sources" ? "National APIs" : "Economic Groups"}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="text-white/50 text-xs text-center py-8">Loading...</div>
        ) : tab === "sources" ? (
          <>
            {stats && <StatsRow stats={stats} />}

            {/* Filters */}
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                placeholder="Search country, institution..."
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                className="flex-1 px-2 py-1.5 bg-white/5 border border-white/10 rounded text-xs text-white placeholder-white/30 focus:outline-none focus:border-cyan-500/50"
              />
              <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value)}
                className="px-2 py-1.5 bg-white/5 border border-white/10 rounded text-xs text-white focus:outline-none">
                <option value="">All tiers</option>
                <option value="premium">Premium</option>
                <option value="standard">Standard</option>
                <option value="limited">Limited</option>
              </select>
            </div>

            <div className="text-[10px] text-white/40 mb-2">{filtered.length} sources</div>
            <div className="space-y-2">
              {filtered.map((s) => <SourceRow key={s.id} s={s} />)}
            </div>
          </>
        ) : selectedGroup ? (
          <GroupDetail detail={selectedGroup} onBack={() => setSelectedGroup(null)} />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {groups.map((g) => (
              <GroupCard key={g.code} group={g} onClick={() => handleGroupClick(g.code)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

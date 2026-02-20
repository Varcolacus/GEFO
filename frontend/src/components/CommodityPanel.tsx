"use client";

import { useState, useEffect, useMemo, type ReactNode } from "react";
import {
  fetchCommodityDashboard,
  fetchCommodityPrices,
  fetchCommodityFlowGraph,
  fetchSupplyRiskMatrix,
  type CommodityDashboard,
  type CommodityDashboardItem,
  type CommodityPriceHistory,
  type CommodityFlowGraph,
  type SupplyRiskMatrix,
  type SupplyRiskEntry,
  type CommodityFlowEdge,
} from "@/lib/api";

// ─── Helpers ───

function fmtUsd(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
}

function fmtPrice(v: number, unit: string): string {
  if (unit === "index") return v.toFixed(0);
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (v >= 1) return v.toFixed(2);
  return v.toFixed(3);
}

function pctBadge(pct: number | null, size: "sm" | "xs" = "xs"): ReactNode {
  if (pct === null || pct === undefined) return null;
  const positive = pct >= 0;
  const cls = size === "sm" ? "text-xs px-1.5 py-0.5" : "text-[10px] px-1 py-0.5";
  return (
    <span className={`${cls} rounded font-mono ${
      positive ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
    }`}>
      {positive ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

function riskColor(score: number): string {
  if (score >= 70) return "text-red-400";
  if (score >= 50) return "text-orange-400";
  if (score >= 30) return "text-yellow-400";
  return "text-green-400";
}

function riskBg(score: number): string {
  if (score >= 70) return "bg-red-500";
  if (score >= 50) return "bg-orange-500";
  if (score >= 30) return "bg-yellow-500";
  return "bg-green-500";
}

const CATEGORY_ICONS: Record<string, string> = {
  energy: "⚡",
  metals: "🪨",
  agriculture: "🌾",
  technology: "🔌",
};

// ─── Tab: Overview ───

function OverviewTab({ year, onSelectCommodity }: {
  year: number;
  onSelectCommodity: (id: number) => void;
}) {
  const [data, setData] = useState<CommodityDashboard | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchCommodityDashboard(year)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year]);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (filter === "all") return data.latest_prices;
    if (filter === "strategic") return data.latest_prices.filter((c) => c.is_strategic);
    return data.latest_prices.filter((c) => c.category === filter);
  }, [data, filter]);

  if (loading) return <Spinner />;
  if (!data) return <Empty msg="No commodity data available." />;

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Tracked" value={String(data.total_commodities)} />
        <StatCard label="With Prices" value={String(data.tracked_with_prices)} />
        <StatCard label="Categories" value={String(data.categories.length)} />
      </div>

      {/* Category filter */}
      <div className="flex gap-1 flex-wrap">
        {["all", "strategic", "energy", "metals", "agriculture", "technology"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-[10px] px-2 py-1 rounded-full transition-colors ${
              filter === f
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "bg-gray-800 text-gray-400 border border-gray-700 hover:text-gray-200"
            }`}
          >
            {f === "all" ? "All" : f === "strategic" ? "⭐ Strategic" : `${CATEGORY_ICONS[f] || ""} ${f}`}
          </button>
        ))}
      </div>

      {/* Top Movers */}
      {filter === "all" && data.top_movers.length > 0 && (
        <div className="bg-gray-800/50 rounded p-2 border border-gray-700/50">
          <p className="text-[10px] text-gray-500 uppercase mb-1">Top Movers (YoY)</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {data.top_movers.slice(0, 5).map((m) => (
              <button
                key={m.commodity_id}
                onClick={() => onSelectCommodity(m.commodity_id)}
                className="flex-shrink-0 bg-gray-700/50 rounded px-2 py-1 hover:bg-gray-600/50 transition-colors"
              >
                <span className="text-xs">{m.icon} {m.name}</span>
                <div>{pctBadge(m.yoy_change_pct, "sm")}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Price grid */}
      <div className="space-y-1">
        {filtered.map((c) => (
          <button
            key={c.commodity_id}
            onClick={() => onSelectCommodity(c.commodity_id)}
            className="w-full text-left bg-gray-800/50 rounded p-2 border border-gray-700/30
                     hover:bg-gray-700/50 transition-colors flex items-center gap-2"
          >
            <span className="text-sm w-6 text-center">{c.icon || "📦"}</span>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-200 truncate">{c.name}</span>
                <span className="text-xs text-amber-300 font-mono">
                  {fmtPrice(c.price, c.unit)} <span className="text-[10px] text-gray-500">{c.unit}</span>
                </span>
              </div>
              <div className="flex justify-between items-center mt-0.5">
                <span className="text-[10px] text-gray-500">{c.category} · {c.hs_code}</span>
                {pctBadge(c.yoy_change_pct)}
              </div>
            </div>
            {c.is_strategic && <span className="text-[10px] text-amber-400">⭐</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Tab: Price Chart (detail) ───

function PriceTab({ commodityId, onBack }: { commodityId: number; onBack: () => void }) {
  const [data, setData] = useState<CommodityPriceHistory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchCommodityPrices(commodityId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [commodityId]);

  if (loading) return <Spinner />;
  if (!data || data.prices.length === 0) return <Empty msg="No price data." />;

  const { commodity, prices, summary } = data;
  const maxP = Math.max(...prices.map((p) => p.price));
  const minP = Math.min(...prices.map((p) => p.price));
  const range = maxP - minP || 1;

  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-xs text-gray-400 hover:text-white">← Back</button>

      {/* Header */}
      <div className="bg-gray-800/50 rounded p-3 border border-gray-700/50">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">{commodity.icon || "📦"}</span>
          <div>
            <p className="text-sm text-white font-medium">{commodity.name}</p>
            <p className="text-[10px] text-gray-500">{commodity.category} · HS {commodity.hs_code}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[10px] text-gray-500">Latest</p>
            <p className="text-sm text-amber-300 font-mono">{fmtPrice(summary.latest_price, summary.unit)}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-500">YoY</p>
            <div>{pctBadge(summary.yoy_change_pct, "sm")}</div>
          </div>
          <div>
            <p className="text-[10px] text-gray-500">Volatility</p>
            <p className="text-xs text-gray-300">{summary.volatility.toFixed(1)}</p>
          </div>
        </div>
      </div>

      {/* Mini chart (SVG sparkline) */}
      <div className="bg-gray-800/50 rounded p-3 border border-gray-700/50">
        <p className="text-[10px] text-gray-500 uppercase mb-1">Price History ({summary.unit})</p>
        <svg viewBox="0 0 400 120" className="w-full h-24">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => (
            <line
              key={frac}
              x1={0} y1={10 + frac * 100} x2={400} y2={10 + frac * 100}
              stroke="#374151" strokeWidth={0.5}
            />
          ))}
          {/* Price line */}
          <polyline
            fill="none"
            stroke="#f59e0b"
            strokeWidth={1.5}
            points={prices
              .map((p, i) => {
                const x = (i / (prices.length - 1)) * 400;
                const y = 110 - ((p.price - minP) / range) * 100;
                return `${x},${y}`;
              })
              .join(" ")}
          />
          {/* Area fill */}
          <polygon
            fill="url(#goldGrad)"
            opacity={0.15}
            points={[
              ...prices.map((p, i) => {
                const x = (i / (prices.length - 1)) * 400;
                const y = 110 - ((p.price - minP) / range) * 100;
                return `${x},${y}`;
              }),
              `400,110`,
              `0,110`,
            ].join(" ")}
          />
          <defs>
            <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
          </defs>
          {/* Year labels */}
          {[2018, 2019, 2020, 2021, 2022, 2023].map((yr, i) => (
            <text key={yr} x={(i / 5) * 400} y={120} fill="#6b7280" fontSize={8}>
              {yr}
            </text>
          ))}
        </svg>
        <div className="flex justify-between text-[10px] text-gray-500 mt-1">
          <span>Low: {fmtPrice(summary.min_price, summary.unit)}</span>
          <span>Avg: {fmtPrice(summary.avg_price, summary.unit)}</span>
          <span>High: {fmtPrice(summary.max_price, summary.unit)}</span>
        </div>
      </div>

      {/* Recent prices table */}
      <div className="bg-gray-800/50 rounded p-3 border border-gray-700/50">
        <p className="text-[10px] text-gray-500 uppercase mb-1">Recent Months</p>
        <div className="max-h-32 overflow-y-auto">
          <table className="w-full text-[10px] text-gray-300">
            <thead>
              <tr className="border-b border-gray-700 text-gray-500">
                <th className="text-left py-0.5">Period</th>
                <th className="text-right py-0.5">Price</th>
                <th className="text-right py-0.5">MoM</th>
                <th className="text-right py-0.5">YoY</th>
              </tr>
            </thead>
            <tbody>
              {prices.slice(-12).reverse().map((p, i) => (
                <tr key={i} className="border-b border-gray-800">
                  <td className="py-0.5">{p.year}-{String(p.month).padStart(2, "0")}</td>
                  <td className="text-right font-mono">{fmtPrice(p.price, summary.unit)}</td>
                  <td className="text-right">{pctBadge(p.price_change_pct)}</td>
                  <td className="text-right">{pctBadge(p.yoy_change_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Supply Chain Flows ───

function FlowsTab({
  year,
  onShowOnGlobe,
}: {
  year: number;
  onShowOnGlobe: (flows: CommodityFlowEdge[], name: string) => void;
}) {
  const [commodities, setCommodities] = useState<CommodityDashboardItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [flowData, setFlowData] = useState<CommodityFlowGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [flowLoading, setFlowLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchCommodityDashboard(year)
      .then((d) => { if (!cancelled) setCommodities(d.latest_prices.filter((c) => c.is_strategic)); })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year]);

  const loadFlow = async (hsCode: string) => {
    setSelected(hsCode);
    setFlowLoading(true);
    try {
      const graph = await fetchCommodityFlowGraph(hsCode, year);
      setFlowData(graph);
    } catch (e) {
      console.error(e);
    } finally {
      setFlowLoading(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">Select a commodity to view global supply chains</p>

      {/* Commodity selector */}
      <div className="flex gap-1 flex-wrap">
        {commodities.map((c) => (
          <button
            key={c.hs_code}
            onClick={() => loadFlow(c.hs_code)}
            className={`text-[10px] px-2 py-1 rounded-full transition-colors ${
              selected === c.hs_code
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "bg-gray-800 text-gray-400 border border-gray-700 hover:text-gray-200"
            }`}
          >
            {c.icon} {c.name}
          </button>
        ))}
      </div>

      {flowLoading && <Spinner />}

      {flowData && !flowLoading && (
        <div className="space-y-2">
          <div className="bg-gray-800/50 rounded p-3 border border-gray-700/50">
            <div className="flex justify-between items-center mb-2">
              <div>
                <p className="text-xs text-gray-200">{flowData.icon} {flowData.commodity_name}</p>
                <p className="text-[10px] text-gray-500">
                  {flowData.edges.length} flows · {fmtUsd(flowData.total_value)} total
                </p>
              </div>
              <button
                onClick={() => onShowOnGlobe(flowData.edges, flowData.commodity_name)}
                className="text-[10px] px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded"
              >
                🌐 Show on Globe
              </button>
            </div>

            {/* Flow list */}
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {flowData.edges.map((e, i) => (
                <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                  <span className="text-gray-300 w-8">{e.exporter_iso}</span>
                  <span className="text-gray-600">→</span>
                  <span className="text-gray-300 w-8">{e.importer_iso}</span>
                  <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full"
                      style={{ width: `${e.weight * 100}%` }}
                    />
                  </div>
                  <span className="text-amber-300 text-[10px] font-mono w-16 text-right">
                    {fmtUsd(e.value_usd)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Nodes */}
          <div className="bg-gray-800/50 rounded p-2 border border-gray-700/50">
            <p className="text-[10px] text-gray-500 uppercase mb-1">
              Countries Involved ({flowData.nodes.length})
            </p>
            <div className="flex flex-wrap gap-1">
              {flowData.nodes.map((n) => (
                <span key={n.iso} className="text-[10px] bg-gray-700/50 text-gray-300 px-1.5 py-0.5 rounded">
                  {n.iso}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Supply Risk ───

function RiskTab({ year }: { year: number }) {
  const [data, setData] = useState<SupplyRiskMatrix | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchSupplyRiskMatrix(year)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year]);

  if (loading) return <Spinner />;
  if (!data || data.risk_matrix.length === 0) return <Empty msg="No supply risk data." />;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">{data.strategic_commodities} strategic commodities</span>
      </div>

      {data.risk_matrix.map((entry: SupplyRiskEntry) => (
        <div
          key={entry.commodity_id}
          className="bg-gray-800/50 rounded border border-gray-700/30"
        >
          <button
            onClick={() => setExpanded(expanded === entry.commodity_id ? null : entry.commodity_id)}
            className="w-full text-left p-2 hover:bg-gray-700/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm">{entry.icon || "📦"}</span>
              <div className="flex-1">
                <div className="flex justify-between">
                  <span className="text-xs text-gray-200">{entry.commodity_name}</span>
                  <span className={`text-xs font-mono ${riskColor(entry.avg_risk_score)}`}>
                    {entry.avg_risk_score.toFixed(0)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${riskBg(entry.avg_risk_score)}`}
                      style={{ width: `${entry.avg_risk_score}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-500">
                    {entry.dependent_countries} countries
                  </span>
                </div>
              </div>
            </div>
          </button>

          {expanded === entry.commodity_id && (
            <div className="px-3 pb-2 border-t border-gray-700/50 pt-2">
              <p className="text-[10px] text-gray-500 uppercase mb-1">Top Import Dependencies</p>
              {entry.top_dependencies.map((d, i) => (
                <div key={i} className="flex justify-between text-xs py-0.5">
                  <span className="text-gray-300">{d.country_iso}</span>
                  <span className="text-gray-400">{fmtUsd(d.value_usd)}</span>
                  <span className="text-[10px] text-gray-500">{d.share_pct?.toFixed(1)}%</span>
                  <span className={`text-[10px] font-mono ${riskColor(d.risk_score || 0)}`}>
                    risk: {d.risk_score}
                  </span>
                </div>
              ))}
              <div className="mt-1 text-[10px] text-gray-500">
                Max HHI: {entry.max_concentration_hhi.toFixed(0)}
                {entry.max_concentration_hhi > 2500 && (
                  <span className="text-red-400 ml-1">⚠ Highly concentrated</span>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Shared Components ───

function Spinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="animate-spin rounded-full h-6 w-6 border-2 border-amber-400 border-t-transparent" />
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <p className="text-center text-gray-500 text-xs py-6">{msg}</p>;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800/50 rounded p-2 border border-gray-700/50 text-center">
      <p className="text-[10px] text-gray-500">{label}</p>
      <p className="text-sm text-amber-300 font-mono">{value}</p>
    </div>
  );
}

// ─── Main Panel ───

const TABS = ["Overview", "Flows", "Risk"] as const;
type TabName = (typeof TABS)[number];

interface Props {
  year: number;
  onClose: () => void;
  onShowCommodityFlows?: (flows: CommodityFlowEdge[], name: string) => void;
}

export default function CommodityPanel({ year, onClose, onShowCommodityFlows }: Props) {
  const [activeTab, setActiveTab] = useState<TabName>("Overview");
  const [selectedCommodityId, setSelectedCommodityId] = useState<number | null>(null);

  const handleSelectCommodity = (id: number) => {
    setSelectedCommodityId(id);
  };

  const handleBack = () => {
    setSelectedCommodityId(null);
  };

  const handleShowOnGlobe = (flows: CommodityFlowEdge[], name: string) => {
    onShowCommodityFlows?.(flows, name);
  };

  return (
    <div className="absolute top-16 right-4 w-[440px] max-h-[calc(100vh-5rem)] bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          📦 Commodities & Supply Chain
        </h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-lg leading-none"
        >
          ×
        </button>
      </div>

      {/* Tabs */}
      {!selectedCommodityId && (
        <div className="flex border-b border-gray-700">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 text-xs py-2 transition-colors ${
                activeTab === tab
                  ? "text-amber-400 border-b-2 border-amber-400"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-gray-700">
        {selectedCommodityId ? (
          <PriceTab commodityId={selectedCommodityId} onBack={handleBack} />
        ) : (
          <>
            {activeTab === "Overview" && (
              <OverviewTab year={year} onSelectCommodity={handleSelectCommodity} />
            )}
            {activeTab === "Flows" && (
              <FlowsTab year={year} onShowOnGlobe={handleShowOnGlobe} />
            )}
            {activeTab === "Risk" && <RiskTab year={year} />}
          </>
        )}
      </div>
    </div>
  );
}

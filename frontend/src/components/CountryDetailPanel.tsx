"use client";

import { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  fetchCountryProfile,
  type CountryProfile,
  type CountryMacro,
} from "@/lib/api";

interface CountryDetailPanelProps {
  selectedCountry: CountryMacro | null;
  onClose: () => void;
}

const COLORS = [
  "#06b6d4",
  "#8b5cf6",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#ec4899",
  "#3b82f6",
  "#14b8a6",
  "#f97316",
  "#6366f1",
];

function formatValue(val: number): string {
  if (Math.abs(val) >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
  if (Math.abs(val) >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (Math.abs(val) >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  return `$${val.toFixed(0)}`;
}

function formatPopulation(val: number): string {
  if (val >= 1e9) return `${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `${(val / 1e6).toFixed(1)}M`;
  if (val >= 1e3) return `${(val / 1e3).toFixed(0)}K`;
  return val.toFixed(0);
}

export default function CountryDetailPanel({
  selectedCountry,
  onClose,
}: CountryDetailPanelProps) {
  const [profile, setProfile] = useState<CountryProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "overview" | "trade" | "partners" | "ports"
  >("overview");

  useEffect(() => {
    if (!selectedCountry) {
      setProfile(null);
      return;
    }

    setLoading(true);
    fetchCountryProfile(selectedCountry.iso_code)
      .then((data) => {
        setProfile(data);
        setLoading(false);
      })
      .catch(() => {
        // Use demo data from the selected country
        setProfile(null);
        setLoading(false);
      });
  }, [selectedCountry]);

  if (!selectedCountry) return null;

  const country = profile?.country || selectedCountry;

  // Build overview stats
  const stats = [
    {
      label: "GDP",
      value: country.gdp ? formatValue(country.gdp) : "N/A",
      color: "#06b6d4",
    },
    {
      label: "Population",
      value: country.population ? formatPopulation(country.population) : "N/A",
      color: "#8b5cf6",
    },
    {
      label: "Exports",
      value: country.export_value ? formatValue(country.export_value) : "N/A",
      color: "#10b981",
    },
    {
      label: "Imports",
      value: country.import_value ? formatValue(country.import_value) : "N/A",
      color: "#ef4444",
    },
    {
      label: "Trade Balance",
      value: country.trade_balance ? formatValue(country.trade_balance) : "N/A",
      color: country.trade_balance && country.trade_balance > 0 ? "#10b981" : "#ef4444",
    },
    {
      label: "Current Account",
      value: country.current_account
        ? formatValue(country.current_account)
        : "N/A",
      color:
        country.current_account && country.current_account > 0
          ? "#10b981"
          : "#ef4444",
    },
  ];

  // Trade history chart data
  const tradeHistoryData = profile?.trade_history.map((h) => ({
    year: h.year,
    Exports: +(h.total_exports / 1e9).toFixed(2),
    Imports: +(h.total_imports / 1e9).toFixed(2),
    Balance: +(h.trade_balance / 1e9).toFixed(2),
  }));

  // Top partners for pie chart
  const exportPartnersData = profile?.top_export_partners.slice(0, 6).map((p) => ({
    name: p.name,
    value: +(p.total_value_usd / 1e9).toFixed(1),
  }));

  const importPartnersData = profile?.top_import_partners.slice(0, 6).map((p) => ({
    name: p.name,
    value: +(p.total_value_usd / 1e9).toFixed(1),
  }));

  const tabs = [
    { key: "overview" as const, label: "Overview" },
    { key: "trade" as const, label: "Trade History" },
    { key: "partners" as const, label: "Partners" },
    { key: "ports" as const, label: "Ports" },
  ];

  return (
    <div className="absolute top-0 right-0 h-full w-[420px] z-50 bg-gray-900/95 backdrop-blur-sm border-l border-gray-700/50 shadow-2xl overflow-hidden flex flex-col transition-transform duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50 bg-gray-800/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold text-xs">
            {country.iso_code}
          </div>
          <div>
            <h2 className="text-white font-semibold text-sm">
              {country.name}
            </h2>
            <p className="text-gray-400 text-xs">
              {country.region || ""}
              {country.sub_region ? ` · ${country.sub_region}` : ""}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700/50">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? "text-cyan-400 border-b-2 border-cyan-400"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Overview Tab */}
            {activeTab === "overview" && (
              <div className="space-y-4">
                {/* Key Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                  {stats.map((stat) => (
                    <div
                      key={stat.label}
                      className="bg-gray-800/60 rounded-lg p-3 border border-gray-700/30"
                    >
                      <p className="text-gray-400 text-xs mb-1">
                        {stat.label}
                      </p>
                      <p
                        className="text-sm font-semibold"
                        style={{ color: stat.color }}
                      >
                        {stat.value}
                      </p>
                    </div>
                  ))}
                </div>

                {/* GDP Bar (visual comparison) */}
                {country.export_value && country.import_value && (
                  <div className="bg-gray-800/60 rounded-lg p-3 border border-gray-700/30">
                    <p className="text-gray-400 text-xs mb-2">
                      Export / Import Ratio
                    </p>
                    <div className="flex gap-1 h-5 rounded overflow-hidden">
                      <div
                        className="bg-emerald-500 rounded-l"
                        style={{
                          width: `${
                            (country.export_value /
                              (country.export_value + country.import_value)) *
                            100
                          }%`,
                        }}
                      />
                      <div
                        className="bg-red-500 rounded-r"
                        style={{
                          width: `${
                            (country.import_value /
                              (country.export_value + country.import_value)) *
                            100
                          }%`,
                        }}
                      />
                    </div>
                    <div className="flex justify-between mt-1 text-[10px]">
                      <span className="text-emerald-400">
                        Exports{" "}
                        {(
                          (country.export_value /
                            (country.export_value + country.import_value)) *
                          100
                        ).toFixed(0)}
                        %
                      </span>
                      <span className="text-red-400">
                        Imports{" "}
                        {(
                          (country.import_value /
                            (country.export_value + country.import_value)) *
                          100
                        ).toFixed(0)}
                        %
                      </span>
                    </div>
                  </div>
                )}

                {/* GDP per capita */}
                {country.gdp_per_capita && (
                  <div className="bg-gray-800/60 rounded-lg p-3 border border-gray-700/30">
                    <p className="text-gray-400 text-xs mb-1">GDP per Capita</p>
                    <p className="text-cyan-400 text-sm font-semibold">
                      ${country.gdp_per_capita.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Trade History Tab */}
            {activeTab === "trade" && (
              <div className="space-y-4">
                {tradeHistoryData && tradeHistoryData.length > 0 ? (
                  <>
                    <div>
                      <p className="text-gray-400 text-xs mb-2">
                        Exports & Imports ($B)
                      </p>
                      <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={tradeHistoryData}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#374151"
                          />
                          <XAxis
                            dataKey="year"
                            tick={{ fill: "#9ca3af", fontSize: 11 }}
                            stroke="#4b5563"
                          />
                          <YAxis
                            tick={{ fill: "#9ca3af", fontSize: 11 }}
                            stroke="#4b5563"
                            tickFormatter={(v) => `$${v}B`}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#1f2937",
                              border: "1px solid #374151",
                              borderRadius: "8px",
                              color: "#e5e7eb",
                              fontSize: "12px",
                            }}
                            formatter={(value) => [`$${value}B`]}
                          />
                          <Legend
                            wrapperStyle={{ fontSize: "11px", color: "#9ca3af" }}
                          />
                          <Area
                            type="monotone"
                            dataKey="Exports"
                            stroke="#10b981"
                            fill="#10b981"
                            fillOpacity={0.2}
                            strokeWidth={2}
                          />
                          <Area
                            type="monotone"
                            dataKey="Imports"
                            stroke="#ef4444"
                            fill="#ef4444"
                            fillOpacity={0.2}
                            strokeWidth={2}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    <div>
                      <p className="text-gray-400 text-xs mb-2">
                        Trade Balance ($B)
                      </p>
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={tradeHistoryData}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#374151"
                          />
                          <XAxis
                            dataKey="year"
                            tick={{ fill: "#9ca3af", fontSize: 11 }}
                            stroke="#4b5563"
                          />
                          <YAxis
                            tick={{ fill: "#9ca3af", fontSize: 11 }}
                            stroke="#4b5563"
                            tickFormatter={(v) => `$${v}B`}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#1f2937",
                              border: "1px solid #374151",
                              borderRadius: "8px",
                              color: "#e5e7eb",
                              fontSize: "12px",
                            }}
                            formatter={(value) => [`$${value}B`]}
                          />
                          <Bar dataKey="Balance">
                            {tradeHistoryData.map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={
                                  entry.Balance >= 0 ? "#10b981" : "#ef4444"
                                }
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                ) : (
                  <div className="text-center text-gray-500 py-10 text-sm">
                    No trade history data available.
                    <br />
                    <span className="text-xs">
                      Start the backend to load live data.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Partners Tab */}
            {activeTab === "partners" && (
              <div className="space-y-5">
                {exportPartnersData && exportPartnersData.length > 0 ? (
                  <>
                    <div>
                      <p className="text-gray-400 text-xs mb-2">
                        Top Export Destinations ($B)
                      </p>
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie
                            data={exportPartnersData}
                            cx="50%"
                            cy="50%"
                            outerRadius={70}
                            innerRadius={35}
                            dataKey="value"
                            label={({ name, value }) => `${name} $${value}B`}
                            labelLine={{ stroke: "#6b7280" }}
                          >
                            {exportPartnersData.map((_entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={COLORS[index % COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#1f2937",
                              border: "1px solid #374151",
                              borderRadius: "8px",
                              color: "#e5e7eb",
                              fontSize: "12px",
                            }}
                            formatter={(value) => [`$${value}B`]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div>
                      <p className="text-gray-400 text-xs mb-2">
                        Top Import Sources ($B)
                      </p>
                      {importPartnersData && importPartnersData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={180}>
                          <PieChart>
                            <Pie
                              data={importPartnersData}
                              cx="50%"
                              cy="50%"
                              outerRadius={70}
                              innerRadius={35}
                              dataKey="value"
                              label={({ name, value }) =>
                                `${name} $${value}B`
                              }
                              labelLine={{ stroke: "#6b7280" }}
                            >
                              {importPartnersData.map((_entry, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={COLORS[index % COLORS.length]}
                                />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "#1f2937",
                                border: "1px solid #374151",
                                borderRadius: "8px",
                                color: "#e5e7eb",
                                fontSize: "12px",
                              }}
                              formatter={(value) => [`$${value}B`]}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <p className="text-gray-500 text-xs text-center py-4">
                          No import data
                        </p>
                      )}
                    </div>

                    {/* Partner list */}
                    <div className="space-y-2">
                      <p className="text-gray-400 text-xs">All Partners</p>
                      {profile?.top_export_partners.map((p, i) => (
                        <div
                          key={`exp-${i}`}
                          className="flex items-center justify-between bg-gray-800/40 rounded px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{
                                backgroundColor:
                                  COLORS[i % COLORS.length],
                              }}
                            />
                            <span className="text-gray-300 text-xs">
                              {p.name}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-emerald-400 text-xs font-medium">
                              ↑ {formatValue(p.total_value_usd)}
                            </span>
                          </div>
                        </div>
                      ))}
                      {profile?.top_import_partners.map((p, i) => (
                        <div
                          key={`imp-${i}`}
                          className="flex items-center justify-between bg-gray-800/40 rounded px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{
                                backgroundColor:
                                  COLORS[i % COLORS.length],
                              }}
                            />
                            <span className="text-gray-300 text-xs">
                              {p.name}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-red-400 text-xs font-medium">
                              ↓ {formatValue(p.total_value_usd)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center text-gray-500 py-10 text-sm">
                    No partner data available.
                    <br />
                    <span className="text-xs">
                      Start the backend to load live data.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Ports Tab */}
            {activeTab === "ports" && (
              <div className="space-y-3">
                {profile?.ports && profile.ports.length > 0 ? (
                  profile.ports.map((port) => (
                    <div
                      key={port.id}
                      className="bg-gray-800/60 rounded-lg p-3 border border-gray-700/30"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="text-white text-sm font-medium">
                          {port.name}
                        </h4>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full ${
                            port.port_type === "container"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : port.port_type === "oil"
                              ? "bg-orange-500/20 text-orange-400"
                              : port.port_type === "bulk"
                              ? "bg-yellow-500/20 text-yellow-400"
                              : "bg-purple-500/20 text-purple-400"
                          }`}
                        >
                          {port.port_type || "general"}
                        </span>
                      </div>
                      {port.throughput_teu && (
                        <p className="text-gray-400 text-xs">
                          Throughput:{" "}
                          {(port.throughput_teu / 1e6).toFixed(1)}M TEU
                        </p>
                      )}
                      {port.throughput_tons && (
                        <p className="text-gray-400 text-xs">
                          Throughput:{" "}
                          {(port.throughput_tons / 1e6).toFixed(0)}M tons
                        </p>
                      )}
                      {port.unlocode && (
                        <p className="text-gray-500 text-[10px]">
                          UNLOCODE: {port.unlocode}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center text-gray-500 py-10 text-sm">
                    No ports data for this country.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

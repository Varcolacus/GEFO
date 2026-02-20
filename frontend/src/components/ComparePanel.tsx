"use client";

import { useState, useEffect } from "react";
import { fetchCountryProfile, type CountryProfile, type CountryMacro } from "@/lib/api";

interface ComparePanelProps {
  countries: CountryMacro[];
  onClose: () => void;
}

export default function ComparePanel({ countries, onClose }: ComparePanelProps) {
  const [isoA, setIsoA] = useState("");
  const [isoB, setIsoB] = useState("");
  const [profileA, setProfileA] = useState<CountryProfile | null>(null);
  const [profileB, setProfileB] = useState<CountryProfile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isoA || !isoB) return;
    setLoading(true);
    Promise.all([fetchCountryProfile(isoA), fetchCountryProfile(isoB)])
      .then(([a, b]) => {
        setProfileA(a);
        setProfileB(b);
      })
      .catch(() => {
        // Use basic data from the countries array as fallback
        setProfileA(null);
        setProfileB(null);
      })
      .finally(() => setLoading(false));
  }, [isoA, isoB]);

  const countryA = countries.find((c) => c.iso_code === isoA);
  const countryB = countries.find((c) => c.iso_code === isoB);

  const fmt = (v: number | undefined | null) => {
    if (v == null) return "—";
    if (Math.abs(v) >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
    if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
    return `$${v.toFixed(0)}`;
  };

  const fmtPop = (v: number | undefined | null) => {
    if (v == null) return "—";
    if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    return `${(v / 1e3).toFixed(0)}K`;
  };

  const pct = (v: number | undefined | null) =>
    v != null ? `${v.toFixed(1)}%` : "—";

  const tradeOpenness = (c: CountryMacro | undefined) => {
    if (!c || !c.gdp || c.gdp === 0) return null;
    return (((c.export_value || 0) + (c.import_value || 0)) / c.gdp) * 100;
  };

  interface Row {
    label: string;
    a: string;
    b: string;
    highlight?: boolean;
  }

  const rows: Row[] =
    countryA && countryB
      ? [
          { label: "GDP", a: fmt(countryA.gdp), b: fmt(countryB.gdp) },
          { label: "Population", a: fmtPop(countryA.population), b: fmtPop(countryB.population) },
          { label: "GDP/capita", a: countryA.gdp && countryA.population ? fmt(countryA.gdp / countryA.population) : "—", b: countryB.gdp && countryB.population ? fmt(countryB.gdp / countryB.population) : "—" },
          { label: "Exports", a: fmt(countryA.export_value), b: fmt(countryB.export_value) },
          { label: "Imports", a: fmt(countryA.import_value), b: fmt(countryB.import_value) },
          { label: "Trade Balance", a: fmt(countryA.trade_balance), b: fmt(countryB.trade_balance), highlight: true },
          { label: "Current Account", a: fmt(countryA.current_account), b: fmt(countryB.current_account) },
          { label: "Trade Openness", a: pct(tradeOpenness(countryA)), b: pct(tradeOpenness(countryB)), highlight: true },
        ]
      : [];

  // Sort countries by name for selectors
  const sorted = [...countries].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[60] w-[520px]
                    bg-gray-900/95 backdrop-blur-md text-white rounded-xl shadow-2xl
                    border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
        <h2 className="text-sm font-bold tracking-wide">
          ⚖️ Country Comparison
        </h2>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-white transition-colors text-lg leading-none"
        >
          ✕
        </button>
      </div>

      {/* Country Selectors */}
      <div className="grid grid-cols-2 gap-3 px-5 py-4">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Country A</label>
          <select
            value={isoA}
            onChange={(e) => setIsoA(e.target.value)}
            className="w-full bg-gray-800 border border-cyan-500/30 rounded px-3 py-2
                       text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="">Select…</option>
            {sorted.map((c) => (
              <option key={c.iso_code} value={c.iso_code}>
                {c.name} ({c.iso_code})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Country B</label>
          <select
            value={isoB}
            onChange={(e) => setIsoB(e.target.value)}
            className="w-full bg-gray-800 border border-orange-500/30 rounded px-3 py-2
                       text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="">Select…</option>
            {sorted.map((c) => (
              <option key={c.iso_code} value={c.iso_code}>
                {c.name} ({c.iso_code})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Comparison Table */}
      {countryA && countryB && (
        <div className="px-5 pb-4">
          {loading && (
            <div className="text-center py-4 text-gray-400 text-sm">
              Loading profiles…
            </div>
          )}
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="py-2 text-left text-gray-500 font-medium w-1/3">Metric</th>
                <th className="py-2 text-right text-cyan-400 font-medium w-1/3">
                  {countryA.iso_code}
                </th>
                <th className="py-2 text-right text-orange-400 font-medium w-1/3">
                  {countryB.iso_code}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.label}
                  className={`border-b border-gray-800 ${
                    row.highlight ? "bg-gray-800/50" : ""
                  }`}
                >
                  <td className="py-1.5 text-gray-400">{row.label}</td>
                  <td className="py-1.5 text-right font-mono text-white">{row.a}</td>
                  <td className="py-1.5 text-right font-mono text-white">{row.b}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Visual bar comparison for GDP */}
          {countryA.gdp && countryB.gdp && (
            <div className="mt-3">
              <div className="text-xs text-gray-500 mb-1">GDP Ratio</div>
              <div className="flex h-4 rounded overflow-hidden bg-gray-800">
                <div
                  className="bg-cyan-500/70 transition-all"
                  style={{
                    width: `${(countryA.gdp / (countryA.gdp + countryB.gdp)) * 100}%`,
                  }}
                />
                <div
                  className="bg-orange-500/70 transition-all"
                  style={{
                    width: `${(countryB.gdp / (countryA.gdp + countryB.gdp)) * 100}%`,
                  }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>{countryA.iso_code}</span>
                <span>{countryB.iso_code}</span>
              </div>
            </div>
          )}

          {/* Trade partner overlap */}
          {profileA && profileB && (
            <div className="mt-3 pt-3 border-t border-gray-700">
              <div className="text-xs text-gray-500 mb-1">Trade Partner Overlap</div>
              <div className="text-sm">
                {(() => {
                  const aPartners = new Set([
                    ...profileA.top_export_partners.map((p) => p.iso_code),
                    ...profileA.top_import_partners.map((p) => p.iso_code),
                  ]);
                  const bPartners = new Set([
                    ...profileB.top_export_partners.map((p) => p.iso_code),
                    ...profileB.top_import_partners.map((p) => p.iso_code),
                  ]);
                  const overlap = [...aPartners].filter((p) => bPartners.has(p));
                  return (
                    <span className="text-gray-300">
                      <span className="text-cyan-400 font-medium">{overlap.length}</span>
                      {" "}shared partners:{" "}
                      <span className="text-gray-400">
                        {overlap.slice(0, 6).join(", ")}
                        {overlap.length > 6 ? "…" : ""}
                      </span>
                    </span>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {(!isoA || !isoB) && (
        <div className="px-5 pb-5 text-center text-gray-500 text-sm">
          Select two countries to compare their economic profiles
        </div>
      )}
    </div>
  );
}

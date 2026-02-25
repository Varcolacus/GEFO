"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { CountryMacro, VesselPosition, PortData } from "@/lib/api";

// ── Unified search result ──
type SearchResultKind = "country" | "vessel" | "port";

interface SearchResult {
  kind: SearchResultKind;
  id: string;
  primary: string;
  secondary: string;
  meta?: string;
  raw: CountryMacro | VesselPosition | PortData;
}

interface SearchBarProps {
  countries: CountryMacro[];
  vessels?: VesselPosition[];
  ports?: PortData[];
  onSelectCountry: (country: CountryMacro) => void;
  onSelectVessel?: (vessel: VesselPosition) => void;
  onSelectPort?: (port: PortData) => void;
}

const ICONS: Record<SearchResultKind, string> = {
  country: "🌍",
  vessel: "🚢",
  port: "⚓",
};

const VESSEL_TYPE_ICONS: Record<string, string> = {
  cargo: "🚢", tanker: "🛢️", container: "📦", bulk: "⛴️",
  lng: "❄️", passenger: "🚤", fishing: "🎣", military: "⚓", other: "🔹",
};

export default function SearchBar({
  countries,
  vessels = [],
  ports = [],
  onSelectCountry,
  onSelectVessel,
  onSelectPort,
}: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Build unified results
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return [] as SearchResult[];

    const results: SearchResult[] = [];

    // Countries
    countries
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.iso_code.toLowerCase().includes(q)
      )
      .slice(0, 5)
      .forEach((c) => {
        const gdp = c.gdp;
        results.push({
          kind: "country",
          id: c.iso_code,
          primary: c.name,
          secondary: c.iso_code,
          meta: gdp
            ? gdp >= 1e12
              ? `$${(gdp / 1e12).toFixed(1)}T`
              : `$${(gdp / 1e9).toFixed(0)}B`
            : undefined,
          raw: c,
        });
      });

    // Vessels by name or MMSI
    vessels
      .filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          v.mmsi.includes(q)
      )
      .slice(0, 6)
      .forEach((v) => {
        results.push({
          kind: "vessel",
          id: v.mmsi,
          primary: v.name,
          secondary: `MMSI ${v.mmsi}${v.flag_iso ? ` · ${v.flag_iso}` : ""}`,
          meta: `${v.speed_knots.toFixed(1)} kn`,
          raw: v,
        });
      });

    // Ports
    ports
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.country_iso.toLowerCase().includes(q) ||
          (p.unlocode && p.unlocode.toLowerCase().includes(q))
      )
      .slice(0, 4)
      .forEach((p) => {
        const teu = p.throughput_teu;
        results.push({
          kind: "port",
          id: String(p.id),
          primary: p.name,
          secondary: `${p.country_iso}${p.port_type ? ` · ${p.port_type}` : ""}`,
          meta: teu
            ? `${(teu / 1e6).toFixed(1)}M TEU`
            : p.throughput_tons
            ? `${(p.throughput_tons / 1e6).toFixed(0)}M t`
            : undefined,
          raw: p,
        });
      });

    return results.slice(0, 12);
  }, [query, countries, vessels, ports]);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      setQuery("");
      setIsOpen(false);
      setHighlightIndex(-1);
      switch (result.kind) {
        case "country":
          onSelectCountry(result.raw as CountryMacro);
          break;
        case "vessel":
          onSelectVessel?.(result.raw as VesselPosition);
          break;
        case "port":
          onSelectPort?.(result.raw as PortData);
          break;
      }
    },
    [onSelectCountry, onSelectVessel, onSelectPort]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && highlightIndex >= 0 && filtered[highlightIndex]) {
      e.preventDefault();
      handleSelect(filtered[highlightIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setQuery("");
      inputRef.current?.blur();
    }
  };

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    setHighlightIndex(-1);
  }, [query]);

  // Group results by kind
  const grouped = useMemo(() => {
    const groups: { kind: SearchResultKind; label: string; results: SearchResult[] }[] = [];
    const countryResults = filtered.filter((r) => r.kind === "country");
    const vesselResults = filtered.filter((r) => r.kind === "vessel");
    const portResults = filtered.filter((r) => r.kind === "port");
    if (countryResults.length > 0) groups.push({ kind: "country", label: "Countries", results: countryResults });
    if (vesselResults.length > 0) groups.push({ kind: "vessel", label: "Vessels", results: vesselResults });
    if (portResults.length > 0) groups.push({ kind: "port", label: "Ports", results: portResults });
    return groups;
  }, [filtered]);

  const kindColor: Record<SearchResultKind, string> = {
    country: "text-cyan-400",
    vessel: "text-sky-400",
    port: "text-green-400",
  };

  return (
    <div className="absolute top-4 left-4 z-50 w-80">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search country, vessel, port…"
          className="w-full bg-gray-900/90 backdrop-blur-sm text-white text-sm
                     border border-gray-700 rounded-lg pl-10 pr-4 py-2.5
                     placeholder-gray-500 focus:outline-none focus:ring-2
                     focus:ring-cyan-500/50 focus:border-cyan-500 transition-all"
        />
        {query.length > 0 && (
          <button
            onClick={() => { setQuery(""); setIsOpen(false); inputRef.current?.focus(); }}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-300"
          >
            ✕
          </button>
        )}
      </div>

      {isOpen && filtered.length > 0 && (
        <div
          ref={dropdownRef}
          className="mt-1 bg-gray-900/95 backdrop-blur-sm border border-gray-700
                     rounded-lg shadow-2xl overflow-hidden max-h-96 overflow-y-auto"
        >
          {grouped.map((group) => (
            <div key={group.kind}>
              <div className={`px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold
                              bg-gray-800/60 border-b border-gray-700/50 ${kindColor[group.kind]}`}>
                {ICONS[group.kind]} {group.label}
              </div>
              {group.results.map((result) => {
                const flatIdx = filtered.indexOf(result);
                return (
                  <button
                    key={`${result.kind}_${result.id}`}
                    onClick={() => handleSelect(result)}
                    onMouseEnter={() => setHighlightIndex(flatIdx)}
                    className={`w-full px-4 py-2 flex items-center justify-between text-left
                               transition-colors ${
                                 flatIdx === highlightIndex
                                   ? "bg-cyan-500/20 text-white"
                                   : "text-gray-300 hover:bg-gray-800"
                               }`}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium truncate block">{result.primary}</span>
                      <span className="text-[11px] text-gray-500 truncate block">{result.secondary}</span>
                    </div>
                    {result.meta && (
                      <span className="text-xs text-gray-500 ml-2 whitespace-nowrap">{result.meta}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {isOpen && query.trim().length > 0 && filtered.length === 0 && (
        <div className="mt-1 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg p-3">
          <p className="text-sm text-gray-500 text-center">No results found</p>
        </div>
      )}
    </div>
  );
}

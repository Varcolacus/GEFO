"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { CountryMacro } from "@/lib/api";

interface SearchBarProps {
  countries: CountryMacro[];
  onSelect: (country: CountryMacro) => void;
}

export default function SearchBar({ countries, onSelect }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filtered = query.trim().length > 0
    ? countries
        .filter(
          (c) =>
            c.name.toLowerCase().includes(query.toLowerCase()) ||
            c.iso_code.toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, 8)
    : [];

  const handleSelect = useCallback(
    (country: CountryMacro) => {
      setQuery("");
      setIsOpen(false);
      setHighlightIndex(-1);
      onSelect(country);
    },
    [onSelect]
  );

  // Keyboard navigation
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

  // Close dropdown on outside click
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

  // Reset highlight when query changes
  useEffect(() => {
    setHighlightIndex(-1);
  }, [query]);

  const formatValue = (v: number | null | undefined) => {
    if (v == null) return "—";
    if (Math.abs(v) >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
    if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
    return `$${v.toFixed(0)}`;
  };

  return (
    <div className="absolute top-4 left-4 z-50 w-80">
      {/* Search input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg
            className="w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search country…"
          className="w-full bg-gray-900/90 backdrop-blur-sm text-white text-sm
                     border border-gray-700 rounded-lg pl-10 pr-4 py-2.5
                     placeholder-gray-500 focus:outline-none focus:ring-2
                     focus:ring-cyan-500/50 focus:border-cyan-500
                     transition-all"
        />
        {query.length > 0 && (
          <button
            onClick={() => {
              setQuery("");
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-300"
          >
            ✕
          </button>
        )}
      </div>

      {/* Dropdown results */}
      {isOpen && filtered.length > 0 && (
        <div
          ref={dropdownRef}
          className="mt-1 bg-gray-900/95 backdrop-blur-sm border border-gray-700
                     rounded-lg shadow-2xl overflow-hidden max-h-80 overflow-y-auto"
        >
          {filtered.map((country, i) => (
            <button
              key={country.iso_code}
              onClick={() => handleSelect(country)}
              onMouseEnter={() => setHighlightIndex(i)}
              className={`w-full px-4 py-2.5 flex items-center justify-between text-left
                         transition-colors ${
                           i === highlightIndex
                             ? "bg-cyan-500/20 text-white"
                             : "text-gray-300 hover:bg-gray-800"
                         }`}
            >
              <div>
                <span className="text-sm font-medium">{country.name}</span>
                <span className="ml-2 text-xs text-gray-500">
                  {country.iso_code}
                </span>
              </div>
              <span className="text-xs text-gray-500">
                GDP {formatValue(country.gdp)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* No results */}
      {isOpen && query.trim().length > 0 && filtered.length === 0 && (
        <div className="mt-1 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg p-3">
          <p className="text-sm text-gray-500 text-center">No countries found</p>
        </div>
      )}
    </div>
  );
}

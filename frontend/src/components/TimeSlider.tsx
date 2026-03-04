"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

interface TimeSliderProps {
  year: number;
  onYearChange: (year: number) => void;
  minYear?: number;
  maxYear?: number;
  availableYears?: number[];
  isLoading?: boolean;
}

const DEFAULT_MIN = 2023;
const DEFAULT_MAX = 2023;
const PLAY_INTERVAL_MS = 2000;

/* Decide label spacing: show every year if ≤8, every 2 if ≤16, every 5 otherwise */
function labelStep(span: number): number {
  if (span <= 8) return 1;
  if (span <= 16) return 2;
  return 5;
}

export default function TimeSlider({
  year,
  onYearChange,
  minYear = DEFAULT_MIN,
  maxYear = DEFAULT_MAX,
  availableYears,
  isLoading = false,
}: TimeSliderProps) {
  const [playing, setPlaying] = useState(false);
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const yearRef = useRef(year);

  const span = maxYear - minYear;
  const step = useMemo(() => labelStep(span), [span]);

  // Build the years array and label-visibility set
  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = minYear; y <= maxYear; y++) arr.push(y);
    return arr;
  }, [minYear, maxYear]);

  const showLabel = useCallback(
    (y: number) => y === minYear || y === maxYear || y % step === 0 || y === year,
    [minYear, maxYear, step, year],
  );

  // Keep ref in sync
  useEffect(() => {
    yearRef.current = year;
  }, [year]);

  // ── Play / pause ───────────────────────────────────────────────
  const stopPlayback = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setPlaying(false);
  }, []);

  const startPlayback = useCallback(() => {
    setPlaying(true);
    intervalRef.current = setInterval(() => {
      if (availableYears && availableYears.length > 0) {
        const curIdx = availableYears.indexOf(yearRef.current);
        const nextIdx = curIdx >= 0 ? curIdx + 1 : 0;
        onYearChange(
          nextIdx >= availableYears.length ? availableYears[0] : availableYears[nextIdx],
        );
      } else {
        const next = yearRef.current + 1;
        onYearChange(next > maxYear ? minYear : next);
      }
    }, PLAY_INTERVAL_MS);
  }, [maxYear, minYear, availableYears, onYearChange]);

  const togglePlay = useCallback(() => {
    playing ? stopPlayback() : startPlayback();
  }, [playing, stopPlayback, startPlayback]);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  // ── Pointer-drag on the track ──────────────────────────────────
  const yearFromPointer = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return year;
      const rect = el.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(minYear + pct * span);
    },
    [minYear, span, year],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      setDragging(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      const y = yearFromPointer(e.clientX);
      onYearChange(y);
      if (playing) stopPlayback();
    },
    [yearFromPointer, onYearChange, playing, stopPlayback],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      onYearChange(yearFromPointer(e.clientX));
    },
    [dragging, yearFromPointer, onYearChange],
  );

  const onPointerUp = useCallback(() => setDragging(false), []);

  // ── Progress % ─────────────────────────────────────────────────
  const progress = span > 0 ? ((year - minYear) / span) * 100 : 50;

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 w-[620px] max-w-[92vw]">
      <div className="bg-gray-900/90 backdrop-blur-sm rounded-xl border border-gray-700/50 shadow-2xl px-5 py-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-[10px] uppercase tracking-widest font-semibold">
              Timeline
            </span>
            {isLoading && (
              <div className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-[10px] font-mono">
              {minYear}–{maxYear}
            </span>
            <div className="text-cyan-400 font-mono text-lg font-bold tabular-nums">
              {year}
            </div>
          </div>
        </div>

        {/* Slider row */}
        <div className="flex items-center gap-3">
          {/* Play/Pause */}
          <button
            onClick={togglePlay}
            className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center transition-all ${
              playing
                ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/30"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white border border-gray-600"
            }`}
            title={playing ? "Pause" : "Play"}
          >
            {playing ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <rect x="2" y="1" width="4" height="12" rx="1" />
                <rect x="8" y="1" width="4" height="12" rx="1" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <path d="M3 1.5v11l9-5.5L3 1.5z" />
              </svg>
            )}
          </button>

          {/* Track area — captures pointer drag */}
          <div
            ref={trackRef}
            className="flex-1 relative select-none touch-none cursor-pointer"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {/* Background track */}
            <div className="h-1.5 bg-gray-700 rounded-full relative">
              <div
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full transition-[width] duration-150"
                style={{ width: `${progress}%` }}
              />
              {/* Thumb */}
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-cyan-400 border-2 border-cyan-300 shadow-lg shadow-cyan-400/40 transition-[left] duration-150 pointer-events-none"
                style={{ left: `${progress}%` }}
              />
            </div>

            {/* Tick marks + labels */}
            <div className="relative mt-1.5 h-5">
              {years.map((y) => {
                const pct = span > 0 ? ((y - minYear) / span) * 100 : 50;
                const isActive = y === year;
                const hasData = !availableYears || availableYears.includes(y);
                const show = showLabel(y);

                return (
                  <div
                    key={y}
                    className="absolute flex flex-col items-center -translate-x-1/2"
                    style={{ left: `${pct}%` }}
                  >
                    {/* Tick */}
                    <div
                      className={`transition-all ${
                        isActive
                          ? "w-1 h-3 rounded-full bg-cyan-400"
                          : hasData
                          ? "w-0.5 h-2 rounded-full bg-gray-500"
                          : "w-0.5 h-1.5 rounded-full bg-gray-700"
                      }`}
                    />
                    {/* Label */}
                    {show && (
                      <span
                        className={`text-[9px] mt-0.5 font-mono tabular-nums whitespace-nowrap ${
                          isActive
                            ? "text-cyan-400 font-bold"
                            : hasData
                            ? "text-gray-400"
                            : "text-gray-600"
                        }`}
                      >
                        {y}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step buttons */}
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => {
                if (year > minYear) onYearChange(year - 1);
                if (playing) stopPlayback();
              }}
              disabled={year <= minYear}
              className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Previous year"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <path d="M8 1L3 6l5 5V1z" />
              </svg>
            </button>
            <button
              onClick={() => {
                if (year < maxYear) onYearChange(year + 1);
                if (playing) stopPlayback();
              }}
              disabled={year >= maxYear}
              className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Next year"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <path d="M4 1l5 5-5 5V1z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

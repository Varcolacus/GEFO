"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface TimeSliderProps {
  year: number;
  onYearChange: (year: number) => void;
  minYear?: number;
  maxYear?: number;
  isLoading?: boolean;
}

const DEFAULT_MIN = 2018;
const DEFAULT_MAX = 2023;
const PLAY_INTERVAL_MS = 2000;

export default function TimeSlider({
  year,
  onYearChange,
  minYear = DEFAULT_MIN,
  maxYear = DEFAULT_MAX,
  isLoading = false,
}: TimeSliderProps) {
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const yearRef = useRef(year);

  // Keep ref in sync
  useEffect(() => {
    yearRef.current = year;
  }, [year]);

  // Play/pause logic
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
      const next = yearRef.current + 1;
      if (next > maxYear) {
        // Loop back to start
        onYearChange(minYear);
      } else {
        onYearChange(next);
      }
    }, PLAY_INTERVAL_MS);
  }, [maxYear, minYear, onYearChange]);

  const togglePlay = useCallback(() => {
    if (playing) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }, [playing, stopPlayback, startPlayback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const years = [];
  for (let y = minYear; y <= maxYear; y++) years.push(y);
  const progress = ((year - minYear) / (maxYear - minYear)) * 100;

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 w-[560px] max-w-[90vw]">
      <div className="bg-gray-900/90 backdrop-blur-sm rounded-xl border border-gray-700/50 shadow-2xl px-5 py-3">
        {/* Header row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-[10px] uppercase tracking-widest font-semibold">
              Timeline
            </span>
            {isLoading && (
              <div className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            )}
          </div>
          <div className="text-cyan-400 font-mono text-lg font-bold tabular-nums">
            {year}
          </div>
        </div>

        {/* Slider row */}
        <div className="flex items-center gap-3">
          {/* Play/Pause button */}
          <button
            onClick={togglePlay}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
              playing
                ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/30"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white border border-gray-600"
            }`}
            title={playing ? "Pause" : "Play"}
          >
            {playing ? (
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="currentColor"
              >
                <rect x="2" y="1" width="4" height="12" rx="1" />
                <rect x="8" y="1" width="4" height="12" rx="1" />
              </svg>
            ) : (
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="currentColor"
              >
                <path d="M3 1.5v11l9-5.5L3 1.5z" />
              </svg>
            )}
          </button>

          {/* Slider track */}
          <div className="flex-1 relative">
            {/* Background track */}
            <div className="h-1.5 bg-gray-700 rounded-full relative">
              {/* Progress fill */}
              <div
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Year markers */}
            <div className="relative mt-1 flex justify-between">
              {years.map((y) => {
                const isActive = y === year;
                const isPast = y < year;
                return (
                  <button
                    key={y}
                    onClick={() => {
                      onYearChange(y);
                      if (playing) stopPlayback();
                    }}
                    className="relative flex flex-col items-center group"
                  >
                    {/* Dot */}
                    <div
                      className={`w-3 h-3 rounded-full border-2 transition-all -mt-[9px] ${
                        isActive
                          ? "bg-cyan-400 border-cyan-400 scale-125 shadow-lg shadow-cyan-400/40"
                          : isPast
                          ? "bg-cyan-700 border-cyan-600"
                          : "bg-gray-700 border-gray-600 group-hover:border-gray-400"
                      }`}
                    />
                    {/* Label */}
                    <span
                      className={`text-[10px] mt-1 font-mono tabular-nums transition-colors ${
                        isActive
                          ? "text-cyan-400 font-bold"
                          : isPast
                          ? "text-gray-400"
                          : "text-gray-500 group-hover:text-gray-300"
                      }`}
                    >
                      {y}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step buttons */}
          <div className="flex gap-1">
            <button
              onClick={() => {
                if (year > minYear) onYearChange(year - 1);
                if (playing) stopPlayback();
              }}
              disabled={year <= minYear}
              className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Previous year"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="currentColor"
              >
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
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="currentColor"
              >
                <path d="M4 1l5 5-5 5V1z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";

interface InfoPanelProps {
  selectedEntity?: {
    type: string;
    data: Record<string, unknown>;
  } | null;
}

export default function InfoPanel({ selectedEntity }: InfoPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!selectedEntity && !isOpen) return null;

  return (
    <div className="absolute bottom-4 left-4 z-50 bg-gray-900/90 backdrop-blur-sm text-white rounded-lg shadow-xl border border-gray-700 w-80 max-h-96 overflow-y-auto">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold uppercase text-gray-400 tracking-wider">
            Details
          </h3>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-500 hover:text-white text-xs"
          >
            ✕
          </button>
        </div>

        {selectedEntity ? (
          <div className="space-y-2">
            <div className="text-xs text-cyan-400 uppercase">
              {selectedEntity.type}
            </div>
            {Object.entries(selectedEntity.data).map(([key, value]) => (
              <div key={key} className="flex justify-between text-sm">
                <span className="text-gray-400">{key}</span>
                <span className="text-white font-medium">
                  {String(value)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">
            Click on a feature to see details
          </p>
        )}
      </div>
    </div>
  );
}

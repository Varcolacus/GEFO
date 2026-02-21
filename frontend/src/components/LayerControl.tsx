"use client";

interface LayerControlProps {
  layers: {
    countries: boolean;
    tradeFlows: boolean;
    liveTrade: boolean;
    ports: boolean;
    shippingDensity: boolean;
    vessels: boolean;
  };
  onToggle: (layer: keyof LayerControlProps["layers"]) => void;
  indicator: string;
  onIndicatorChange: (indicator: string) => void;
  onRegionClick?: (lon: number, lat: number, altitude: number) => void;
}

const INDICATORS = [
  { value: "gdp", label: "GDP" },
  { value: "trade_balance", label: "Trade Balance" },
  { value: "current_account", label: "Current Account" },
  { value: "export_value", label: "Export Intensity" },
  { value: "trade_openness", label: "Trade Openness" },
  { value: "import_dependency", label: "Import Dependency" },
];

const REGIONS = [
  { label: "🌍 World", lon: 20, lat: 20, alt: 20000000 },
  { label: "🇪🇺 Europe", lon: 15, lat: 50, alt: 6000000 },
  { label: "🇺🇸 Americas", lon: -80, lat: 15, alt: 12000000 },
  { label: "🌏 Asia-Pacific", lon: 105, lat: 25, alt: 10000000 },
  { label: "🌍 Africa", lon: 20, lat: 0, alt: 10000000 },
  { label: "🛢️ Middle East", lon: 48, lat: 26, alt: 5000000 },
];

export default function LayerControl({
  layers,
  onToggle,
  indicator,
  onIndicatorChange,
  onRegionClick,
}: LayerControlProps) {
  return (
    <div className="absolute top-4 right-4 z-50 bg-gray-900/90 backdrop-blur-sm text-white rounded-lg shadow-xl border border-gray-700 w-72">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-bold tracking-tight">
          🌐 GEFO
        </h2>
        <p className="text-xs text-gray-400 mt-1">
          Global Economic Flow Observatory
        </p>
      </div>

      {/* Layer Toggles */}
      <div className="p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase text-gray-400 tracking-wider">
          Data Layers
        </h3>

        <ToggleSwitch
          label="Country Indicators"
          description="GDP, trade metrics"
          active={layers.countries}
          color="bg-emerald-500"
          onToggle={() => onToggle("countries")}
        />

        <ToggleSwitch
          label="Annual Trade"
          description="Historical bilateral flows"
          active={layers.tradeFlows}
          color="bg-cyan-500"
          onToggle={() => onToggle("tradeFlows")}
        />

        <ToggleSwitch
          label="Live Trade"
          description="Real-time trade events"
          active={layers.liveTrade}
          color="bg-rose-500"
          onToggle={() => onToggle("liveTrade")}
        />

        <ToggleSwitch
          label="Ports"
          description="Major world ports"
          active={layers.ports}
          color="bg-green-400"
          onToggle={() => onToggle("ports")}
        />

        <ToggleSwitch
          label="Shipping Density"
          description="Maritime traffic heatmap"
          active={layers.shippingDensity}
          color="bg-orange-500"
          onToggle={() => onToggle("shippingDensity")}
        />

        <ToggleSwitch
          label="Vessels"
          description="Real-time ship tracking"
          active={layers.vessels}
          color="bg-sky-400"
          onToggle={() => onToggle("vessels")}
        />
      </div>

      {/* Indicator Selector */}
      {layers.countries && (
        <div className="px-4 pb-3">
          <h3 className="text-xs font-semibold uppercase text-gray-400 tracking-wider mb-2">
            Macro Indicator
          </h3>
          <select
            value={indicator}
            onChange={(e) => onIndicatorChange(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            {INDICATORS.map((ind) => (
              <option key={ind.value} value={ind.value}>
                {ind.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Legend */}
      <div className="px-4 pb-4 border-t border-gray-700 pt-3">
        <h3 className="text-xs font-semibold uppercase text-gray-400 tracking-wider mb-2">
          Port Legend
        </h3>
        <div className="grid grid-cols-2 gap-1 text-xs">
          <LegendItem color="bg-green-400" label="Container" />
          <LegendItem color="bg-orange-500" label="Oil/Energy" />
          <LegendItem color="bg-yellow-400" label="Bulk" />
          <LegendItem color="bg-purple-400" label="Transit" />
        </div>
      </div>

      {/* Region Quick Nav */}
      {onRegionClick && (
        <div className="px-4 pb-4 border-t border-gray-700 pt-3">
          <h3 className="text-xs font-semibold uppercase text-gray-400 tracking-wider mb-2">
            Regions
          </h3>
          <div className="grid grid-cols-2 gap-1">
            {REGIONS.map((r) => (
              <button
                key={r.label}
                onClick={() => onRegionClick(r.lon, r.lat, r.alt)}
                className="text-xs px-2 py-1.5 rounded bg-gray-800 hover:bg-gray-700
                           text-gray-300 hover:text-white transition-colors text-left"
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Status */}
      <div className="px-4 pb-3 text-xs text-gray-500">
        Data: Delayed (free tier) • Updated monthly
      </div>
    </div>
  );
}

// ─── Sub-components ───

function ToggleSwitch({
  label,
  description,
  active,
  color,
  onToggle,
}: {
  label: string;
  description: string;
  active: boolean;
  color: string;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center justify-between p-2 rounded transition-colors ${
        active ? "bg-gray-800" : "bg-gray-800/50 opacity-60"
      } hover:bg-gray-750`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-3 h-3 rounded-full transition-colors ${
            active ? color : "bg-gray-600"
          }`}
        />
        <div className="text-left">
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs text-gray-500">{description}</div>
        </div>
      </div>
      <div
        className={`w-8 h-4 rounded-full transition-colors relative ${
          active ? color : "bg-gray-600"
        }`}
      >
        <div
          className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
            active ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </div>
    </button>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-gray-400">{label}</span>
    </div>
  );
}

"use client";

import type { TradeMode } from "@/lib/trade-modes";
import { TRADE_MODES } from "@/lib/trade-modes";

interface LayerControlProps {
  layers: {
    countries: boolean;
    tradeFlows: boolean;
    ports: boolean;
    shippingDensity: boolean;
    vessels: boolean;
    railroads: boolean;
    railroadFreight: boolean;
    airports: boolean;
    aircraft: boolean;
  };
  onToggle: (layer: keyof LayerControlProps["layers"]) => void;
  onToggleAll?: (on: boolean) => void;
  indicator: string;
  onIndicatorChange: (indicator: string) => void;
  tradeMode?: TradeMode;
  onTradeModeChange?: (mode: TradeMode) => void;
  portCategory?: string;
  onPortCategoryChange?: (cat: string) => void;
}

const INDICATOR_GROUPS = [
  {
    group: "Macro",
    items: [
      { value: "gdp", label: "GDP (US$)" },
      { value: "gdp_per_capita", label: "GDP per Capita" },
      { value: "gdp_growth", label: "GDP Growth %" },
      { value: "gdp_per_capita_ppp", label: "GDP/Capita PPP" },
      { value: "gni", label: "GNI (US$)" },
      { value: "inflation_cpi", label: "Inflation (CPI %)" },
    ],
  },
  {
    group: "Trade",
    items: [
      { value: "trade_balance", label: "Trade Balance" },
      { value: "current_account", label: "Current Account" },
      { value: "export_value", label: "Exports (US$)" },
      { value: "import_value", label: "Imports (US$)" },
      { value: "trade_pct_gdp", label: "Trade % of GDP" },
      { value: "trade_openness", label: "Trade Openness" },
      { value: "import_dependency", label: "Import Dependency" },
      { value: "external_balance_pct_gdp", label: "Ext. Balance % GDP" },
      { value: "high_tech_exports_pct", label: "High-Tech Exports %" },
      { value: "merch_exports", label: "Merch. Exports (US$)" },
      { value: "merch_imports", label: "Merch. Imports (US$)" },
    ],
  },
  {
    group: "Investment & Finance",
    items: [
      { value: "fdi_inflows_pct_gdp", label: "FDI Inflows % GDP" },
      { value: "fdi_inflows_usd", label: "FDI Inflows (US$)" },
      { value: "gross_capital_formation_pct", label: "Capital Formation %" },
      { value: "gross_savings_pct", label: "Savings % GDP" },
      { value: "total_reserves_usd", label: "Reserves incl Gold" },
      { value: "external_debt_pct_gni", label: "Ext. Debt % GNI" },
      { value: "external_debt_usd", label: "Ext. Debt (US$)" },
      { value: "remittances_usd", label: "Remittances (US$)" },
      { value: "broad_money_pct_gdp", label: "Broad Money % GDP" },
      { value: "domestic_credit_pct_gdp", label: "Dom. Credit % GDP" },
    ],
  },
  {
    group: "Fiscal",
    items: [
      { value: "govt_revenue_pct_gdp", label: "Revenue % GDP" },
      { value: "govt_expense_pct_gdp", label: "Expense % GDP" },
      { value: "govt_debt_pct_gdp", label: "Govt Debt % GDP" },
    ],
  },
  {
    group: "Demographics & Labor",
    items: [
      { value: "population", label: "Population" },
      { value: "urban_population_pct", label: "Urban Pop. %" },
      { value: "unemployment_pct", label: "Unemployment %" },
      { value: "labor_force_participation_pct", label: "Labor Participation %" },
      { value: "life_expectancy", label: "Life Expectancy" },
      { value: "gini_index", label: "GINI Index" },
      { value: "poverty_headcount_pct", label: "Poverty < $2.15/day %" },
      { value: "education_expenditure_pct_gdp", label: "Education Spend % GDP" },
    ],
  },
  {
    group: "Energy & Environment",
    items: [
      { value: "energy_use_per_capita", label: "Energy Use/Capita" },
      { value: "electricity_access_pct", label: "Electricity Access %" },
      { value: "co2_per_capita", label: "CO₂/Capita (tons)" },
      { value: "renewable_energy_pct", label: "Renewable Energy %" },
      { value: "electric_power_consumption", label: "Power Consump. kWh" },
    ],
  },
  {
    group: "Military & Governance",
    items: [
      { value: "military_expenditure_pct_gdp", label: "Military % GDP" },
      { value: "military_expenditure_usd", label: "Military Spend (US$)" },
      { value: "control_corruption", label: "Control of Corruption" },
      { value: "govt_effectiveness", label: "Govt Effectiveness" },
      { value: "regulatory_quality", label: "Regulatory Quality" },
      { value: "rule_of_law", label: "Rule of Law" },
      { value: "political_stability", label: "Political Stability" },
      { value: "voice_accountability", label: "Voice & Accountability" },
    ],
  },
  {
    group: "Technology",
    items: [
      { value: "internet_users_pct", label: "Internet Users %" },
      { value: "mobile_subscriptions_per100", label: "Mobile Subs /100" },
      { value: "rd_expenditure_pct_gdp", label: "R&D Spend % GDP" },
      { value: "patent_applications", label: "Patent Applications" },
    ],
  },
  {
    group: "Natural Resources",
    items: [
      { value: "natural_resource_rents_pct", label: "Resource Rents % GDP" },
      { value: "oil_rents_pct", label: "Oil Rents % GDP" },
      { value: "gas_rents_pct", label: "Gas Rents % GDP" },
      { value: "mineral_rents_pct", label: "Mineral Rents % GDP" },
      { value: "coal_rents_pct", label: "Coal Rents % GDP" },
      { value: "forest_rents_pct", label: "Forest Rents % GDP" },
    ],
  },
  {
    group: "Economic Structure",
    items: [
      { value: "agriculture_pct_gdp", label: "Agriculture % GDP" },
      { value: "industry_pct_gdp", label: "Industry % GDP" },
      { value: "services_pct_gdp", label: "Services % GDP" },
      { value: "arable_land_pct", label: "Arable Land %" },
    ],
  },
  {
    group: "Transport",
    items: [
      { value: "rail_freight_mtkm", label: "Rail Freight (M ton-km)" },
      { value: "rail_passengers_mkm", label: "Rail Passengers (M p-km)" },
      { value: "air_freight_mtkm", label: "Air Freight (M ton-km)" },
      { value: "air_passengers", label: "Air Passengers" },
      { value: "container_port_traffic", label: "Container Port (TEU)" },
    ],
  },
  {
    group: "Misc",
    items: [
      { value: "exchange_rate", label: "Exchange Rate (LCU/$)" },
      { value: "tariff_rate_weighted", label: "Tariff Weighted %" },
      { value: "tariff_rate_simple", label: "Tariff Simple %" },
    ],
  },
];


export default function LayerControl({
  layers,
  onToggle,
  onToggleAll,
  indicator,
  onIndicatorChange,
  tradeMode = "balance",
  onTradeModeChange,
  portCategory = "all",
  onPortCategoryChange,
}: LayerControlProps) {
  const allOn = Object.values(layers).every(Boolean);

  return (
    <div className="absolute top-16 right-4 z-50 bg-gray-900/90 backdrop-blur-sm text-white rounded-lg shadow-xl border border-gray-700 w-72 max-h-[calc(100vh-8rem)] overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight">
              🌐 GEFO
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Global Economic Flow Observatory
            </p>
          </div>
          {/* Master toggle */}
          <button
            onClick={() => onToggleAll?.(!allOn)}
            title={allOn ? "Turn all off" : "Turn all on"}
            className="flex-shrink-0"
          >
            <div
              className={`w-10 h-5 rounded-full transition-colors relative ${
                allOn ? "bg-cyan-500" : "bg-gray-600"
              }`}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  allOn ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </div>
          </button>
        </div>
      </div>

      {/* Layer Toggles */}
      <div className="p-4 space-y-3">
        <ToggleSwitch
          label="Country Indicators"
          description="GDP, trade metrics"
          active={layers.countries}
          color="bg-emerald-500"
          onToggle={() => onToggle("countries")}
        />

        {/* Indicator Selector — visible when Country Indicators layer is active */}
        {layers.countries && (
          <div className="ml-4 mb-1">
            <select
              value={indicator}
              onChange={(e) => onIndicatorChange(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              {INDICATOR_GROUPS.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.items.map((ind) => (
                    <option key={ind.value} value={ind.value}>
                      {ind.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        )}

        <ToggleSwitch
          label="Trade"
          description="Historical bilateral flows"
          active={layers.tradeFlows}
          color="bg-cyan-500"
          onToggle={() => onToggle("tradeFlows")}
        />

        {/* Trade Mode Selector — visible when Trade layer is active */}
        {layers.tradeFlows && (
          <div className="ml-4 mb-1">
            <div className="flex flex-wrap gap-1">
              {TRADE_MODES.map((m) => (
                <button
                  key={m.value}
                  onClick={() => onTradeModeChange?.(m.value)}
                  title={m.description}
                  className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
                    tradeMode === m.value
                      ? "bg-cyan-500/30 border-cyan-500/60 text-cyan-300"
                      : "bg-gray-800/60 border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500"
                  }`}
                >
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <ToggleSwitch
          label="Ports"
          description="Sea ports & nautical features"
          active={layers.ports}
          color="bg-green-400"
          onToggle={() => onToggle("ports")}
        />

        {layers.ports && (
          <div className="ml-4 mb-1 flex flex-wrap gap-1">
            {[
              { value: "all", label: "All", color: "bg-gray-400" },
              { value: "container", label: "Container", color: "bg-green-400" },
              { value: "oil", label: "Oil/Energy", color: "bg-orange-500" },
              { value: "bulk", label: "Bulk", color: "bg-yellow-400" },
              { value: "transit", label: "Transit", color: "bg-purple-400" },
            ].map((cat) => (
              <button
                key={cat.value}
                onClick={() => onPortCategoryChange?.(cat.value)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
                  portCategory === cat.value
                    ? "bg-white/20 text-white font-medium"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${cat.color}`} />
                {cat.label}
              </button>
            ))}
          </div>
        )}

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

        <ToggleSwitch
          label="Aircraft"
          description="Real-time flight tracking"
          active={layers.aircraft}
          color="bg-amber-400"
          onToggle={() => onToggle("aircraft")}
        />

        <ToggleSwitch
          label="Railroads"
          description="Railway network & freight"
          active={layers.railroads}
          color="bg-red-400"
          onToggle={() => onToggle("railroads")}
        />

        {layers.railroads && (
          <div className="ml-4 mb-1 flex flex-col gap-1">
            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={layers.railroads}
                onChange={() => onToggle("railroads")}
                className="accent-red-400 w-3.5 h-3.5"
              />
              Rail Network
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={layers.railroadFreight}
                onChange={() => onToggle("railroadFreight")}
                className="accent-orange-400 w-3.5 h-3.5"
              />
              Freight Flows
            </label>
          </div>
        )}

        <ToggleSwitch
          label="Airports"
          description="Airfields & aerodromes"
          active={layers.airports}
          color="bg-violet-400"
          onToggle={() => onToggle("airports")}
        />
      </div>

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

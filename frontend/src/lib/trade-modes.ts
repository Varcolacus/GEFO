/**
 * Trade visualization modes for the globe.
 * Controls how trade flow arcs are filtered and colored when a country is selected.
 */

export type TradeMode = "all" | "exports" | "imports" | "balance" | "volume";

export interface TradeModeInfo {
  value: TradeMode;
  label: string;
  icon: string;
  description: string;
  /** Color used for arcs in this mode */
  arcColor: string;
}

export const TRADE_MODES: TradeModeInfo[] = [
  {
    value: "all",
    label: "All Flows",
    icon: "🔄",
    description: "All bilateral trade flows",
    arcColor: "cyan",
  },
  {
    value: "exports",
    label: "Exports",
    icon: "📤",
    description: "Outgoing export flows",
    arcColor: "green",
  },
  {
    value: "imports",
    label: "Imports",
    icon: "📥",
    description: "Incoming import flows",
    arcColor: "red",
  },
  {
    value: "balance",
    label: "Balance",
    icon: "⚖️",
    description: "Net trade balance (surplus/deficit)",
    arcColor: "yellow",
  },
  {
    value: "volume",
    label: "Volume",
    icon: "📊",
    description: "Total trade volume (exports + imports)",
    arcColor: "purple",
  },
];

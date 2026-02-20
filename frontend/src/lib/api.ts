import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

// ─── Types ───

export interface CountryMacro {
  iso_code: string;
  name: string;
  region?: string;
  sub_region?: string;
  gdp?: number;
  gdp_per_capita?: number;
  trade_balance?: number;
  current_account?: number;
  export_value?: number;
  import_value?: number;
  population?: number;
  centroid_lat?: number;
  centroid_lon?: number;
}

export interface TradeFlowAggregated {
  exporter_iso: string;
  importer_iso: string;
  total_value_usd: number;
  exporter_lat?: number;
  exporter_lon?: number;
  importer_lat?: number;
  importer_lon?: number;
}

export interface PortData {
  id: number;
  name: string;
  country_iso: string;
  lat: number;
  lon: number;
  port_type?: string;
  throughput_teu?: number;
  throughput_tons?: number;
  year?: number;
  unlocode?: string;
}

export interface ShippingDensityPoint {
  lat: number;
  lon: number;
  density_value: number;
  year: number;
  month: number;
  vessel_type?: string;
}

export interface ShippingDensityGrid {
  data: ShippingDensityPoint[];
  min_density: number;
  max_density: number;
}

export interface TradePartner {
  iso_code: string;
  name: string;
  total_value_usd: number;
  direction: string;
}

export interface TradeYearSummary {
  year: number;
  total_exports: number;
  total_imports: number;
  trade_balance: number;
  top_export_partner?: string;
  top_import_partner?: string;
}

export interface CountryProfile {
  country: CountryMacro;
  top_export_partners: TradePartner[];
  top_import_partners: TradePartner[];
  trade_history: TradeYearSummary[];
  ports: PortData[];
}

// ─── API Calls ───

export async function fetchCountries(region?: string): Promise<CountryMacro[]> {
  const params = region ? { region } : {};
  const response = await api.get("/api/countries", { params });
  return response.data;
}

export async function fetchCountriesGeoJSON(
  indicator: string = "gdp"
): Promise<Record<string, unknown>> {
  const response = await api.get("/api/countries/geojson", {
    params: { indicator },
  });
  return response.data;
}

export async function fetchTradeFlows(
  year: number,
  topN: number = 100
): Promise<TradeFlowAggregated[]> {
  const response = await api.get("/api/trade_flows/aggregated", {
    params: { year, top_n: topN },
  });
  return response.data;
}

export async function fetchPorts(
  country?: string
): Promise<PortData[]> {
  const params = country ? { country } : {};
  const response = await api.get("/api/ports", { params });
  return response.data;
}

export async function fetchShippingDensity(
  year: number,
  month?: number
): Promise<ShippingDensityGrid> {
  const params: Record<string, number> = { year };
  if (month) params.month = month;
  const response = await api.get("/api/shipping_density", { params });
  return response.data;
}

export async function fetchCountryProfile(
  isoCode: string
): Promise<CountryProfile> {
  const response = await api.get(`/api/countries/${isoCode}/profile`);
  return response.data;
}

// ─── Intelligence API (Phase 2) ───

export interface ChokepointStatus {
  name: string;
  lat: number;
  lon: number;
  description: string;
  current_density: number;
  baseline_mean: number;
  baseline_std: number;
  z_score: number;
  stress_level: string;
  oil_share_pct: number;
  lng_share_pct: number;
  capacity_daily_transits: number;
  quarterly: { quarter: number; density: number; z_score: number }[];
}

export interface PortStressEntry {
  port_id: number;
  port_name: string;
  country_iso: string;
  lat: number;
  lon: number;
  port_type: string;
  throughput_teu: number;
  region: string;
  psi: number;
  stress_level: string;
  components: {
    throughput_ratio: number;
    density_factor: number;
    utilization: number;
  };
  nearby_density: number;
  regional_avg_teu: number;
}

export interface TFIICorridor {
  exporter_iso: string;
  importer_iso: string;
  trade_value_usd: number;
  avg_lane_density: number;
  tfii: number;
  lanes: string[];
  interpretation: string;
}

export interface EnergyExposureEntry {
  iso_code: string;
  ecei: number;
  risk_level: string;
  total_trade_usd: number;
  chokepoint_exposure: {
    chokepoint: string;
    trade_share: number;
    energy_weight: number;
    contribution: number;
  }[];
}

export interface BaselineMetric {
  metric: string;
  current_year: number;
  current_value: number;
  baseline_mean: number;
  baseline_std: number;
  z_score: number;
  classification: string;
  trend: string;
  yoy_growth?: number;
  yearly_data?: Record<string, unknown>[];
}

export interface IntelligenceDashboard {
  year: number;
  chokepoint_monitor: {
    total: number;
    stressed_count: number;
    stressed: ChokepointStatus[];
    all: ChokepointStatus[];
  };
  port_stress: {
    total_ports: number;
    mean_psi: number;
    max_psi: number;
    min_psi: number;
    by_level: Record<string, number>;
    most_stressed: PortStressEntry[];
    least_stressed: PortStressEntry[];
  };
  top_tfii_corridors: TFIICorridor[];
  energy_exposure: {
    most_exposed: EnergyExposureEntry[];
    total_countries: number;
  };
  baselines: {
    reference_year: number;
    metrics: BaselineMetric[];
    summary: { total_metrics: number; anomalies: number };
  };
  alerts: {
    severity: string;
    type: string;
    message: string;
  }[];
}

export async function fetchIntelligenceDashboard(
  year: number = 2023
): Promise<IntelligenceDashboard> {
  const response = await api.get("/api/intelligence/dashboard", {
    params: { year },
  });
  return response.data;
}

export async function fetchChokepoints(
  year: number = 2023
): Promise<ChokepointStatus[]> {
  const response = await api.get("/api/intelligence/chokepoints", {
    params: { year },
  });
  return response.data.chokepoints;
}

export async function fetchPortStress(
  year: number = 2023
): Promise<PortStressEntry[]> {
  const response = await api.get("/api/intelligence/port-stress", {
    params: { year },
  });
  return response.data.ports;
}

export async function fetchTFIICorridors(
  year: number = 2023,
  topN: number = 50
): Promise<TFIICorridor[]> {
  const response = await api.get("/api/intelligence/tfii/corridors", {
    params: { year, top_n: topN },
  });
  return response.data.corridors;
}

export async function fetchEnergyExposure(
  year: number = 2023
): Promise<EnergyExposureEntry[]> {
  const response = await api.get("/api/intelligence/energy/exposure", {
    params: { year },
  });
  return response.data.countries;
}

export default api;

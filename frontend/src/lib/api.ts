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

export default api;

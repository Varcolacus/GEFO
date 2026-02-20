import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

// Attach JWT token to requests if available
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("gefo_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
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


// ─── Auth Types ───

export interface UserProfile {
  id: number;
  email: string;
  full_name: string | null;
  organisation: string | null;
  tier: "free" | "pro" | "institutional";
  subscription_status: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  api_key_count: number;
}

export interface AuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: UserProfile;
}

export interface APIKeyInfo {
  id: number;
  key_prefix: string;
  label: string | null;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  request_count: number;
}

export interface APIKeyCreated {
  id: number;
  key: string;
  key_prefix: string;
  label: string | null;
}

export interface SubscriptionInfo {
  tier: string;
  status: string;
  limits: {
    requests_per_minute: number;
    requests_per_day: number;
    max_api_keys: number;
    csv_export: boolean;
    intelligence_access: boolean;
  };
}

// ─── Auth Functions ───

export async function registerUser(
  email: string,
  password: string,
  fullName?: string,
  organisation?: string
): Promise<AuthToken> {
  const response = await api.post("/api/auth/register", {
    email,
    password,
    full_name: fullName,
    organisation,
  });
  return response.data;
}

export async function loginUser(
  email: string,
  password: string
): Promise<AuthToken> {
  const params = new URLSearchParams();
  params.append("username", email);
  params.append("password", password);
  const response = await api.post("/api/auth/login", params, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return response.data;
}

export async function fetchProfile(): Promise<UserProfile> {
  const response = await api.get("/api/auth/me");
  return response.data;
}

export async function updateProfile(data: {
  full_name?: string;
  organisation?: string;
}): Promise<UserProfile> {
  const response = await api.patch("/api/auth/me", data);
  return response.data;
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  await api.post("/api/auth/change-password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
}

export async function fetchSubscription(): Promise<SubscriptionInfo> {
  const response = await api.get("/api/auth/subscription");
  return response.data;
}

// ─── API Key Functions ───

export async function createAPIKey(label?: string): Promise<APIKeyCreated> {
  const response = await api.post("/api/keys/", { label });
  return response.data;
}

export async function fetchAPIKeys(): Promise<APIKeyInfo[]> {
  const response = await api.get("/api/keys/");
  return response.data;
}

export async function revokeAPIKey(keyId: number): Promise<void> {
  await api.delete(`/api/keys/${keyId}`);
}

// ─── Billing ───

export async function createCheckoutSession(
  tier: "pro" | "institutional"
): Promise<{ checkout_url: string; session_id: string }> {
  const response = await api.post("/api/billing/checkout", {
    tier,
    success_url: `${window.location.origin}/account?status=success`,
    cancel_url: `${window.location.origin}/account?status=cancel`,
  });
  return response.data;
}

export async function createPortalSession(): Promise<{ portal_url: string }> {
  const response = await api.post("/api/billing/portal");
  return response.data;
}

export default api;

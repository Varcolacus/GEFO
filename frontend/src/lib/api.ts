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

// ─── Alert Types ───

export interface AlertRuleInfo {
  id: number;
  name: string;
  rule_type: string;
  is_enabled: boolean;
  config: Record<string, unknown>;
  cooldown_minutes: number;
  created_at: string;
  alert_count: number;
}

export interface AlertInfo {
  id: number;
  rule_id: number;
  rule_name: string;
  severity: "info" | "warning" | "critical";
  status: "active" | "acknowledged" | "resolved";
  title: string;
  message: string;
  details: Record<string, unknown> | null;
  triggered_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  email_sent: boolean;
  webhook_sent: boolean;
}

export interface AlertSummary {
  total_active: number;
  critical: number;
  warning: number;
  info: number;
  latest: AlertInfo[];
}

export interface AlertList {
  total: number;
  unread: number;
  alerts: AlertInfo[];
}

export interface ChannelInfo {
  id: number;
  channel_type: "email" | "webhook";
  is_enabled: boolean;
  target: string;
  label: string | null;
  created_at: string;
}

// ─── Alert API ───

export async function fetchAlertSummary(): Promise<AlertSummary> {
  const response = await api.get("/api/alerts/summary");
  return response.data;
}

export async function fetchAlerts(
  status?: string,
  severity?: string,
  limit = 50
): Promise<AlertList> {
  const params: Record<string, string | number> = { limit };
  if (status) params.status = status;
  if (severity) params.severity = severity;
  const response = await api.get("/api/alerts/", { params });
  return response.data;
}

export async function acknowledgeAlerts(alertIds: number[]): Promise<{ acknowledged: number }> {
  const response = await api.post("/api/alerts/acknowledge", { alert_ids: alertIds });
  return response.data;
}

export async function acknowledgeAllAlerts(): Promise<{ acknowledged: number }> {
  const response = await api.post("/api/alerts/acknowledge-all");
  return response.data;
}

export async function triggerAlertCheck(): Promise<{
  checked_at: string;
  new_alerts: number;
  alerts: AlertInfo[];
}> {
  const response = await api.post("/api/alerts/check");
  return response.data;
}

// ─── Alert Rules API ───

export async function fetchAlertRules(): Promise<AlertRuleInfo[]> {
  const response = await api.get("/api/alerts/rules");
  return response.data;
}

export async function createAlertRule(rule: {
  name: string;
  rule_type: string;
  config: Record<string, unknown>;
  cooldown_minutes?: number;
}): Promise<AlertRuleInfo> {
  const response = await api.post("/api/alerts/rules", rule);
  return response.data;
}

export async function updateAlertRule(
  ruleId: number,
  update: { name?: string; is_enabled?: boolean; config?: Record<string, unknown>; cooldown_minutes?: number }
): Promise<AlertRuleInfo> {
  const response = await api.patch(`/api/alerts/rules/${ruleId}`, update);
  return response.data;
}

export async function deleteAlertRule(ruleId: number): Promise<void> {
  await api.delete(`/api/alerts/rules/${ruleId}`);
}

// ─── Notification Channels API ───

export async function fetchChannels(): Promise<ChannelInfo[]> {
  const response = await api.get("/api/alerts/channels");
  return response.data;
}

export async function createChannel(channel: {
  channel_type: "email" | "webhook";
  target: string;
  label?: string;
  secret?: string;
}): Promise<ChannelInfo> {
  const response = await api.post("/api/alerts/channels", channel);
  return response.data;
}

export async function deleteChannel(channelId: number): Promise<void> {
  await api.delete(`/api/alerts/channels/${channelId}`);
}

// ─── Admin API ───

export interface PlatformStats {
  total_users: number;
  active_users: number;
  users_by_tier: Record<string, number>;
  total_api_keys: number;
  total_alert_rules: number;
  total_alerts_triggered: number;
  total_notification_channels: number;
  db_counts: Record<string, number>;
  scheduler_status: Record<string, unknown>;
}

export interface AdminUserSummary {
  id: number;
  email: string;
  full_name?: string;
  organisation?: string;
  tier: string;
  subscription_status: string;
  is_active: boolean;
  is_admin: boolean;
  api_key_count: number;
  alert_rule_count: number;
  created_at: string;
}

export interface AdminUserUpdate {
  tier?: string;
  is_active?: boolean;
  is_admin?: boolean;
}

export interface EndpointUsage {
  endpoint: string;
  method: string;
  count: number;
  avg_response_ms: number | null;
}

export interface DailyUsage {
  date: string;
  request_count: number;
}

export interface UserUsage {
  user_id: number;
  email: string;
  tier: string;
  request_count: number;
  last_request?: string;
}

export interface UsageAnalytics {
  total_requests: number;
  requests_today: number;
  requests_this_week: number;
  top_endpoints: EndpointUsage[];
  daily_trend: DailyUsage[];
  top_users: UserUsage[];
  error_rate: number;
}

export interface SystemHealth {
  status: string;
  database: Record<string, unknown>;
  scheduler: Record<string, unknown>;
  uptime_seconds: number;
  api_version: string;
  python_version: string;
}

export interface ActivityEntry {
  id: number;
  user_email: string;
  endpoint: string;
  method: string;
  status_code: number;
  response_time_ms: number | null;
  ip_address: string;
  timestamp: string | null;
}

export async function fetchPlatformStats(): Promise<PlatformStats> {
  const response = await api.get("/api/admin/stats");
  return response.data;
}

export async function fetchAdminUsers(tier?: string, search?: string): Promise<AdminUserSummary[]> {
  const params: Record<string, string> = {};
  if (tier) params.tier = tier;
  if (search) params.search = search;
  const response = await api.get("/api/admin/users", { params });
  return response.data;
}

export async function updateAdminUser(userId: number, update: AdminUserUpdate): Promise<AdminUserSummary> {
  const response = await api.patch(`/api/admin/users/${userId}`, update);
  return response.data;
}

export async function deleteAdminUser(userId: number): Promise<void> {
  await api.delete(`/api/admin/users/${userId}`);
}

export async function fetchUsageAnalytics(days?: number): Promise<UsageAnalytics> {
  const response = await api.get("/api/admin/usage", { params: days ? { days } : {} });
  return response.data;
}

export async function fetchSystemHealth(): Promise<SystemHealth> {
  const response = await api.get("/api/admin/health");
  return response.data;
}

export async function fetchRecentActivity(limit?: number): Promise<ActivityEntry[]> {
  const response = await api.get("/api/admin/activity", { params: limit ? { limit } : {} });
  return response.data.activity;
}

export async function bootstrapAdmin(): Promise<{ message: string; user_id: number }> {
  const response = await api.post("/api/admin/bootstrap");
  return response.data;
}

// ─── Geopolitical Risk & Sanctions ───

export interface RiskScoreComponents {
  sanctions: number;
  conflict: number;
  trade_dependency: number;
  chokepoint_vulnerability: number;
  energy_risk: number;
}

export interface CountryRiskEntry {
  iso_code: string;
  name: string;
  lat: number;
  lon: number;
  scores: RiskScoreComponents;
  composite_risk: number;
  risk_level: string;
}

export interface RiskScoresResponse {
  indicator: string;
  year: number;
  count: number;
  countries: CountryRiskEntry[];
}

export interface SanctionedEntity {
  id: number;
  entity_type: string;
  name: string;
  country_iso: string | null;
  sanctioning_body: string;
  programme: string | null;
  reason: string | null;
  date_listed: string | null;
  date_delisted: string | null;
  is_active: boolean;
  identifiers: string | null;
}

export interface ConflictZone {
  id: number;
  name: string;
  zone_type: string;
  severity: string;
  lat: number;
  lon: number;
  radius_km: number;
  affected_countries: string[];
  affected_chokepoints: string[];
  description: string | null;
  start_date: string | null;
  is_active: boolean;
}

export interface SanctionsSummary {
  total_active: number;
  by_sanctioning_body: Record<string, number>;
  by_entity_type: Record<string, number>;
  most_sanctioned_countries: { iso_code: string; count: number }[];
}

export interface SupplyChainRoute {
  id: number;
  name: string;
  origin_iso: string;
  destination_iso: string;
  commodity: string;
  chokepoints_transit: string[];
  annual_value_usd: number;
  vulnerability_score: number;
  risk_factors: string[];
  alternative_routes: string | null;
  is_active: boolean;
}

export interface GeoDashboard {
  risk_overview: {
    total_countries: number;
    critical: number;
    high: number;
    elevated: number;
    moderate: number;
    low: number;
    avg_composite: number;
    top_risk: CountryRiskEntry[];
  };
  sanctions: SanctionsSummary;
  conflict_zones: {
    total_active: number;
    by_severity: Record<string, number>;
    zones: ConflictZone[];
  };
  supply_chain: {
    total_routes: number;
    avg_vulnerability: number;
    most_vulnerable: SupplyChainRoute[];
  };
}

export async function fetchRiskScores(year?: number, topN?: number): Promise<RiskScoresResponse> {
  const params: Record<string, string | number> = {};
  if (year) params.year = year;
  if (topN) params.top_n = topN;
  const response = await api.get("/api/geopolitical/risk-scores", { params });
  return response.data;
}

export async function fetchCountryRisk(isoCode: string, year?: number): Promise<Record<string, unknown>> {
  const params: Record<string, number> = {};
  if (year) params.year = year;
  const response = await api.get(`/api/geopolitical/risk-scores/${isoCode}`, { params });
  return response.data;
}

export async function fetchSanctionsSummary(): Promise<SanctionsSummary> {
  const response = await api.get("/api/geopolitical/sanctions");
  return response.data;
}

export async function fetchSanctionedEntities(body?: string, entityType?: string): Promise<SanctionedEntity[]> {
  const params: Record<string, string> = {};
  if (body) params.sanctioning_body = body;
  if (entityType) params.entity_type = entityType;
  const response = await api.get("/api/geopolitical/sanctions/entities", { params });
  return response.data;
}

export async function fetchConflictZones(): Promise<ConflictZone[]> {
  const response = await api.get("/api/geopolitical/conflict-zones");
  return response.data;
}

export async function fetchSupplyChains(): Promise<SupplyChainRoute[]> {
  const response = await api.get("/api/geopolitical/supply-chains");
  return response.data;
}

export async function fetchGeoDashboard(): Promise<GeoDashboard> {
  const response = await api.get("/api/geopolitical/dashboard");
  return response.data;
}

export default api;

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
  topN: number = 500
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

// ─── Analytics & Forecasting Types (Phase 8) ───

export interface ForecastPoint {
  predicted: number;
  lower: number;
  upper: number;
  model: string;
}

export interface AnomalyEntry {
  index: number;
  label: string;
  value: number;
  expected: number;
  z_score: number;
  type: string;
  severity: string;
  method?: string;
  if_score?: number;
}

export interface TrendInfo {
  slope: number;
  intercept: number;
  r_squared: number;
  direction: string;
}

export interface YoYGrowthEntry {
  iso_code: string;
  name: string;
  current_value: number;
  previous_value: number;
  change_usd: number;
  growth_pct: number;
  year: number;
}

export interface TopMovers {
  gainers: YoYGrowthEntry[];
  losers: YoYGrowthEntry[];
  year: number;
}

export interface GlobalTrend {
  labels: string[];
  values: number[];
  flow_counts: number[];
  trend: TrendInfo;
  forecast: { labels: string[]; predictions: ForecastPoint[] };
  summary: {
    total_years: number;
    min: number;
    max: number;
    latest: number;
    cagr: number | null;
  };
}

export interface CountryAnalyticsResult {
  iso_code: string;
  direction: string;
  data_points: number;
  historical: { labels: string[]; values: number[] };
  trend: TrendInfo;
  forecast: { labels: string[]; predictions: ForecastPoint[] };
  anomalies: AnomalyEntry[];
  summary: {
    min: number;
    max: number;
    mean: number;
    std: number;
    latest: number;
    cagr: number | null;
  };
  error?: string;
}

export interface AnomalyCountrySummary {
  iso_code: string;
  count: number;
  critical: number;
  worst_z: number;
}

export interface AnalyticsDashboard {
  global_trend: GlobalTrend;
  top_movers: TopMovers;
  anomaly_summary: {
    countries_scanned: number;
    total_anomalies: number;
    critical_anomalies: number;
    by_country: AnomalyCountrySummary[];
  };
  year: number;
}

// ─── Analytics & Forecasting Fetchers ───

export async function fetchAnalyticsDashboard(year: number = 2023): Promise<AnalyticsDashboard> {
  const response = await api.get("/api/analytics/dashboard", { params: { year } });
  return response.data;
}

export async function fetchGlobalTrend(): Promise<GlobalTrend> {
  const response = await api.get("/api/analytics/global-trend");
  return response.data;
}

export async function fetchYoYGrowth(year: number = 2023, limit: number = 30): Promise<YoYGrowthEntry[]> {
  const response = await api.get("/api/analytics/yoy-growth", { params: { year, limit } });
  return response.data;
}

export async function fetchTopMovers(year: number = 2023, limit: number = 10): Promise<TopMovers> {
  const response = await api.get("/api/analytics/top-movers", { params: { year, limit } });
  return response.data;
}

export async function fetchCountryAnalytics(
  isoCode: string,
  direction: string = "export",
  horizon: number = 3,
): Promise<CountryAnalyticsResult> {
  const response = await api.get(`/api/analytics/country/${isoCode}`, {
    params: { direction, horizon },
  });
  return response.data;
}

// ─── Data Import Types ───

export interface ImportPreview {
  filename: string;
  total_rows: number;
  file_columns: string[];
  auto_mapping: Record<string, string>;
  missing_required: string[];
  preview_rows: Record<string, unknown>[];
  schema: Record<string, unknown>;
  temp_file: string;
}

export interface ImportJob {
  id: number;
  source_name: string;
  target_table: string;
  status: string;
  total_rows: number;
  imported_rows: number;
  error_rows: number;
  import_mode: string;
  created_at: string;
}

export interface ImportJobDetail extends ImportJob {
  user_id: number;
  source_type: string;
  progress_pct: number;
  valid_rows: number;
  skipped_rows: number;
  column_mapping: Record<string, string>;
  year_filter: number | null;
  error_log: Array<{ row: number; field: string; error: string }>;
  error_summary: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface ImportSchema {
  columns: Record<string, { type: string; required: boolean; constraints?: Record<string, unknown> }>;
  required_columns: string[];
}

export interface TableStats {
  row_count: number;
  year_range: { min: number; max: number } | null;
}

export interface ConnectorInfo {
  id: string;
  name: string;
  description: string;
  target_table: string;
  requires_api_key: boolean;
  indicators?: [string, string][];
}

// ─── Data Import Functions ───

export async function uploadImportFile(file: File, targetTable: string): Promise<ImportPreview> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("target_table", targetTable);
  const response = await api.post("/api/import/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export async function executeImport(
  tempFile: string,
  targetTable: string,
  columnMapping: Record<string, string>,
  importMode: string = "append",
  yearFilter?: number,
): Promise<Record<string, unknown>> {
  const response = await api.post("/api/import/execute", {
    temp_file: tempFile,
    target_table: targetTable,
    column_mapping: columnMapping,
    import_mode: importMode,
    year_filter: yearFilter,
  });
  return response.data;
}

export async function fetchImportJobs(limit: number = 20): Promise<ImportJob[]> {
  const response = await api.get("/api/import/jobs", { params: { limit } });
  return response.data;
}

export async function fetchImportJobDetail(jobId: number): Promise<ImportJobDetail> {
  const response = await api.get(`/api/import/jobs/${jobId}`);
  return response.data;
}

export async function fetchImportSchemas(): Promise<Record<string, ImportSchema>> {
  const response = await api.get("/api/import/schemas");
  return response.data;
}

export async function fetchImportStats(): Promise<Record<string, TableStats>> {
  const response = await api.get("/api/import/stats");
  return response.data;
}

export async function fetchImportConnectors(): Promise<ConnectorInfo[]> {
  const response = await api.get("/api/import/connectors");
  return response.data;
}

// ─── Commodity & Supply Chain Types ───

export interface CommodityInfo {
  id: number;
  hs_code: string;
  name: string;
  category: string;
  sub_category: string | null;
  unit: string;
  is_strategic: boolean;
  icon: string | null;
}

export interface CommodityPricePoint {
  year: number;
  month: number;
  price: number;
  price_change_pct: number | null;
  yoy_change_pct: number | null;
  high: number | null;
  low: number | null;
}

export interface CommodityPriceSummary {
  latest_price: number;
  latest_period: string;
  unit: string;
  min_price: number;
  max_price: number;
  avg_price: number;
  volatility: number;
  yoy_change_pct: number | null;
  total_periods: number;
}

export interface CommodityPriceHistory {
  commodity: CommodityInfo;
  prices: CommodityPricePoint[];
  summary: CommodityPriceSummary;
}

export interface CommodityDashboardItem {
  commodity_id: number;
  name: string;
  hs_code: string;
  category: string;
  icon: string | null;
  unit: string;
  is_strategic: boolean;
  price: number;
  price_change_pct: number | null;
  yoy_change_pct: number | null;
  period: string;
}

export interface CommodityDashboard {
  year: number;
  total_commodities: number;
  tracked_with_prices: number;
  latest_prices: CommodityDashboardItem[];
  top_movers: CommodityDashboardItem[];
  categories: { category: string; count: number; avg_yoy_change: number }[];
}

export interface CommodityFlowEdge {
  exporter_iso: string;
  importer_iso: string;
  value_usd: number;
  weight: number;
  exporter_lat: number;
  exporter_lon: number;
  importer_lat: number;
  importer_lon: number;
}

export interface CommodityFlowGraph {
  commodity_code: string;
  commodity_name: string;
  icon: string | null;
  year: number;
  nodes: { iso: string; name: string; lat: number; lon: number }[];
  edges: CommodityFlowEdge[];
  total_value: number;
}

export interface SupplyDependencyItem {
  country_iso: string;
  commodity_id: number;
  commodity_name: string;
  year: number;
  direction: string;
  value_usd: number;
  share_pct: number | null;
  world_share_pct: number | null;
  top_partner_iso: string | null;
  concentration_hhi: number | null;
  risk_score: number | null;
}

export interface SupplyRiskEntry {
  commodity_id: number;
  commodity_name: string;
  hs_code: string;
  icon: string | null;
  category: string;
  avg_risk_score: number;
  max_concentration_hhi: number;
  dependent_countries: number;
  top_dependencies: {
    country_iso: string;
    value_usd: number;
    share_pct: number | null;
    risk_score: number | null;
  }[];
}

export interface SupplyRiskMatrix {
  year: number;
  strategic_commodities: number;
  risk_matrix: SupplyRiskEntry[];
}

// ─── Commodity & Supply Chain Functions ───

export async function fetchCommodities(category?: string, strategicOnly?: boolean): Promise<CommodityInfo[]> {
  const response = await api.get("/api/commodities/", {
    params: { category, strategic_only: strategicOnly },
  });
  return response.data;
}

export async function fetchCommodityDashboard(year: number = 2023): Promise<CommodityDashboard> {
  const response = await api.get("/api/commodities/dashboard", { params: { year } });
  return response.data;
}

export async function fetchCommodityPrices(commodityId: number, startYear?: number, endYear?: number): Promise<CommodityPriceHistory> {
  const response = await api.get(`/api/commodities/${commodityId}/prices`, {
    params: { start_year: startYear, end_year: endYear },
  });
  return response.data;
}

export async function fetchCommodityFlowGraph(commodityCode: string, year: number = 2023, topN: number = 15): Promise<CommodityFlowGraph> {
  const response = await api.get(`/api/commodities/flows/${commodityCode}`, {
    params: { year, top_n: topN },
  });
  return response.data;
}

export async function fetchSupplyRiskMatrix(year: number = 2023): Promise<SupplyRiskMatrix> {
  const response = await api.get("/api/commodities/supply-risk", { params: { year } });
  return response.data;
}

export async function fetchSupplyDependencies(countryIso?: string, commodityId?: number, year?: number, direction?: string): Promise<SupplyDependencyItem[]> {
  const response = await api.get("/api/commodities/dependencies", {
    params: { country_iso: countryIso, commodity_id: commodityId, year, direction },
  });
  return response.data;
}

export async function fetchCountryCommodityProfile(countryIso: string, year: number = 2023): Promise<Record<string, unknown>> {
  const response = await api.get(`/api/commodities/country/${countryIso}`, { params: { year } });
  return response.data;
}

// ─── Phase 11: Data Sources & Economic Groups Types ───

export interface NationalDataSourceInfo {
  id: number;
  country_iso: string;
  iso2?: string;
  institution: string;
  api_url?: string;
  docs_url?: string;
  auth_required: boolean;
  quality: string;
  coverage: string;
  update_frequency: string;
  data_format?: string;
  tier: string;
  is_active: boolean;
  last_fetch_at?: string;
  last_fetch_status?: string;
  fetch_error_count: number;
  circuit_breaker_until?: string;
}

export interface DataSourceStats {
  total: number;
  by_tier: Record<string, number>;
  by_format: Record<string, number>;
  by_status: Record<string, number>;
}

export interface EconomicGroupInfo {
  code: string;
  name: string;
  category: string;
  member_count: number;
}

export interface EconomicGroupDetail extends EconomicGroupInfo {
  members: {
    iso_code: string;
    name: string;
    flag_emoji?: string;
    capital?: string;
    income_group?: string;
    centroid_lat?: number;
    centroid_lon?: number;
  }[];
}

// ─── Phase 11: Data Sources & Economic Groups Functions ───

export async function fetchDataSources(tier?: string): Promise<{ count: number; sources: NationalDataSourceInfo[] }> {
  const response = await api.get("/api/data-sources/", { params: { tier } });
  return response.data;
}

export async function fetchDataSourcesByCountry(countryIso: string): Promise<{ country_iso: string; count: number; sources: NationalDataSourceInfo[] }> {
  const response = await api.get(`/api/data-sources/by-country/${countryIso}`);
  return response.data;
}

export async function fetchDataSourceStats(): Promise<DataSourceStats> {
  const response = await api.get("/api/data-sources/stats");
  return response.data;
}

export async function fetchEconomicGroups(category?: string): Promise<{ count: number; groups: EconomicGroupInfo[] }> {
  const response = await api.get("/api/economic-groups/", { params: { category } });
  return response.data;
}

export async function fetchEconomicGroup(code: string): Promise<EconomicGroupDetail> {
  const response = await api.get(`/api/economic-groups/${code}`);
  return response.data;
}

export async function fetchCountryGroups(countryIso: string): Promise<{ country_iso: string; groups: EconomicGroupInfo[] }> {
  const response = await api.get(`/api/economic-groups/by-country/${countryIso}`);
  return response.data;
}

// ─── Vessel Tracking API ───

export type VesselType = "cargo" | "tanker" | "container" | "bulk" | "lng" | "passenger" | "fishing" | "military" | "other";

export interface VesselPosition {
  mmsi: string;
  name: string;
  vessel_type: VesselType;
  lat: number;
  lon: number;
  speed_knots: number;
  heading: number;
  destination: string;
  flag_iso: string;
  length_m: number;
  draught_m: number;
  last_update: number;
}

export interface VesselSnapshot {
  mode: "live" | "simulation";
  count: number;
  vessels: VesselPosition[];
}

export interface VesselStats {
  mode: "live" | "simulation";
  total_vessels: number;
  by_type: Record<string, number>;
  routes_active: number;
}

export async function fetchVessels(): Promise<VesselSnapshot> {
  const response = await api.get("/api/vessels/");
  return response.data;
}

export async function fetchVesselStats(): Promise<VesselStats> {
  const response = await api.get("/api/vessels/stats");
  return response.data;
}

export default api;

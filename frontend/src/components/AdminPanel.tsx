"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchPlatformStats,
  fetchAdminUsers,
  updateAdminUser,
  deleteAdminUser,
  fetchUsageAnalytics,
  fetchSystemHealth,
  fetchRecentActivity,
  bootstrapAdmin,
  type PlatformStats,
  type AdminUserSummary,
  type UsageAnalytics,
  type SystemHealth,
  type ActivityEntry,
} from "@/lib/api";

interface AdminPanelProps {
  onClose: () => void;
}

type Tab = "overview" | "users" | "analytics" | "health" | "activity";

// ─── Helpers ───

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-800/60 rounded-lg border border-gray-700 p-3">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{label}</div>
      <div className="text-lg font-bold text-white">{value}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    free: "bg-gray-500/20 text-gray-400 border-gray-500/40",
    pro: "bg-cyan-500/20 text-cyan-400 border-cyan-500/40",
    institutional: "bg-purple-500/20 text-purple-400 border-purple-500/40",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border uppercase font-bold ${colors[tier] || colors.free}`}>
      {tier}
    </span>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${ok ? "bg-green-400" : "bg-red-400"}`} />
  );
}

// ─── Main Component ───

export default function AdminPanel({ onClose }: AdminPanelProps) {
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [analytics, setAnalytics] = useState<UsageAnalytics | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [analyticsDays, setAnalyticsDays] = useState(7);

  // ── Loaders ──

  const loadStats = useCallback(async () => {
    try {
      const s = await fetchPlatformStats();
      setStats(s);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed to load stats"); }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const u = await fetchAdminUsers(userFilter, userSearch);
      setUsers(u);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed to load users"); }
  }, [userFilter, userSearch]);

  const loadAnalytics = useCallback(async () => {
    try {
      const a = await fetchUsageAnalytics(analyticsDays);
      setAnalytics(a);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed to load analytics"); }
  }, [analyticsDays]);

  const loadHealth = useCallback(async () => {
    try {
      const h = await fetchSystemHealth();
      setHealth(h);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed to load health"); }
  }, []);

  const loadActivity = useCallback(async () => {
    try {
      const a = await fetchRecentActivity();
      setActivity(a);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed to load activity"); }
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    const jobs: Promise<void>[] = [];
    if (tab === "overview") { jobs.push(loadStats()); }
    if (tab === "users") { jobs.push(loadUsers()); }
    if (tab === "analytics") { jobs.push(loadAnalytics()); }
    if (tab === "health") { jobs.push(loadHealth()); }
    if (tab === "activity") { jobs.push(loadActivity()); }
    Promise.all(jobs).finally(() => setLoading(false));
  }, [tab, loadStats, loadUsers, loadAnalytics, loadHealth, loadActivity]);

  // ── User actions ──

  const handleToggleActive = async (u: AdminUserSummary) => {
    try {
      await updateAdminUser(u.id, { is_active: !u.is_active });
      await loadUsers();
    } catch { setError("Failed to update user"); }
  };

  const handleChangeTier = async (u: AdminUserSummary, newTier: string) => {
    try {
      await updateAdminUser(u.id, { tier: newTier });
      await loadUsers();
    } catch { setError("Failed to update tier"); }
  };

  const handleToggleAdmin = async (u: AdminUserSummary) => {
    if (!confirm(`${u.is_admin ? "Remove" : "Grant"} admin access for ${u.email}?`)) return;
    try {
      await updateAdminUser(u.id, { is_admin: !u.is_admin });
      await loadUsers();
    } catch { setError("Failed to update admin status"); }
  };

  const handleDeleteUser = async (u: AdminUserSummary) => {
    if (!confirm(`Delete user ${u.email}? This cannot be undone.`)) return;
    try {
      await deleteAdminUser(u.id);
      await loadUsers();
    } catch { setError("Failed to delete user"); }
  };

  // ─── Tab Content ───

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: "overview", label: "Overview", icon: "📊" },
    { key: "users", label: "Users", icon: "👥" },
    { key: "analytics", label: "Analytics", icon: "📈" },
    { key: "health", label: "Health", icon: "💚" },
    { key: "activity", label: "Activity", icon: "📋" },
  ];

  return (
    <div className="absolute inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <span className="text-lg">🛡️</span>
            <h2 className="text-white font-semibold text-sm">Admin Dashboard</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 pt-3 border-b border-gray-800">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`text-xs px-3 py-2 rounded-t-lg transition-colors ${
                tab === t.key
                  ? "bg-gray-800 text-cyan-400 border-b-2 border-cyan-400"
                  : "text-gray-500 hover:text-white"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 min-h-0">
          {error && (
            <div className="mb-3 p-2 bg-red-500/20 border border-red-500/40 rounded text-red-400 text-xs">
              {error}
              <button onClick={() => setError("")} className="float-right text-red-300 hover:text-white">✕</button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* ─── OVERVIEW ─── */}
              {tab === "overview" && stats && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatCard label="Total Users" value={stats.total_users} />
                    <StatCard label="Active Users" value={stats.active_users} />
                    <StatCard label="API Keys" value={stats.total_api_keys} />
                    <StatCard label="Alert Rules" value={stats.total_alert_rules} />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <StatCard label="Alerts Triggered" value={stats.total_alerts_triggered} />
                    <StatCard label="Channels" value={stats.total_notification_channels} />
                    <StatCard
                      label="Scheduler"
                      value={stats.scheduler_status?.running ? "Running" : "Stopped"}
                      sub={Array.isArray(stats.scheduler_status?.jobs) ? `${(stats.scheduler_status.jobs as unknown[]).length} jobs` : undefined}
                    />
                  </div>

                  {/* Users by tier */}
                  <div className="bg-gray-800/60 rounded-lg border border-gray-700 p-4">
                    <h4 className="text-xs font-semibold text-gray-400 uppercase mb-3">Users by Tier</h4>
                    <div className="flex gap-6">
                      {Object.entries(stats.users_by_tier).map(([tier, count]) => (
                        <div key={tier} className="flex items-center gap-2">
                          <TierBadge tier={tier} />
                          <span className="text-white font-semibold text-sm">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* DB counts */}
                  <div className="bg-gray-800/60 rounded-lg border border-gray-700 p-4">
                    <h4 className="text-xs font-semibold text-gray-400 uppercase mb-3">Database Records</h4>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                      {Object.entries(stats.db_counts).map(([table, rows]) => (
                        <div key={table}>
                          <div className="text-gray-500 capitalize">{table.replace(/_/g, " ")}</div>
                          <div className="text-white font-mono text-sm">{(rows as number).toLocaleString()}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ─── USERS ─── */}
              {tab === "users" && (
                <div className="space-y-3">
                  {/* Filters */}
                  <div className="flex gap-2 flex-wrap">
                    <input
                      type="text"
                      placeholder="Search email / name / org…"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && loadUsers()}
                      className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-white w-56 placeholder-gray-500 focus:border-cyan-500 outline-none"
                    />
                    <select
                      value={userFilter}
                      onChange={(e) => setUserFilter(e.target.value)}
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:border-cyan-500 outline-none"
                    >
                      <option value="">All tiers</option>
                      <option value="free">Free</option>
                      <option value="pro">Pro</option>
                      <option value="institutional">Institutional</option>
                    </select>
                    <button
                      onClick={loadUsers}
                      className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs px-3 py-1.5 rounded transition"
                    >
                      Search
                    </button>
                  </div>

                  {/* Users table */}
                  <div className="overflow-x-auto rounded-lg border border-gray-700">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-gray-800 text-gray-400 uppercase">
                        <tr>
                          <th className="px-3 py-2">User</th>
                          <th className="px-3 py-2">Tier</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Admin</th>
                          <th className="px-3 py-2">Keys</th>
                          <th className="px-3 py-2">Rules</th>
                          <th className="px-3 py-2">Joined</th>
                          <th className="px-3 py-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {users.map((u) => (
                          <tr key={u.id} className="hover:bg-gray-800/50">
                            <td className="px-3 py-2">
                              <div className="text-white font-medium">{u.full_name || "—"}</div>
                              <div className="text-gray-500">{u.email}</div>
                              {u.organisation && <div className="text-gray-600 text-[10px]">{u.organisation}</div>}
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={u.tier}
                                onChange={(e) => handleChangeTier(u, e.target.value)}
                                className="bg-transparent border border-gray-700 rounded px-1 py-0.5 text-[10px] text-white focus:border-cyan-500 outline-none"
                              >
                                <option value="free">free</option>
                                <option value="pro">pro</option>
                                <option value="institutional">institutional</option>
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <StatusDot ok={u.is_active} />
                              <span className={`ml-1 ${u.is_active ? "text-green-400" : "text-red-400"}`}>
                                {u.is_active ? "active" : "disabled"}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              {u.is_admin ? (
                                <span className="text-yellow-400 text-[10px] font-bold">ADMIN</span>
                              ) : (
                                <span className="text-gray-600">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-gray-400 text-center">{u.api_key_count}</td>
                            <td className="px-3 py-2 text-gray-400 text-center">{u.alert_rule_count}</td>
                            <td className="px-3 py-2 text-gray-500">
                              {new Date(u.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex gap-1">
                                <button
                                  onClick={() => handleToggleActive(u)}
                                  className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                    u.is_active
                                      ? "border-red-500/40 text-red-400 hover:bg-red-500/20"
                                      : "border-green-500/40 text-green-400 hover:bg-green-500/20"
                                  }`}
                                >
                                  {u.is_active ? "Disable" : "Enable"}
                                </button>
                                <button
                                  onClick={() => handleToggleAdmin(u)}
                                  className="text-[10px] px-1.5 py-0.5 rounded border border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/20"
                                >
                                  {u.is_admin ? "Revoke" : "Grant"} Admin
                                </button>
                                <button
                                  onClick={() => handleDeleteUser(u)}
                                  className="text-[10px] px-1.5 py-0.5 rounded border border-red-500/40 text-red-400 hover:bg-red-500/20"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {users.length === 0 && (
                          <tr>
                            <td colSpan={8} className="px-3 py-8 text-center text-gray-500">No users found</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ─── ANALYTICS ─── */}
              {tab === "analytics" && analytics && (
                <div className="space-y-4">
                  {/* Period selector */}
                  <div className="flex gap-2 items-center">
                    <span className="text-xs text-gray-400">Period:</span>
                    {[7, 14, 30, 60].map((d) => (
                      <button
                        key={d}
                        onClick={() => { setAnalyticsDays(d); }}
                        className={`text-xs px-2 py-1 rounded border ${
                          analyticsDays === d
                            ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/40"
                            : "text-gray-500 border-gray-700 hover:text-white"
                        }`}
                      >
                        {d}d
                      </button>
                    ))}
                  </div>

                  {/* Summary cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatCard label="Total Requests" value={analytics.total_requests.toLocaleString()} />
                    <StatCard label="Today" value={analytics.requests_today.toLocaleString()} />
                    <StatCard label="This Week" value={analytics.requests_this_week.toLocaleString()} />
                    <StatCard label="Error Rate" value={`${analytics.error_rate}%`} />
                  </div>

                  {/* Daily trend - text bar chart */}
                  {analytics.daily_trend.length > 0 && (
                    <div className="bg-gray-800/60 rounded-lg border border-gray-700 p-4">
                      <h4 className="text-xs font-semibold text-gray-400 uppercase mb-3">Daily Trend</h4>
                      <div className="space-y-1">
                        {analytics.daily_trend.map((d) => {
                          const max = Math.max(...analytics.daily_trend.map((x) => x.request_count), 1);
                          const pct = (d.request_count / max) * 100;
                          return (
                            <div key={d.date} className="flex items-center gap-2 text-xs">
                              <span className="text-gray-500 w-20 shrink-0">{d.date.slice(5)}</span>
                              <div className="flex-1 bg-gray-700 rounded-full h-3 overflow-hidden">
                                <div className="bg-cyan-500 h-full rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-gray-400 w-12 text-right">{d.request_count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Top endpoints */}
                  {analytics.top_endpoints.length > 0 && (
                    <div className="bg-gray-800/60 rounded-lg border border-gray-700 p-4">
                      <h4 className="text-xs font-semibold text-gray-400 uppercase mb-3">Top Endpoints</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="text-gray-500 uppercase">
                            <tr>
                              <th className="pb-2">Method</th>
                              <th className="pb-2">Endpoint</th>
                              <th className="pb-2 text-right">Requests</th>
                              <th className="pb-2 text-right">Avg ms</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-700">
                            {analytics.top_endpoints.map((ep, i) => (
                              <tr key={i} className="text-gray-300">
                                <td className="py-1">
                                  <span className={`font-mono text-[10px] px-1 py-0.5 rounded ${
                                    ep.method === "GET" ? "bg-green-500/20 text-green-400" :
                                    ep.method === "POST" ? "bg-blue-500/20 text-blue-400" :
                                    ep.method === "PATCH" ? "bg-yellow-500/20 text-yellow-400" :
                                    "bg-red-500/20 text-red-400"
                                  }`}>{ep.method}</span>
                                </td>
                                <td className="py-1 font-mono text-gray-300">{ep.endpoint}</td>
                                <td className="py-1 text-right text-white font-medium">{ep.count.toLocaleString()}</td>
                                <td className="py-1 text-right text-gray-400">{ep.avg_response_ms?.toFixed(0) ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Top users */}
                  {analytics.top_users.length > 0 && (
                    <div className="bg-gray-800/60 rounded-lg border border-gray-700 p-4">
                      <h4 className="text-xs font-semibold text-gray-400 uppercase mb-3">Top Users</h4>
                      <div className="space-y-2">
                        {analytics.top_users.map((u) => (
                          <div key={u.user_id} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="text-white">{u.email}</span>
                              <TierBadge tier={u.tier} />
                            </div>
                            <span className="text-cyan-400 font-mono">{u.request_count.toLocaleString()} req</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ─── HEALTH ─── */}
              {tab === "health" && health && (
                <div className="space-y-4">
                  {/* Overall status */}
                  <div className={`p-4 rounded-lg border ${
                    health.status === "healthy" ? "bg-green-500/10 border-green-500/30" :
                    health.status === "degraded" ? "bg-yellow-500/10 border-yellow-500/30" :
                    "bg-red-500/10 border-red-500/30"
                  }`}>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">
                        {health.status === "healthy" ? "✅" : health.status === "degraded" ? "⚠️" : "❌"}
                      </span>
                      <div>
                        <div className="text-white font-semibold text-sm capitalize">{health.status}</div>
                        <div className="text-xs text-gray-400">
                          Uptime: {Math.floor(health.uptime_seconds / 3600)}h {Math.floor((health.uptime_seconds % 3600) / 60)}m
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* API info */}
                    <div className="bg-gray-800/60 rounded-lg border border-gray-700 p-4">
                      <h4 className="text-xs font-semibold text-gray-400 uppercase mb-3">API</h4>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Version</span>
                          <span className="text-white font-mono">{health.api_version}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Python</span>
                          <span className="text-white font-mono">{health.python_version}</span>
                        </div>
                      </div>
                    </div>

                    {/* Database */}
                    <div className="bg-gray-800/60 rounded-lg border border-gray-700 p-4">
                      <h4 className="text-xs font-semibold text-gray-400 uppercase mb-3">Database</h4>
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center gap-2">
                          <StatusDot ok={health.database?.status === "healthy"} />
                          <span className="text-white">{String(health.database?.status || "unknown")}</span>
                        </div>
                        {health.database?.version ? (
                          <div className="text-gray-500 text-[10px] font-mono truncate">{String(health.database.version)}</div>
                        ) : null}
                        {health.database?.table_rows ? (
                          <div className="mt-2 space-y-1">
                            {Object.entries(health.database.table_rows as Record<string, number>)
                              .sort(([, a], [, b]) => b - a)
                              .map(([table, rows]) => (
                                <div key={table} className="flex justify-between">
                                  <span className="text-gray-500">{table}</span>
                                  <span className="text-gray-300 font-mono">{rows.toLocaleString()}</span>
                                </div>
                              ))}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {/* Scheduler */}
                    <div className="bg-gray-800/60 rounded-lg border border-gray-700 p-4 md:col-span-2">
                      <h4 className="text-xs font-semibold text-gray-400 uppercase mb-3">Scheduler</h4>
                      <div className="flex items-center gap-2 text-xs mb-2">
                        <StatusDot ok={Boolean(health.scheduler?.running)} />
                        <span className="text-white">{health.scheduler?.running ? "Running" : "Stopped"}</span>
                      </div>
                      {health.scheduler?.jobs ? (
                        <div className="space-y-1 text-xs">
                          {(health.scheduler.jobs as Array<Record<string, string>>).map((job, idx) => (
                            <div key={idx} className="flex justify-between items-center bg-gray-900/50 rounded px-2 py-1">
                              <span className="text-gray-300 font-mono">{job.name || job.id}</span>
                              <span className="text-gray-500 text-[10px]">
                                next: {job.next_run || "—"}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}

              {/* ─── ACTIVITY ─── */}
              {tab === "activity" && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs text-gray-400">Recent API Requests</h4>
                    <button
                      onClick={loadActivity}
                      className="text-xs text-cyan-400 hover:text-cyan-300"
                    >
                      ↻ Refresh
                    </button>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-gray-700">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-gray-800 text-gray-400 uppercase">
                        <tr>
                          <th className="px-2 py-2">Time</th>
                          <th className="px-2 py-2">User</th>
                          <th className="px-2 py-2">Method</th>
                          <th className="px-2 py-2">Endpoint</th>
                          <th className="px-2 py-2">Status</th>
                          <th className="px-2 py-2">Time (ms)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {activity.map((a) => (
                          <tr key={a.id} className="hover:bg-gray-800/50">
                            <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap">
                              {a.timestamp ? new Date(a.timestamp).toLocaleTimeString() : "—"}
                            </td>
                            <td className="px-2 py-1.5 text-gray-300">{a.user_email || "anon"}</td>
                            <td className="px-2 py-1.5">
                              <span className={`font-mono text-[10px] px-1 py-0.5 rounded ${
                                a.method === "GET" ? "bg-green-500/20 text-green-400" :
                                a.method === "POST" ? "bg-blue-500/20 text-blue-400" :
                                "bg-yellow-500/20 text-yellow-400"
                              }`}>{a.method}</span>
                            </td>
                            <td className="px-2 py-1.5 text-gray-300 font-mono">{a.endpoint}</td>
                            <td className="px-2 py-1.5">
                              <span className={`font-mono ${
                                a.status_code < 300 ? "text-green-400" :
                                a.status_code < 400 ? "text-yellow-400" : "text-red-400"
                              }`}>{a.status_code}</span>
                            </td>
                            <td className="px-2 py-1.5 text-gray-400 text-right">{a.response_time_ms?.toFixed(0) ?? "—"}</td>
                          </tr>
                        ))}
                        {activity.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-3 py-8 text-center text-gray-500">No activity recorded yet</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  fetchAPIKeys,
  createAPIKey,
  revokeAPIKey,
  fetchSubscription,
  createCheckoutSession,
  type APIKeyInfo,
  type APIKeyCreated,
  type SubscriptionInfo,
} from "@/lib/api";

interface AccountPanelProps {
  onClose: () => void;
}

// ─── Tier badge ───

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    free: "bg-gray-500/20 text-gray-400 border-gray-500/40",
    pro: "bg-cyan-500/20 text-cyan-400 border-cyan-500/40",
    institutional: "bg-purple-500/20 text-purple-400 border-purple-500/40",
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full border uppercase font-bold ${
        colors[tier] || colors.free
      }`}
    >
      {tier}
    </span>
  );
}

export default function AccountPanel({ onClose }: AccountPanelProps) {
  const { user, logout, refreshProfile } = useAuth();
  const [tab, setTab] = useState<"profile" | "keys" | "subscription">("profile");
  const [keys, setKeys] = useState<APIKeyInfo[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [createdKey, setCreatedKey] = useState<APIKeyCreated | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tab === "keys") {
      fetchAPIKeys().then(setKeys).catch(() => {});
    } else if (tab === "subscription") {
      fetchSubscription().then(setSubscription).catch(() => {});
    }
  }, [tab]);

  const handleCreateKey = async () => {
    setError(null);
    setLoading(true);
    try {
      const created = await createAPIKey(newKeyLabel || undefined);
      setCreatedKey(created);
      setNewKeyLabel("");
      const updated = await fetchAPIKeys();
      setKeys(updated);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      setError(axiosErr?.response?.data?.detail || "Failed to create key");
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeKey = async (keyId: number) => {
    try {
      await revokeAPIKey(keyId);
      const updated = await fetchAPIKeys();
      setKeys(updated);
    } catch {
      setError("Failed to revoke key");
    }
  };

  const handleUpgrade = async (tier: "pro" | "institutional") => {
    setLoading(true);
    try {
      const { checkout_url } = await createCheckoutSession(tier);
      window.location.href = checkout_url;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      setError(
        axiosErr?.response?.data?.detail ||
          "Stripe not configured yet. Contact support."
      );
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  const tabs = [
    { id: "profile" as const, label: "Profile", icon: "👤" },
    { id: "keys" as const, label: "API Keys", icon: "🔑" },
    { id: "subscription" as const, label: "Plan", icon: "💎" },
  ];

  return (
    <div className="absolute top-4 right-4 z-50 w-[420px] max-h-[calc(100vh-6rem)] bg-gray-900/95 backdrop-blur-sm text-white rounded-xl border border-gray-700 shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-400">
            Account
          </h2>
          <TierBadge tier={user.tier} />
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors text-lg"
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setError(null); }}
            className={`flex-1 py-2 text-xs text-center transition-colors ${
              tab === t.id
                ? "text-cyan-400 border-b-2 border-cyan-400 bg-cyan-500/5"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-3 mt-3 p-2 bg-red-500/20 border border-red-500/40 rounded text-red-400 text-xs">
          {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* ─── Profile Tab ─── */}
        {tab === "profile" && (
          <div className="space-y-4">
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">Email</label>
                <p className="text-sm text-white">{user.email}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500">Name</label>
                <p className="text-sm text-white">{user.full_name || "—"}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500">Organisation</label>
                <p className="text-sm text-white">{user.organisation || "—"}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500">Member Since</label>
                <p className="text-sm text-white">
                  {new Date(user.created_at).toLocaleDateString()}
                </p>
              </div>
              <div>
                <label className="text-xs text-gray-500">API Keys</label>
                <p className="text-sm text-white">{user.api_key_count}</p>
              </div>
            </div>

            <button
              onClick={() => {
                logout();
                onClose();
              }}
              className="w-full py-2 mt-4 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400 rounded-lg text-sm transition-colors"
            >
              Sign Out
            </button>
          </div>
        )}

        {/* ─── API Keys Tab ─── */}
        {tab === "keys" && (
          <div className="space-y-4">
            {/* Create New Key */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newKeyLabel}
                onChange={(e) => setNewKeyLabel(e.target.value)}
                placeholder="Key label (optional)"
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
              />
              <button
                onClick={handleCreateKey}
                disabled={loading}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                + New
              </button>
            </div>

            {/* Created Key Alert */}
            {createdKey && (
              <div className="p-3 bg-green-500/20 border border-green-500/40 rounded-lg">
                <p className="text-xs text-green-400 font-semibold mb-1">
                  Key created! Copy it now — it won't be shown again.
                </p>
                <code className="text-xs text-white bg-gray-800 px-2 py-1 rounded block break-all select-all">
                  {createdKey.key}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(createdKey.key);
                    setCreatedKey(null);
                  }}
                  className="mt-2 text-xs text-cyan-400 hover:text-cyan-300"
                >
                  📋 Copy & Dismiss
                </button>
              </div>
            )}

            {/* Key List */}
            <div className="space-y-2">
              {keys.map((k) => (
                <div
                  key={k.id}
                  className={`p-3 rounded-lg border ${
                    k.is_active
                      ? "border-gray-700 bg-gray-800/30"
                      : "border-gray-800 bg-gray-900/50 opacity-50"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <code className="text-sm text-white">
                          {k.key_prefix}...
                        </code>
                        {k.label && (
                          <span className="text-xs text-gray-400">
                            {k.label}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-3 mt-1 text-xs text-gray-500">
                        <span>
                          Created:{" "}
                          {new Date(k.created_at).toLocaleDateString()}
                        </span>
                        <span>Requests: {k.request_count}</span>
                        {k.last_used_at && (
                          <span>
                            Last:{" "}
                            {new Date(k.last_used_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    {k.is_active && (
                      <button
                        onClick={() => handleRevokeKey(k.id)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {keys.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-4">
                  No API keys yet. Create one above.
                </p>
              )}
            </div>

            <div className="text-xs text-gray-500 p-2 bg-gray-800/30 rounded">
              <p>
                Use API keys with the <code>X-API-Key</code> header for
                programmatic access.
              </p>
            </div>
          </div>
        )}

        {/* ─── Subscription Tab ─── */}
        {tab === "subscription" && (
          <div className="space-y-4">
            {/* Current Plan */}
            <div className="p-4 rounded-lg border border-gray-700 bg-gray-800/30">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">
                  Current Plan
                </h3>
                <TierBadge tier={user.tier} />
              </div>
              {subscription && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <span className="text-gray-500">Status</span>
                  <span className="text-green-400">
                    {subscription.status}
                  </span>
                  <span className="text-gray-500">API Requests/min</span>
                  <span className="text-white">
                    {subscription.limits.requests_per_minute}
                  </span>
                  <span className="text-gray-500">API Requests/day</span>
                  <span className="text-white">
                    {subscription.limits.requests_per_day}
                  </span>
                  <span className="text-gray-500">Max API Keys</span>
                  <span className="text-white">
                    {subscription.limits.max_api_keys}
                  </span>
                  <span className="text-gray-500">CSV Export</span>
                  <span
                    className={
                      subscription.limits.csv_export
                        ? "text-green-400"
                        : "text-gray-500"
                    }
                  >
                    {subscription.limits.csv_export ? "✓" : "✗"}
                  </span>
                  <span className="text-gray-500">Intelligence</span>
                  <span
                    className={
                      subscription.limits.intelligence_access
                        ? "text-green-400"
                        : "text-gray-500"
                    }
                  >
                    {subscription.limits.intelligence_access ? "✓" : "✗"}
                  </span>
                </div>
              )}
            </div>

            {/* Upgrade Options */}
            {user.tier === "free" && (
              <div className="space-y-3">
                <h4 className="text-xs text-gray-400 uppercase tracking-wider">
                  Upgrade
                </h4>

                {/* Pro */}
                <div className="p-4 rounded-lg border border-cyan-500/30 bg-cyan-500/5">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h5 className="text-sm font-bold text-cyan-400">Pro</h5>
                      <p className="text-xs text-gray-400">
                        For analysts & researchers
                      </p>
                    </div>
                    <span className="text-lg font-bold text-white">
                      €29<span className="text-xs text-gray-400">/mo</span>
                    </span>
                  </div>
                  <ul className="text-xs text-gray-300 space-y-1 mb-3">
                    <li>• 60 req/min, 5000/day</li>
                    <li>• 5 API keys</li>
                    <li>• CSV data export</li>
                    <li>• Intelligence dashboard</li>
                  </ul>
                  <button
                    onClick={() => handleUpgrade("pro")}
                    disabled={loading}
                    className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Upgrade to Pro
                  </button>
                </div>

                {/* Institutional */}
                <div className="p-4 rounded-lg border border-purple-500/30 bg-purple-500/5">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h5 className="text-sm font-bold text-purple-400">
                        Institutional
                      </h5>
                      <p className="text-xs text-gray-400">
                        For enterprises & government
                      </p>
                    </div>
                    <span className="text-lg font-bold text-white">
                      €199<span className="text-xs text-gray-400">/mo</span>
                    </span>
                  </div>
                  <ul className="text-xs text-gray-300 space-y-1 mb-3">
                    <li>• 300 req/min, 50000/day</li>
                    <li>• 20 API keys</li>
                    <li>• Full data export</li>
                    <li>• Priority support</li>
                  </ul>
                  <button
                    onClick={() => handleUpgrade("institutional")}
                    disabled={loading}
                    className="w-full py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Upgrade to Institutional
                  </button>
                </div>
              </div>
            )}

            {user.tier !== "free" && (
              <p className="text-xs text-gray-400 text-center">
                Manage your subscription through the Stripe customer portal.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

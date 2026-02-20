"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchAlertSummary,
  fetchAlerts,
  acknowledgeAlerts,
  acknowledgeAllAlerts,
  triggerAlertCheck,
  fetchAlertRules,
  createAlertRule,
  deleteAlertRule,
  updateAlertRule,
  fetchChannels,
  createChannel,
  deleteChannel,
  type AlertSummary,
  type AlertInfo,
  type AlertRuleInfo,
  type ChannelInfo,
} from "@/lib/api";

interface NotificationPanelProps {
  onClose: () => void;
}

const SEVERITY_STYLES = {
  critical: { bg: "bg-red-500/20", border: "border-red-500/40", text: "text-red-400", icon: "🔴" },
  warning: { bg: "bg-orange-500/20", border: "border-orange-500/40", text: "text-orange-400", icon: "🟠" },
  info: { bg: "bg-blue-500/20", border: "border-blue-500/40", text: "text-blue-400", icon: "🔵" },
};

const RULE_TYPE_LABELS: Record<string, string> = {
  chokepoint_stress: "Chokepoint Stress",
  port_stress: "Port Stress",
  trade_anomaly: "Trade Anomaly",
  tfii_threshold: "TFII Threshold",
  energy_exposure: "Energy Exposure",
};

type Tab = "alerts" | "rules" | "channels";

export default function NotificationPanel({ onClose }: NotificationPanelProps) {
  const [tab, setTab] = useState<Tab>("alerts");
  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const [alerts, setAlerts] = useState<AlertInfo[]>([]);
  const [rules, setRules] = useState<AlertRuleInfo[]>([]);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // ── New rule form state ──
  const [showNewRule, setShowNewRule] = useState(false);
  const [newRuleName, setNewRuleName] = useState("");
  const [newRuleType, setNewRuleType] = useState("chokepoint_stress");
  const [newRuleConfig, setNewRuleConfig] = useState("{}");

  // ── New channel form state ──
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannelType, setNewChannelType] = useState<"email" | "webhook">("email");
  const [newChannelTarget, setNewChannelTarget] = useState("");
  const [newChannelLabel, setNewChannelLabel] = useState("");

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const [s, a, r, c] = await Promise.all([
        fetchAlertSummary(),
        fetchAlerts(undefined, undefined, 50),
        fetchAlertRules(),
        fetchChannels(),
      ]);
      setSummary(s);
      setAlerts(a.alerts);
      setRules(r);
      setChannels(c);
    } catch {
      setError("Failed to load alert data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAcknowledge = async (id: number) => {
    await acknowledgeAlerts([id]);
    loadData();
  };

  const handleAcknowledgeAll = async () => {
    await acknowledgeAllAlerts();
    loadData();
  };

  const handleCheck = async () => {
    setIsLoading(true);
    try {
      const result = await triggerAlertCheck();
      if (result.new_alerts > 0) {
        setError("");
      }
      loadData();
    } catch {
      setError("Alert check failed");
      setIsLoading(false);
    }
  };

  const handleCreateRule = async () => {
    if (!newRuleName.trim()) return;
    try {
      let config = {};
      try { config = JSON.parse(newRuleConfig); } catch { setError("Invalid JSON config"); return; }
      await createAlertRule({ name: newRuleName, rule_type: newRuleType, config });
      setShowNewRule(false);
      setNewRuleName("");
      setNewRuleConfig("{}");
      loadData();
    } catch {
      setError("Failed to create rule (tier limit?)");
    }
  };

  const handleToggleRule = async (rule: AlertRuleInfo) => {
    await updateAlertRule(rule.id, { is_enabled: !rule.is_enabled });
    loadData();
  };

  const handleDeleteRule = async (id: number) => {
    await deleteAlertRule(id);
    loadData();
  };

  const handleCreateChannel = async () => {
    if (!newChannelTarget.trim()) return;
    try {
      await createChannel({
        channel_type: newChannelType,
        target: newChannelTarget,
        label: newChannelLabel || undefined,
      });
      setShowNewChannel(false);
      setNewChannelTarget("");
      setNewChannelLabel("");
      loadData();
    } catch {
      setError("Failed to create channel (tier limit?)");
    }
  };

  const handleDeleteChannel = async (id: number) => {
    await deleteChannel(id);
    loadData();
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="absolute top-0 right-0 z-[60] w-[420px] h-screen bg-gray-950/95 backdrop-blur-md
                    border-l border-gray-700 flex flex-col shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔔</span>
          <h2 className="text-white font-semibold text-sm">Notifications</h2>
          {summary && summary.total_active > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {summary.total_active}
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">✕</button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800">
        {(["alerts", "rules", "channels"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-medium uppercase tracking-wider transition-colors
              ${tab === t ? "text-cyan-400 border-b-2 border-cyan-400" : "text-gray-500 hover:text-gray-300"}`}
          >
            {t === "alerts" ? `Alerts${summary ? ` (${summary.total_active})` : ""}` :
             t === "rules" ? `Rules (${rules.length})` : `Channels (${channels.length})`}
          </button>
        ))}
      </div>

      {error && (
        <div className="mx-4 mt-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
          {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="text-gray-500 text-sm text-center py-8">Loading…</div>
        ) : tab === "alerts" ? (
          <>
            {/* Action bar */}
            <div className="flex gap-2 mb-2">
              <button
                onClick={handleCheck}
                className="text-[11px] px-2 py-1 bg-cyan-600/20 text-cyan-400 rounded border border-cyan-600/30 hover:bg-cyan-600/30"
              >
                🔄 Check Now
              </button>
              {summary && summary.total_active > 0 && (
                <button
                  onClick={handleAcknowledgeAll}
                  className="text-[11px] px-2 py-1 bg-gray-700/50 text-gray-300 rounded border border-gray-600 hover:bg-gray-700"
                >
                  ✓ Acknowledge All
                </button>
              )}
            </div>

            {alerts.length === 0 ? (
              <div className="text-gray-500 text-sm text-center py-8">
                No alerts yet. Create rules to start monitoring.
              </div>
            ) : (
              alerts.map((alert) => {
                const style = SEVERITY_STYLES[alert.severity];
                return (
                  <div
                    key={alert.id}
                    className={`${style.bg} ${style.border} border rounded-lg p-3 ${
                      alert.status === "acknowledged" ? "opacity-60" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{style.icon}</span>
                        <span className={`text-xs font-semibold ${style.text}`}>
                          {alert.severity.toUpperCase()}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-500">
                        {timeAgo(alert.triggered_at)}
                      </span>
                    </div>
                    <h4 className="text-white text-sm font-medium mt-1">{alert.title}</h4>
                    <p className="text-gray-400 text-xs mt-1">{alert.message}</p>
                    {alert.details && (
                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                        {Object.entries(alert.details).slice(0, 4).map(([k, v]) => (
                          <div key={k}>
                            <span className="text-gray-500">{k}: </span>
                            <span className="text-gray-300">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      {alert.status === "active" && (
                        <button
                          onClick={() => handleAcknowledge(alert.id)}
                          className="text-[10px] px-2 py-0.5 rounded bg-gray-700/50 text-gray-300 hover:bg-gray-700 border border-gray-600"
                        >
                          Acknowledge
                        </button>
                      )}
                      <span className="text-[10px] text-gray-600">
                        {alert.rule_name && `Rule: ${alert.rule_name}`}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </>
        ) : tab === "rules" ? (
          <>
            <button
              onClick={() => setShowNewRule(!showNewRule)}
              className="w-full text-xs py-2 rounded-lg border border-dashed border-cyan-600/40
                         text-cyan-400 hover:bg-cyan-600/10 transition-colors"
            >
              + New Alert Rule
            </button>

            {showNewRule && (
              <div className="bg-gray-900/80 border border-gray-700 rounded-lg p-3 space-y-2">
                <input
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  placeholder="Rule name"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-white text-xs"
                />
                <select
                  value={newRuleType}
                  onChange={(e) => setNewRuleType(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-white text-xs"
                >
                  {Object.entries(RULE_TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <textarea
                  value={newRuleConfig}
                  onChange={(e) => setNewRuleConfig(e.target.value)}
                  placeholder='{"chokepoint": "Suez Canal", "z_score_threshold": 1.5}'
                  rows={3}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-white text-xs font-mono"
                />
                <div className="text-[10px] text-gray-500 space-y-0.5">
                  <div>Chokepoint: {`{"chokepoint": "Suez Canal", "z_score_threshold": 1.5}`}</div>
                  <div>Port: {`{"port_name": "Shanghai", "psi_threshold": 0.7}`}</div>
                  <div>Trade: {`{"iso_code": "DEU", "z_score_threshold": 2.0}`}</div>
                  <div>TFII: {`{"exporter": "CHN", "importer": "USA", "tfii_min": 50}`}</div>
                  <div>Energy: {`{"iso_code": "JPN", "ecei_threshold": 0.6}`}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleCreateRule}
                    className="text-xs px-3 py-1.5 bg-cyan-600 text-white rounded hover:bg-cyan-500"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => setShowNewRule(false)}
                    className="text-xs px-3 py-1.5 bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {rules.length === 0 ? (
              <div className="text-gray-500 text-sm text-center py-6">
                No alert rules configured.
              </div>
            ) : (
              rules.map((rule) => (
                <div
                  key={rule.id}
                  className={`bg-gray-900/60 border rounded-lg p-3 ${
                    rule.is_enabled ? "border-gray-700" : "border-gray-800 opacity-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-white text-sm font-medium">{rule.name}</h4>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleToggleRule(rule)}
                        className={`text-[10px] px-2 py-0.5 rounded ${
                          rule.is_enabled
                            ? "bg-green-500/20 text-green-400 border border-green-500/30"
                            : "bg-gray-700/50 text-gray-500 border border-gray-600"
                        }`}
                      >
                        {rule.is_enabled ? "ON" : "OFF"}
                      </button>
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="text-[10px] px-2 py-0.5 text-red-400 hover:text-red-300"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px]">
                    <span className="text-cyan-400/70">{RULE_TYPE_LABELS[rule.rule_type] || rule.rule_type}</span>
                    <span className="text-gray-600">•</span>
                    <span className="text-gray-500">Cooldown: {rule.cooldown_minutes}m</span>
                    {rule.alert_count > 0 && (
                      <>
                        <span className="text-gray-600">•</span>
                        <span className="text-orange-400">{rule.alert_count} active</span>
                      </>
                    )}
                  </div>
                  <div className="mt-1 text-[10px] text-gray-600 font-mono truncate">
                    {JSON.stringify(rule.config)}
                  </div>
                </div>
              ))
            )}
          </>
        ) : (
          /* Channels tab */
          <>
            <button
              onClick={() => setShowNewChannel(!showNewChannel)}
              className="w-full text-xs py-2 rounded-lg border border-dashed border-cyan-600/40
                         text-cyan-400 hover:bg-cyan-600/10 transition-colors"
            >
              + New Notification Channel
            </button>

            {showNewChannel && (
              <div className="bg-gray-900/80 border border-gray-700 rounded-lg p-3 space-y-2">
                <select
                  value={newChannelType}
                  onChange={(e) => setNewChannelType(e.target.value as "email" | "webhook")}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-white text-xs"
                >
                  <option value="email">📧 Email</option>
                  <option value="webhook">🔗 Webhook</option>
                </select>
                <input
                  value={newChannelTarget}
                  onChange={(e) => setNewChannelTarget(e.target.value)}
                  placeholder={newChannelType === "email" ? "alerts@example.com" : "https://hooks.slack.com/..."}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-white text-xs"
                />
                <input
                  value={newChannelLabel}
                  onChange={(e) => setNewChannelLabel(e.target.value)}
                  placeholder="Label (optional)"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-white text-xs"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleCreateChannel}
                    className="text-xs px-3 py-1.5 bg-cyan-600 text-white rounded hover:bg-cyan-500"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => setShowNewChannel(false)}
                    className="text-xs px-3 py-1.5 bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {channels.length === 0 ? (
              <div className="text-gray-500 text-sm text-center py-6">
                No notification channels. Add email or webhook endpoints to receive alerts.
              </div>
            ) : (
              channels.map((ch) => (
                <div key={ch.id} className="bg-gray-900/60 border border-gray-700 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span>{ch.channel_type === "email" ? "📧" : "🔗"}</span>
                      <span className="text-white text-sm font-medium">
                        {ch.label || ch.channel_type.toUpperCase()}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteChannel(ch.id)}
                      className="text-[10px] px-2 py-0.5 text-red-400 hover:text-red-300"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="text-xs text-gray-400 mt-1 truncate">{ch.target}</div>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-600">
                    <span className={ch.is_enabled ? "text-green-400" : "text-gray-500"}>
                      {ch.is_enabled ? "● Enabled" : "○ Disabled"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}

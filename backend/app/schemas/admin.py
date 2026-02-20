"""Pydantic schemas for admin dashboard."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── User management ─────────────────────────────────────────────────────

class AdminUserSummary(BaseModel):
    id: int
    email: str
    full_name: Optional[str]
    organisation: Optional[str]
    tier: str
    subscription_status: str
    is_active: bool
    is_admin: bool
    api_key_count: int = 0
    alert_rule_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


class AdminUserUpdate(BaseModel):
    tier: Optional[str] = None
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None


# ── Platform stats ───────────────────────────────────────────────────────

class PlatformStats(BaseModel):
    total_users: int
    active_users: int
    users_by_tier: dict[str, int]
    total_api_keys: int
    total_alert_rules: int
    total_alerts_triggered: int
    total_notification_channels: int

    db_counts: dict[str, int]  # countries, trade_flows, ports, etc.
    scheduler_status: dict


# ── Usage analytics ──────────────────────────────────────────────────────

class EndpointUsage(BaseModel):
    endpoint: str
    method: str
    count: int
    avg_response_ms: Optional[float]


class DailyUsage(BaseModel):
    date: str
    request_count: int


class UserUsage(BaseModel):
    user_id: int
    email: str
    tier: str
    request_count: int
    last_request: Optional[datetime]


class UsageAnalytics(BaseModel):
    total_requests: int
    requests_today: int
    requests_this_week: int
    top_endpoints: list[EndpointUsage]
    daily_trend: list[DailyUsage]
    top_users: list[UserUsage]
    error_rate: float  # percentage of 4xx/5xx


# ── System health ────────────────────────────────────────────────────────

class SystemHealth(BaseModel):
    status: str  # healthy / degraded / unhealthy
    database: dict
    scheduler: dict
    uptime_seconds: float
    api_version: str
    python_version: str


# ── Audit log ────────────────────────────────────────────────────────────

class AuditEntry(BaseModel):
    id: int
    user_email: str
    action: str
    endpoint: str
    timestamp: datetime
    ip_address: Optional[str]

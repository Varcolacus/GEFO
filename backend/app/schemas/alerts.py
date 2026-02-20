"""Pydantic schemas for alerting & notifications."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

from app.models.alert import AlertRuleType, AlertSeverity, AlertStatus, ChannelType


# ── Alert Rules ──────────────────────────────────────────────────────────

class AlertRuleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    rule_type: AlertRuleType
    config: dict[str, Any] = Field(default_factory=dict)
    cooldown_minutes: int = Field(default=60, ge=5, le=1440)


class AlertRuleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    is_enabled: Optional[bool] = None
    config: Optional[dict[str, Any]] = None
    cooldown_minutes: Optional[int] = Field(None, ge=5, le=1440)


class AlertRuleResponse(BaseModel):
    id: int
    name: str
    rule_type: AlertRuleType
    is_enabled: bool
    config: dict[str, Any]
    cooldown_minutes: int
    created_at: datetime
    alert_count: int = 0

    class Config:
        from_attributes = True


# ── Alerts ───────────────────────────────────────────────────────────────

class AlertResponse(BaseModel):
    id: int
    rule_id: int
    rule_name: str = ""
    severity: AlertSeverity
    status: AlertStatus
    title: str
    message: str
    details: Optional[dict[str, Any]] = None
    triggered_at: datetime
    acknowledged_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    email_sent: bool
    webhook_sent: bool

    class Config:
        from_attributes = True


class AlertList(BaseModel):
    total: int
    unread: int
    alerts: list[AlertResponse]


class AlertAcknowledge(BaseModel):
    alert_ids: list[int] = Field(..., min_length=1)


# ── Notification Channels ────────────────────────────────────────────────

class ChannelCreate(BaseModel):
    channel_type: ChannelType
    target: str = Field(..., min_length=1, max_length=500)
    label: Optional[str] = Field(None, max_length=100)
    secret: Optional[str] = Field(None, max_length=200)


class ChannelUpdate(BaseModel):
    is_enabled: Optional[bool] = None
    target: Optional[str] = Field(None, min_length=1, max_length=500)
    label: Optional[str] = Field(None, max_length=100)


class ChannelResponse(BaseModel):
    id: int
    channel_type: ChannelType
    is_enabled: bool
    target: str
    label: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Alert Summary (for dashboard bell icon) ──────────────────────────────

class AlertSummary(BaseModel):
    total_active: int
    critical: int
    warning: int
    info: int
    latest: list[AlertResponse]

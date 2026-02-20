"""Alert & Notification models for Phase 4."""

import enum
from datetime import datetime

from sqlalchemy import (
    Column, Integer, String, Text, Float, Boolean, DateTime,
    ForeignKey, Enum as SAEnum, JSON,
)
from sqlalchemy.orm import relationship

from app.core.database import Base


# ── Enums ────────────────────────────────────────────────────────────────

class AlertRuleType(str, enum.Enum):
    CHOKEPOINT_STRESS = "chokepoint_stress"
    PORT_STRESS = "port_stress"
    TRADE_ANOMALY = "trade_anomaly"
    TFII_THRESHOLD = "tfii_threshold"
    ENERGY_EXPOSURE = "energy_exposure"


class AlertSeverity(str, enum.Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class AlertStatus(str, enum.Enum):
    ACTIVE = "active"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"


class ChannelType(str, enum.Enum):
    EMAIL = "email"
    WEBHOOK = "webhook"


# ── Alert Rule ───────────────────────────────────────────────────────────

class AlertRule(Base):
    """User-configured alert rule — defines what to monitor and thresholds."""
    __tablename__ = "alert_rules"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    name = Column(String(200), nullable=False)
    rule_type = Column(SAEnum(AlertRuleType), nullable=False)
    is_enabled = Column(Boolean, default=True, nullable=False)

    # Flexible config stored as JSON:
    # chokepoint_stress: {"chokepoint": "Suez Canal", "z_score_threshold": 1.5}
    # port_stress:       {"port_name": "Shanghai", "psi_threshold": 0.7}
    # trade_anomaly:     {"iso_code": "DEU", "z_score_threshold": 2.0}
    # tfii_threshold:    {"exporter": "CHN", "importer": "USA", "tfii_min": 50}
    # energy_exposure:   {"iso_code": "JPN", "ecei_threshold": 0.6}
    config = Column(JSON, nullable=False, default=dict)

    # Cooldown: minimum minutes between repeated alerts for same condition
    cooldown_minutes = Column(Integer, default=60, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", backref="alert_rules")
    alerts = relationship("Alert", back_populates="rule", cascade="all, delete-orphan")


# ── Alert (triggered instance) ───────────────────────────────────────────

class Alert(Base):
    """A triggered alert — created when a rule condition is met."""
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    rule_id = Column(Integer, ForeignKey("alert_rules.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    severity = Column(SAEnum(AlertSeverity), nullable=False)
    status = Column(SAEnum(AlertStatus), default=AlertStatus.ACTIVE, nullable=False)

    title = Column(String(300), nullable=False)
    message = Column(Text, nullable=False)
    details = Column(JSON, nullable=True)  # Raw metric values that triggered it

    triggered_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    acknowledged_at = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)

    # Track notification delivery
    email_sent = Column(Boolean, default=False)
    webhook_sent = Column(Boolean, default=False)

    # Relationships
    rule = relationship("AlertRule", back_populates="alerts")
    user = relationship("User", backref="alerts")


# ── Notification Channel ─────────────────────────────────────────────────

class NotificationChannel(Base):
    """User-configured notification endpoint (email address or webhook URL)."""
    __tablename__ = "notification_channels"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    channel_type = Column(SAEnum(ChannelType), nullable=False)
    is_enabled = Column(Boolean, default=True, nullable=False)

    # For EMAIL: the target address (may differ from account email)
    # For WEBHOOK: the URL to POST to
    target = Column(String(500), nullable=False)

    # Optional label
    label = Column(String(100), nullable=True)

    # Webhook: optional secret for HMAC signature verification
    secret = Column(String(200), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationship
    user = relationship("User", backref="notification_channels")

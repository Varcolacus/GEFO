"""
Alert & Notification API — manage rules, view alerts, configure channels.

All endpoints require authentication. Pro+ users get more rule slots.
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, require_tier
from app.models.user import User, SubscriptionTier
from app.models.alert import (
    AlertRule, Alert, NotificationChannel,
    AlertRuleType, AlertSeverity, AlertStatus,
)
from app.schemas.alerts import (
    AlertRuleCreate, AlertRuleUpdate, AlertRuleResponse,
    AlertResponse, AlertList, AlertAcknowledge, AlertSummary,
    ChannelCreate, ChannelUpdate, ChannelResponse,
)
from app.services.alert_engine import evaluate_user_rules

router = APIRouter(prefix="/api/alerts", tags=["Alerts"])

# Rule limits per tier
RULE_LIMITS = {
    SubscriptionTier.FREE: 3,
    SubscriptionTier.PRO: 20,
    SubscriptionTier.INSTITUTIONAL: 100,
}

CHANNEL_LIMITS = {
    SubscriptionTier.FREE: 1,
    SubscriptionTier.PRO: 5,
    SubscriptionTier.INSTITUTIONAL: 20,
}


# ── Helper ───────────────────────────────────────────────────────────────

def _rule_to_response(rule: AlertRule) -> AlertRuleResponse:
    active_count = len([a for a in rule.alerts if a.status == AlertStatus.ACTIVE])
    return AlertRuleResponse(
        id=rule.id,
        name=rule.name,
        rule_type=rule.rule_type,
        is_enabled=rule.is_enabled,
        config=rule.config or {},
        cooldown_minutes=rule.cooldown_minutes,
        created_at=rule.created_at,
        alert_count=active_count,
    )


def _alert_to_response(alert: Alert) -> AlertResponse:
    return AlertResponse(
        id=alert.id,
        rule_id=alert.rule_id,
        rule_name=alert.rule.name if alert.rule else "",
        severity=alert.severity,
        status=alert.status,
        title=alert.title,
        message=alert.message,
        details=alert.details,
        triggered_at=alert.triggered_at,
        acknowledged_at=alert.acknowledged_at,
        resolved_at=alert.resolved_at,
        email_sent=alert.email_sent,
        webhook_sent=alert.webhook_sent,
    )


# ══════════════════════════════════════════════════════════════════════════
#  ALERT RULES
# ══════════════════════════════════════════════════════════════════════════

@router.post("/rules", response_model=AlertRuleResponse, status_code=201)
def create_rule(
    body: AlertRuleCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create an alert rule. Tier limits: Free=3, Pro=20, Institutional=100."""
    limit = RULE_LIMITS.get(user.tier, 3)
    existing = db.query(AlertRule).filter(AlertRule.user_id == user.id).count()
    if existing >= limit:
        raise HTTPException(
            status_code=403,
            detail=f"Rule limit reached ({limit} for {user.tier.value} tier). Upgrade for more.",
        )

    rule = AlertRule(
        user_id=user.id,
        name=body.name,
        rule_type=body.rule_type,
        config=body.config,
        cooldown_minutes=body.cooldown_minutes,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return _rule_to_response(rule)


@router.get("/rules", response_model=list[AlertRuleResponse])
def list_rules(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all alert rules for the current user."""
    rules = (
        db.query(AlertRule)
        .filter(AlertRule.user_id == user.id)
        .order_by(AlertRule.created_at.desc())
        .all()
    )
    return [_rule_to_response(r) for r in rules]


@router.patch("/rules/{rule_id}", response_model=AlertRuleResponse)
def update_rule(
    rule_id: int,
    body: AlertRuleUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update an alert rule."""
    rule = db.query(AlertRule).filter(AlertRule.id == rule_id, AlertRule.user_id == user.id).first()
    if not rule:
        raise HTTPException(404, "Rule not found")

    if body.name is not None:
        rule.name = body.name
    if body.is_enabled is not None:
        rule.is_enabled = body.is_enabled
    if body.config is not None:
        rule.config = body.config
    if body.cooldown_minutes is not None:
        rule.cooldown_minutes = body.cooldown_minutes

    rule.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(rule)
    return _rule_to_response(rule)


@router.delete("/rules/{rule_id}", status_code=204)
def delete_rule(
    rule_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete an alert rule and all its triggered alerts."""
    rule = db.query(AlertRule).filter(AlertRule.id == rule_id, AlertRule.user_id == user.id).first()
    if not rule:
        raise HTTPException(404, "Rule not found")
    db.delete(rule)
    db.commit()


# ══════════════════════════════════════════════════════════════════════════
#  ALERTS (triggered instances)
# ══════════════════════════════════════════════════════════════════════════

@router.get("/", response_model=AlertList)
def list_alerts(
    status: Optional[AlertStatus] = None,
    severity: Optional[AlertSeverity] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List alerts for the current user with optional filters."""
    q = db.query(Alert).filter(Alert.user_id == user.id)

    if status:
        q = q.filter(Alert.status == status)
    if severity:
        q = q.filter(Alert.severity == severity)

    total = q.count()
    unread = (
        db.query(Alert)
        .filter(Alert.user_id == user.id, Alert.status == AlertStatus.ACTIVE)
        .count()
    )

    alerts = q.order_by(Alert.triggered_at.desc()).offset(offset).limit(limit).all()

    return AlertList(
        total=total,
        unread=unread,
        alerts=[_alert_to_response(a) for a in alerts],
    )


@router.get("/summary", response_model=AlertSummary)
def alert_summary(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Quick summary for the notification bell badge."""
    active = (
        db.query(Alert)
        .filter(Alert.user_id == user.id, Alert.status == AlertStatus.ACTIVE)
    )

    all_active = active.all()
    critical = sum(1 for a in all_active if a.severity == AlertSeverity.CRITICAL)
    warning = sum(1 for a in all_active if a.severity == AlertSeverity.WARNING)
    info = sum(1 for a in all_active if a.severity == AlertSeverity.INFO)

    latest = (
        db.query(Alert)
        .filter(Alert.user_id == user.id)
        .order_by(Alert.triggered_at.desc())
        .limit(5)
        .all()
    )

    return AlertSummary(
        total_active=len(all_active),
        critical=critical,
        warning=warning,
        info=info,
        latest=[_alert_to_response(a) for a in latest],
    )


@router.post("/acknowledge")
def acknowledge_alerts(
    body: AlertAcknowledge,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark alerts as acknowledged."""
    now = datetime.utcnow()
    updated = (
        db.query(Alert)
        .filter(
            Alert.id.in_(body.alert_ids),
            Alert.user_id == user.id,
            Alert.status == AlertStatus.ACTIVE,
        )
        .update(
            {Alert.status: AlertStatus.ACKNOWLEDGED, Alert.acknowledged_at: now},
            synchronize_session="fetch",
        )
    )
    db.commit()
    return {"acknowledged": updated}


@router.post("/acknowledge-all")
def acknowledge_all(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark all active alerts as acknowledged."""
    now = datetime.utcnow()
    updated = (
        db.query(Alert)
        .filter(Alert.user_id == user.id, Alert.status == AlertStatus.ACTIVE)
        .update(
            {Alert.status: AlertStatus.ACKNOWLEDGED, Alert.acknowledged_at: now},
            synchronize_session="fetch",
        )
    )
    db.commit()
    return {"acknowledged": updated}


@router.post("/check")
def trigger_check(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Manually trigger an alert check for the current user's rules."""
    new_alerts = evaluate_user_rules(db, user_id=user.id, year=2023)
    return {
        "checked_at": datetime.utcnow().isoformat(),
        "new_alerts": len(new_alerts),
        "alerts": [_alert_to_response(a) for a in new_alerts],
    }


# ══════════════════════════════════════════════════════════════════════════
#  NOTIFICATION CHANNELS
# ══════════════════════════════════════════════════════════════════════════

@router.post("/channels", response_model=ChannelResponse, status_code=201)
def create_channel(
    body: ChannelCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a notification channel (email or webhook)."""
    limit = CHANNEL_LIMITS.get(user.tier, 1)
    existing = db.query(NotificationChannel).filter(NotificationChannel.user_id == user.id).count()
    if existing >= limit:
        raise HTTPException(
            status_code=403,
            detail=f"Channel limit reached ({limit} for {user.tier.value} tier).",
        )

    channel = NotificationChannel(
        user_id=user.id,
        channel_type=body.channel_type,
        target=body.target,
        label=body.label,
        secret=body.secret,
    )
    db.add(channel)
    db.commit()
    db.refresh(channel)
    return channel


@router.get("/channels", response_model=list[ChannelResponse])
def list_channels(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List notification channels for the current user."""
    channels = (
        db.query(NotificationChannel)
        .filter(NotificationChannel.user_id == user.id)
        .order_by(NotificationChannel.created_at.desc())
        .all()
    )
    return channels


@router.patch("/channels/{channel_id}", response_model=ChannelResponse)
def update_channel(
    channel_id: int,
    body: ChannelUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a notification channel."""
    ch = (
        db.query(NotificationChannel)
        .filter(NotificationChannel.id == channel_id, NotificationChannel.user_id == user.id)
        .first()
    )
    if not ch:
        raise HTTPException(404, "Channel not found")

    if body.is_enabled is not None:
        ch.is_enabled = body.is_enabled
    if body.target is not None:
        ch.target = body.target
    if body.label is not None:
        ch.label = body.label

    db.commit()
    db.refresh(ch)
    return ch


@router.delete("/channels/{channel_id}", status_code=204)
def delete_channel(
    channel_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a notification channel."""
    ch = (
        db.query(NotificationChannel)
        .filter(NotificationChannel.id == channel_id, NotificationChannel.user_id == user.id)
        .first()
    )
    if not ch:
        raise HTTPException(404, "Channel not found")
    db.delete(ch)
    db.commit()

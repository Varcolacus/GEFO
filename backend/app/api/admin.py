"""
Admin Dashboard API — platform stats, user management, usage analytics, system health.

All endpoints require admin authentication (is_admin=True).
"""

import platform
import time
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, case, desc, and_, text
from sqlalchemy.orm import Session

from app.core.database import get_db, engine
from app.core.security import get_admin_user
from app.core.scheduler import get_scheduler_status
from app.models.user import User, APIKey, SubscriptionTier, SubscriptionStatus
from app.models.alert import AlertRule, Alert, NotificationChannel
from app.models.usage_log import APIUsageLog
from app.models.country import Country
from app.models.trade_flow import TradeFlow
from app.models.port import Port
from app.models.shipping_density import ShippingDensity
from app.models.chokepoint import Chokepoint
from app.schemas.admin import (
    AdminUserSummary, AdminUserUpdate, PlatformStats,
    UsageAnalytics, EndpointUsage, DailyUsage, UserUsage,
    SystemHealth,
)

router = APIRouter(prefix="/api/admin", tags=["Admin"])

_start_time = time.time()


# ══════════════════════════════════════════════════════════════════════════
#  PLATFORM OVERVIEW
# ══════════════════════════════════════════════════════════════════════════

@router.get("/stats", response_model=PlatformStats)
def platform_stats(
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Get platform-wide statistics."""
    # User counts
    total_users = db.query(func.count(User.id)).scalar() or 0
    active_users = db.query(func.count(User.id)).filter(User.is_active == True).scalar() or 0  # noqa

    tier_counts = (
        db.query(User.tier, func.count(User.id))
        .group_by(User.tier)
        .all()
    )
    users_by_tier = {str(t.value) if hasattr(t, 'value') else str(t): c for t, c in tier_counts}

    # Other entity counts
    total_api_keys = db.query(func.count(APIKey.id)).scalar() or 0
    total_alert_rules = db.query(func.count(AlertRule.id)).scalar() or 0
    total_alerts = db.query(func.count(Alert.id)).scalar() or 0
    total_channels = db.query(func.count(NotificationChannel.id)).scalar() or 0

    # Database content counts
    db_counts = {
        "countries": db.query(func.count(Country.id)).scalar() or 0,
        "trade_flows": db.query(func.count(TradeFlow.id)).scalar() or 0,
        "ports": db.query(func.count(Port.id)).scalar() or 0,
        "shipping_density": db.query(func.count(ShippingDensity.id)).scalar() or 0,
        "chokepoints": db.query(func.count(Chokepoint.id)).scalar() or 0,
    }

    return PlatformStats(
        total_users=total_users,
        active_users=active_users,
        users_by_tier=users_by_tier,
        total_api_keys=total_api_keys,
        total_alert_rules=total_alert_rules,
        total_alerts_triggered=total_alerts,
        total_notification_channels=total_channels,
        db_counts=db_counts,
        scheduler_status=get_scheduler_status(),
    )


# ══════════════════════════════════════════════════════════════════════════
#  USER MANAGEMENT
# ══════════════════════════════════════════════════════════════════════════

@router.get("/users", response_model=list[AdminUserSummary])
def list_users(
    tier: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """List all users with filtering."""
    q = db.query(User)

    if tier:
        q = q.filter(User.tier == tier)
    if search:
        q = q.filter(
            (User.email.ilike(f"%{search}%")) |
            (User.full_name.ilike(f"%{search}%")) |
            (User.organisation.ilike(f"%{search}%"))
        )

    users = q.order_by(User.created_at.desc()).offset(offset).limit(limit).all()

    results = []
    for u in users:
        api_key_count = db.query(func.count(APIKey.id)).filter(APIKey.user_id == u.id).scalar() or 0
        alert_rule_count = db.query(func.count(AlertRule.id)).filter(AlertRule.user_id == u.id).scalar() or 0
        results.append(AdminUserSummary(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            organisation=u.organisation,
            tier=u.tier.value if hasattr(u.tier, 'value') else str(u.tier),
            subscription_status=u.subscription_status.value if hasattr(u.subscription_status, 'value') else str(u.subscription_status),
            is_active=u.is_active,
            is_admin=u.is_admin,
            api_key_count=api_key_count,
            alert_rule_count=alert_rule_count,
            created_at=u.created_at,
        ))
    return results


@router.get("/users/{user_id}", response_model=AdminUserSummary)
def get_user(
    user_id: int,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Get a single user's details."""
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(404, "User not found")

    api_key_count = db.query(func.count(APIKey.id)).filter(APIKey.user_id == u.id).scalar() or 0
    alert_rule_count = db.query(func.count(AlertRule.id)).filter(AlertRule.user_id == u.id).scalar() or 0

    return AdminUserSummary(
        id=u.id,
        email=u.email,
        full_name=u.full_name,
        organisation=u.organisation,
        tier=u.tier.value if hasattr(u.tier, 'value') else str(u.tier),
        subscription_status=u.subscription_status.value if hasattr(u.subscription_status, 'value') else str(u.subscription_status),
        is_active=u.is_active,
        is_admin=u.is_admin,
        api_key_count=api_key_count,
        alert_rule_count=alert_rule_count,
        created_at=u.created_at,
    )


@router.patch("/users/{user_id}", response_model=AdminUserSummary)
def update_user(
    user_id: int,
    body: AdminUserUpdate,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Update a user's tier, active status, or admin flag."""
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(404, "User not found")

    if body.tier is not None:
        try:
            u.tier = SubscriptionTier(body.tier)
        except ValueError:
            raise HTTPException(400, f"Invalid tier: {body.tier}")
    if body.is_active is not None:
        u.is_active = body.is_active
    if body.is_admin is not None:
        # Prevent removing your own admin access
        if user_id == admin.id and body.is_admin is False:
            raise HTTPException(400, "Cannot remove your own admin access")
        u.is_admin = body.is_admin

    u.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(u)

    api_key_count = db.query(func.count(APIKey.id)).filter(APIKey.user_id == u.id).scalar() or 0
    alert_rule_count = db.query(func.count(AlertRule.id)).filter(AlertRule.user_id == u.id).scalar() or 0

    return AdminUserSummary(
        id=u.id,
        email=u.email,
        full_name=u.full_name,
        organisation=u.organisation,
        tier=u.tier.value,
        subscription_status=u.subscription_status.value,
        is_active=u.is_active,
        is_admin=u.is_admin,
        api_key_count=api_key_count,
        alert_rule_count=alert_rule_count,
        created_at=u.created_at,
    )


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Delete a user and all their data (cascades)."""
    if user_id == admin.id:
        raise HTTPException(400, "Cannot delete yourself")

    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(404, "User not found")

    db.delete(u)
    db.commit()


# ══════════════════════════════════════════════════════════════════════════
#  USAGE ANALYTICS
# ══════════════════════════════════════════════════════════════════════════

@router.get("/usage", response_model=UsageAnalytics)
def usage_analytics(
    days: int = Query(7, ge=1, le=90),
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Get API usage analytics for the last N days."""
    now = datetime.utcnow()
    start = now - timedelta(days=days)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=7)

    # Total requests in window
    total = db.query(func.count(APIUsageLog.id)).filter(
        APIUsageLog.timestamp >= start
    ).scalar() or 0

    # Today
    requests_today = db.query(func.count(APIUsageLog.id)).filter(
        APIUsageLog.timestamp >= today_start
    ).scalar() or 0

    # This week
    requests_week = db.query(func.count(APIUsageLog.id)).filter(
        APIUsageLog.timestamp >= week_start
    ).scalar() or 0

    # Top endpoints
    top_eps = (
        db.query(
            APIUsageLog.endpoint,
            APIUsageLog.method,
            func.count(APIUsageLog.id).label("cnt"),
            func.avg(APIUsageLog.response_time_ms).label("avg_ms"),
        )
        .filter(APIUsageLog.timestamp >= start)
        .group_by(APIUsageLog.endpoint, APIUsageLog.method)
        .order_by(desc("cnt"))
        .limit(15)
        .all()
    )
    top_endpoints = [
        EndpointUsage(
            endpoint=ep, method=method,
            count=cnt, avg_response_ms=round(avg_ms, 1) if avg_ms else None,
        )
        for ep, method, cnt, avg_ms in top_eps
    ]

    # Daily trend
    daily_rows = (
        db.query(
            func.date(APIUsageLog.timestamp).label("day"),
            func.count(APIUsageLog.id).label("cnt"),
        )
        .filter(APIUsageLog.timestamp >= start)
        .group_by(func.date(APIUsageLog.timestamp))
        .order_by("day")
        .all()
    )
    daily_trend = [DailyUsage(date=str(day), request_count=cnt) for day, cnt in daily_rows]

    # Top users
    top_user_rows = (
        db.query(
            APIUsageLog.user_id,
            func.count(APIUsageLog.id).label("cnt"),
            func.max(APIUsageLog.timestamp).label("last_req"),
        )
        .filter(APIUsageLog.timestamp >= start, APIUsageLog.user_id.isnot(None))
        .group_by(APIUsageLog.user_id)
        .order_by(desc("cnt"))
        .limit(10)
        .all()
    )
    top_users = []
    for uid, cnt, last_req in top_user_rows:
        u = db.query(User).filter(User.id == uid).first()
        if u:
            top_users.append(UserUsage(
                user_id=uid,
                email=u.email,
                tier=u.tier.value,
                request_count=cnt,
                last_request=last_req,
            ))

    # Error rate
    error_count = db.query(func.count(APIUsageLog.id)).filter(
        APIUsageLog.timestamp >= start,
        APIUsageLog.status_code >= 400,
    ).scalar() or 0
    error_rate = round((error_count / total * 100) if total > 0 else 0, 2)

    return UsageAnalytics(
        total_requests=total,
        requests_today=requests_today,
        requests_this_week=requests_week,
        top_endpoints=top_endpoints,
        daily_trend=daily_trend,
        top_users=top_users,
        error_rate=error_rate,
    )


# ══════════════════════════════════════════════════════════════════════════
#  SYSTEM HEALTH
# ══════════════════════════════════════════════════════════════════════════

@router.get("/health", response_model=SystemHealth)
def system_health(
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Detailed system health check."""
    # Database check
    db_status = "healthy"
    db_info = {}
    try:
        result = db.execute(text("SELECT version()")).scalar()
        db_info["version"] = result
        db_info["connection"] = "ok"

        # Table sizes
        sizes = db.execute(text(
            "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 10"
        )).fetchall()
        db_info["table_rows"] = {name: rows for name, rows in sizes}
    except Exception as e:
        db_status = "unhealthy"
        db_info["error"] = str(e)

    # Scheduler
    sched = get_scheduler_status()

    # Overall status
    overall = "healthy"
    if db_status != "healthy":
        overall = "unhealthy"
    elif not sched.get("running"):
        overall = "degraded"

    return SystemHealth(
        status=overall,
        database={"status": db_status, **db_info},
        scheduler=sched,
        uptime_seconds=round(time.time() - _start_time, 1),
        api_version="0.5.0",
        python_version=platform.python_version(),
    )


# ══════════════════════════════════════════════════════════════════════════
#  RECENT ACTIVITY LOG
# ══════════════════════════════════════════════════════════════════════════

@router.get("/activity")
def recent_activity(
    limit: int = Query(50, ge=1, le=200),
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Get recent API activity across all users."""
    logs = (
        db.query(APIUsageLog)
        .order_by(APIUsageLog.timestamp.desc())
        .limit(limit)
        .all()
    )

    results = []
    # Cache user lookups
    user_cache: dict[int, str] = {}
    for log in logs:
        email = ""
        if log.user_id:
            if log.user_id not in user_cache:
                u = db.query(User.email).filter(User.id == log.user_id).first()
                user_cache[log.user_id] = u.email if u else "deleted"
            email = user_cache[log.user_id]

        results.append({
            "id": log.id,
            "user_email": email,
            "endpoint": log.endpoint,
            "method": log.method,
            "status_code": log.status_code,
            "response_time_ms": log.response_time_ms,
            "ip_address": log.ip_address,
            "timestamp": log.timestamp.isoformat() if log.timestamp else None,
        })

    return {"activity": results}


# ══════════════════════════════════════════════════════════════════════════
#  MAKE USER ADMIN (bootstrap utility)
# ══════════════════════════════════════════════════════════════════════════

@router.post("/bootstrap")
def bootstrap_admin(
    db: Session = Depends(get_db),
):
    """
    Bootstrap: promote the first registered user to admin.
    Only works if there are NO existing admins.
    This is a one-time setup endpoint.
    """
    existing_admin = db.query(User).filter(User.is_admin == True).first()  # noqa
    if existing_admin:
        raise HTTPException(400, "Admin already exists. Use PATCH /api/admin/users/{id} instead.")

    first_user = db.query(User).order_by(User.id).first()
    if not first_user:
        raise HTTPException(404, "No users registered yet")

    first_user.is_admin = True
    first_user.updated_at = datetime.utcnow()
    db.commit()

    return {
        "message": f"User {first_user.email} promoted to admin",
        "user_id": first_user.id,
    }

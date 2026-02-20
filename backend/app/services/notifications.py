"""
Notification dispatch — sends alerts via email and webhook channels.
"""

import hashlib
import hmac
import json
import logging
from datetime import datetime
from typing import List

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.alert import Alert, NotificationChannel, ChannelType

logger = logging.getLogger("gefo.notifications")


# ── Email via SMTP ───────────────────────────────────────────────────────

async def send_email_notification(channel: NotificationChannel, alert: Alert) -> bool:
    """
    Send an alert notification email.
    Uses SMTP settings from config. Falls back gracefully if not configured.
    """
    if not settings.smtp_host:
        logger.warning("SMTP not configured — skipping email to %s", channel.target)
        return False

    try:
        import aiosmtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart

        severity_emoji = {"critical": "🔴", "warning": "🟠", "info": "🔵"}
        emoji = severity_emoji.get(alert.severity.value, "📢")

        html_body = f"""
        <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #0f172a; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                <h2 style="margin: 0;">{emoji} GEFO Alert</h2>
            </div>
            <div style="background: #1e293b; color: #e2e8f0; padding: 20px;">
                <h3 style="color: #22d3ee; margin-top: 0;">{alert.title}</h3>
                <p>{alert.message}</p>
                <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
                    <tr>
                        <td style="padding: 8px; color: #94a3b8;">Severity</td>
                        <td style="padding: 8px; font-weight: bold;">{alert.severity.value.upper()}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; color: #94a3b8;">Triggered</td>
                        <td style="padding: 8px;">{alert.triggered_at.strftime('%Y-%m-%d %H:%M UTC')}</td>
                    </tr>
                </table>
            </div>
            <div style="background: #0f172a; color: #64748b; padding: 12px 20px; border-radius: 0 0 8px 8px; font-size: 12px;">
                Global Economic Flow Observatory — <a href="{settings.app_url}" style="color: #22d3ee;">Open Dashboard</a>
            </div>
        </div>
        """

        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"[GEFO {alert.severity.value.upper()}] {alert.title}"
        msg["From"] = settings.smtp_from_email
        msg["To"] = channel.target

        msg.attach(MIMEText(alert.message, "plain"))
        msg.attach(MIMEText(html_body, "html"))

        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_username or None,
            password=settings.smtp_password or None,
            use_tls=settings.smtp_use_tls,
        )

        logger.info("Email sent to %s for alert %d", channel.target, alert.id)
        return True

    except ImportError:
        logger.warning("aiosmtplib not installed — skipping email notification")
        return False
    except Exception as exc:
        logger.error("Failed to send email to %s: %s", channel.target, exc)
        return False


# ── Webhook POST ─────────────────────────────────────────────────────────

async def send_webhook_notification(channel: NotificationChannel, alert: Alert) -> bool:
    """
    POST alert payload to a webhook URL with optional HMAC-SHA256 signature.
    """
    payload = {
        "event": "alert.triggered",
        "alert": {
            "id": alert.id,
            "severity": alert.severity.value,
            "title": alert.title,
            "message": alert.message,
            "details": alert.details,
            "triggered_at": alert.triggered_at.isoformat(),
        },
        "timestamp": datetime.utcnow().isoformat(),
    }

    headers = {"Content-Type": "application/json", "User-Agent": "GEFO-Alerts/1.0"}

    # Sign with HMAC if secret is configured
    if channel.secret:
        body_bytes = json.dumps(payload, sort_keys=True).encode()
        sig = hmac.new(channel.secret.encode(), body_bytes, hashlib.sha256).hexdigest()
        headers["X-GEFO-Signature"] = f"sha256={sig}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(channel.target, json=payload, headers=headers)
            if resp.status_code < 300:
                logger.info("Webhook delivered to %s (status %d)", channel.target, resp.status_code)
                return True
            else:
                logger.warning("Webhook %s returned %d", channel.target, resp.status_code)
                return False
    except Exception as exc:
        logger.error("Webhook delivery to %s failed: %s", channel.target, exc)
        return False


# ── Dispatch all channels for an alert ───────────────────────────────────

async def dispatch_notifications(db: Session, alert: Alert) -> None:
    """Send alert to all enabled notification channels for the alert's user."""
    channels: List[NotificationChannel] = (
        db.query(NotificationChannel)
        .filter(
            NotificationChannel.user_id == alert.user_id,
            NotificationChannel.is_enabled == True,  # noqa: E712
        )
        .all()
    )

    for ch in channels:
        if ch.channel_type == ChannelType.EMAIL:
            ok = await send_email_notification(ch, alert)
            if ok:
                alert.email_sent = True
        elif ch.channel_type == ChannelType.WEBHOOK:
            ok = await send_webhook_notification(ch, alert)
            if ok:
                alert.webhook_sent = True

    db.commit()


async def dispatch_all_new_alerts(db: Session, alerts: List[Alert]) -> None:
    """Dispatch notifications for a batch of newly-created alerts."""
    for alert in alerts:
        await dispatch_notifications(db, alert)

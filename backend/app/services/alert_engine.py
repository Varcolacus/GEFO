"""
Alert Engine — evaluates user-configured rules against live intelligence data.

Runs periodically via APScheduler. For each active rule, checks whether the
monitored metric breaches the user's threshold, respects cooldown, then creates
Alert records and dispatches notifications.
"""

from datetime import datetime, timedelta
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.alert import (
    AlertRule, Alert, NotificationChannel,
    AlertRuleType, AlertSeverity, AlertStatus, ChannelType,
)
from app.services.chokepoint_monitor import monitor_chokepoints
from app.services.port_stress import compute_port_stress
from app.services.tfii import compute_corridor_tfii
from app.services.energy_corridor import compute_energy_corridor_exposure
from app.services.baseline import compute_trade_baselines, compute_country_trade_baseline


# ── Severity mapping ─────────────────────────────────────────────────────

def _z_severity(z: float) -> AlertSeverity:
    """Map absolute z-score to severity."""
    az = abs(z)
    if az >= 2.5:
        return AlertSeverity.CRITICAL
    if az >= 1.5:
        return AlertSeverity.WARNING
    return AlertSeverity.INFO


def _psi_severity(psi: float) -> AlertSeverity:
    if psi >= 0.85:
        return AlertSeverity.CRITICAL
    if psi >= 0.65:
        return AlertSeverity.WARNING
    return AlertSeverity.INFO


def _ecei_severity(ecei: float) -> AlertSeverity:
    if ecei >= 0.7:
        return AlertSeverity.CRITICAL
    if ecei >= 0.45:
        return AlertSeverity.WARNING
    return AlertSeverity.INFO


# ── Rule evaluators ──────────────────────────────────────────────────────

def _eval_chokepoint_stress(rule: AlertRule, db: Session, year: int) -> Optional[dict]:
    """Check if a specific chokepoint's z-score exceeds threshold."""
    cfg = rule.config
    target_name = cfg.get("chokepoint", "").lower()
    threshold = float(cfg.get("z_score_threshold", 1.5))

    results = monitor_chokepoints(db, current_year=year)
    for cp in results:
        if cp["name"].lower() == target_name:
            z = abs(cp.get("z_score", 0))
            if z >= threshold:
                return {
                    "title": f"Chokepoint Alert: {cp['name']}",
                    "message": (
                        f"{cp['name']} z-score is {cp['z_score']:.2f} "
                        f"(threshold: {threshold}). "
                        f"Stress level: {cp.get('stress_level', 'unknown')}."
                    ),
                    "severity": _z_severity(cp["z_score"]),
                    "details": {
                        "chokepoint": cp["name"],
                        "z_score": cp["z_score"],
                        "current_density": cp.get("current_density"),
                        "baseline_mean": cp.get("baseline_mean"),
                        "stress_level": cp.get("stress_level"),
                    },
                }
    return None


def _eval_port_stress(rule: AlertRule, db: Session, year: int) -> Optional[dict]:
    """Check if a specific port's PSI exceeds threshold."""
    cfg = rule.config
    target_port = cfg.get("port_name", "").lower()
    threshold = float(cfg.get("psi_threshold", 0.7))

    ports = compute_port_stress(db, year=year)
    for p in ports:
        if p["port_name"].lower() == target_port:
            psi = p.get("psi", 0)
            if psi >= threshold:
                return {
                    "title": f"Port Stress Alert: {p['port_name']}",
                    "message": (
                        f"{p['port_name']} ({p['country_iso']}) PSI is {psi:.3f} "
                        f"(threshold: {threshold}). "
                        f"Stress level: {p.get('stress_level', 'unknown')}."
                    ),
                    "severity": _psi_severity(psi),
                    "details": {
                        "port_name": p["port_name"],
                        "country_iso": p["country_iso"],
                        "psi": round(psi, 4),
                        "stress_level": p.get("stress_level"),
                        "throughput_teu": p.get("throughput_teu"),
                    },
                }
    return None


def _eval_trade_anomaly(rule: AlertRule, db: Session, year: int) -> Optional[dict]:
    """Check if a country's trade z-score exceeds threshold."""
    cfg = rule.config
    iso = cfg.get("iso_code", "")
    threshold = float(cfg.get("z_score_threshold", 2.0))

    if iso:
        data = compute_country_trade_baseline(db, iso_code=iso, current_year=year)
        indicators = data.get("indicators", [])
    else:
        data = compute_trade_baselines(db, current_year=year)
        indicators = [data] if isinstance(data, dict) else []

    for ind in indicators:
        z = abs(ind.get("z_score", 0))
        if z >= threshold:
            metric = ind.get("metric", "trade_volume")
            return {
                "title": f"Trade Anomaly: {iso or 'Global'} — {metric}",
                "message": (
                    f"{'Country ' + iso if iso else 'Global'} {metric} "
                    f"z-score is {ind['z_score']:.2f} (threshold: {threshold}). "
                    f"Classification: {ind.get('classification', 'unknown')}."
                ),
                "severity": _z_severity(ind["z_score"]),
                "details": {
                    "iso_code": iso or "GLOBAL",
                    "metric": metric,
                    "z_score": round(ind["z_score"], 3),
                    "current_value": ind.get("current_value"),
                    "baseline_mean": ind.get("baseline_mean"),
                    "classification": ind.get("classification"),
                },
            }
    return None


def _eval_tfii_threshold(rule: AlertRule, db: Session, year: int) -> Optional[dict]:
    """Check if a trade corridor's TFII crosses a minimum threshold."""
    cfg = rule.config
    exporter = cfg.get("exporter", "").upper()
    importer = cfg.get("importer", "").upper()
    tfii_min = float(cfg.get("tfii_min", 50))

    corridors = compute_corridor_tfii(db, year=year, top_n=100)
    for c in corridors:
        if c["exporter_iso"] == exporter and c["importer_iso"] == importer:
            if c["tfii"] >= tfii_min:
                return {
                    "title": f"TFII Alert: {exporter}→{importer}",
                    "message": (
                        f"Corridor {exporter}→{importer} TFII is {c['tfii']:.1f} "
                        f"(threshold: {tfii_min}). "
                        f"Interpretation: {c.get('interpretation', '')}."
                    ),
                    "severity": AlertSeverity.WARNING if c["tfii"] >= tfii_min * 1.5 else AlertSeverity.INFO,
                    "details": {
                        "exporter": exporter,
                        "importer": importer,
                        "tfii": round(c["tfii"], 2),
                        "trade_value_usd": c.get("trade_value_usd"),
                        "interpretation": c.get("interpretation"),
                    },
                }
    return None


def _eval_energy_exposure(rule: AlertRule, db: Session, year: int) -> Optional[dict]:
    """Check if a country's ECEI exceeds threshold."""
    cfg = rule.config
    iso = cfg.get("iso_code", "").upper()
    threshold = float(cfg.get("ecei_threshold", 0.6))

    countries = compute_energy_corridor_exposure(db, year=year)
    for c in countries:
        if c["iso_code"] == iso:
            ecei = c.get("ecei", 0)
            if ecei >= threshold:
                return {
                    "title": f"Energy Exposure Alert: {iso}",
                    "message": (
                        f"{iso} ECEI is {ecei:.3f} (threshold: {threshold}). "
                        f"Risk level: {c.get('risk_level', 'unknown')}."
                    ),
                    "severity": _ecei_severity(ecei),
                    "details": {
                        "iso_code": iso,
                        "ecei": round(ecei, 4),
                        "risk_level": c.get("risk_level"),
                        "total_trade_usd": c.get("total_trade_usd"),
                    },
                }
    return None


# ── Evaluator dispatch ───────────────────────────────────────────────────

_EVALUATORS = {
    AlertRuleType.CHOKEPOINT_STRESS: _eval_chokepoint_stress,
    AlertRuleType.PORT_STRESS: _eval_port_stress,
    AlertRuleType.TRADE_ANOMALY: _eval_trade_anomaly,
    AlertRuleType.TFII_THRESHOLD: _eval_tfii_threshold,
    AlertRuleType.ENERGY_EXPOSURE: _eval_energy_exposure,
}


# ── Cooldown check ───────────────────────────────────────────────────────

def _is_in_cooldown(db: Session, rule: AlertRule) -> bool:
    """Return True if a recent alert exists within the cooldown window."""
    cutoff = datetime.utcnow() - timedelta(minutes=rule.cooldown_minutes)
    recent = (
        db.query(Alert)
        .filter(Alert.rule_id == rule.id, Alert.triggered_at >= cutoff)
        .first()
    )
    return recent is not None


# ── Main engine entry point ──────────────────────────────────────────────

def evaluate_rules(db: Session, year: int = 2023) -> List[Alert]:
    """
    Evaluate ALL enabled alert rules for ALL users.
    Returns list of newly-created Alert objects.
    """
    rules: List[AlertRule] = (
        db.query(AlertRule)
        .filter(AlertRule.is_enabled == True)  # noqa: E712
        .all()
    )

    new_alerts: List[Alert] = []

    for rule in rules:
        # Skip if in cooldown
        if _is_in_cooldown(db, rule):
            continue

        evaluator = _EVALUATORS.get(rule.rule_type)
        if not evaluator:
            continue

        try:
            result = evaluator(rule, db, year)
        except Exception as exc:
            # Log but don't crash the whole engine
            print(f"[AlertEngine] Error evaluating rule {rule.id} ({rule.rule_type}): {exc}")
            continue

        if result is None:
            continue  # Threshold not breached

        alert = Alert(
            rule_id=rule.id,
            user_id=rule.user_id,
            severity=result["severity"],
            status=AlertStatus.ACTIVE,
            title=result["title"],
            message=result["message"],
            details=result.get("details"),
        )
        db.add(alert)
        new_alerts.append(alert)

    if new_alerts:
        db.commit()
        for a in new_alerts:
            db.refresh(a)

    return new_alerts


def evaluate_user_rules(db: Session, user_id: int, year: int = 2023) -> List[Alert]:
    """Evaluate rules for a single user (e.g., on-demand check)."""
    rules: List[AlertRule] = (
        db.query(AlertRule)
        .filter(AlertRule.user_id == user_id, AlertRule.is_enabled == True)  # noqa: E712
        .all()
    )

    new_alerts: List[Alert] = []

    for rule in rules:
        if _is_in_cooldown(db, rule):
            continue

        evaluator = _EVALUATORS.get(rule.rule_type)
        if not evaluator:
            continue

        try:
            result = evaluator(rule, db, year)
        except Exception:
            continue

        if result is None:
            continue

        alert = Alert(
            rule_id=rule.id,
            user_id=rule.user_id,
            severity=result["severity"],
            status=AlertStatus.ACTIVE,
            title=result["title"],
            message=result["message"],
            details=result.get("details"),
        )
        db.add(alert)
        new_alerts.append(alert)

    if new_alerts:
        db.commit()
        for a in new_alerts:
            db.refresh(a)

    return new_alerts

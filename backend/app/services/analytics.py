"""
Advanced Analytics & Forecasting service.

Provides:
  1. Time-series trend analysis (linear regression + seasonal decomposition)
  2. Trade flow forecasting (Holt-Winters exponential smoothing / ARIMA fallback)
  3. Anomaly detection (z-score + Isolation Forest)
  4. YoY growth analysis with ranking
  5. Country-level analytics dashboard
"""

from __future__ import annotations

import logging
import math
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from sqlalchemy import func as sqlfunc, and_, or_, case
from sqlalchemy.orm import Session

from app.models.trade_flow import TradeFlow
from app.models.country import Country

logger = logging.getLogger("gefo.analytics")


# ═══════════════════════════════════════════════════════════════════
#  1. TIME-SERIES HELPERS
# ═══════════════════════════════════════════════════════════════════

def _build_trade_series(
    db: Session,
    iso_code: str,
    direction: str = "total",
    partner_iso: Optional[str] = None,
    granularity: str = "annual",
) -> Tuple[List[float], List[str]]:
    """
    Build a time-series of trade values.

    Returns (values, labels) where labels are "2020" or "2020-01".
    """
    filters = []
    if direction == "export":
        filters.append(TradeFlow.exporter_iso == iso_code)
        if partner_iso:
            filters.append(TradeFlow.importer_iso == partner_iso)
    elif direction == "import":
        filters.append(TradeFlow.importer_iso == iso_code)
        if partner_iso:
            filters.append(TradeFlow.exporter_iso == partner_iso)
    else:  # total
        filters.append(
            or_(TradeFlow.exporter_iso == iso_code, TradeFlow.importer_iso == iso_code)
        )

    if granularity == "monthly":
        q = (
            db.query(
                TradeFlow.year,
                TradeFlow.month,
                sqlfunc.sum(TradeFlow.trade_value_usd),
            )
            .filter(*filters, TradeFlow.month.isnot(None))
            .group_by(TradeFlow.year, TradeFlow.month)
            .order_by(TradeFlow.year, TradeFlow.month)
            .all()
        )
        values = [float(r[2]) for r in q]
        labels = [f"{r[0]}-{r[1]:02d}" for r in q]
    else:
        q = (
            db.query(
                TradeFlow.year,
                sqlfunc.sum(TradeFlow.trade_value_usd),
            )
            .filter(*filters)
            .group_by(TradeFlow.year)
            .order_by(TradeFlow.year)
            .all()
        )
        values = [float(r[1]) for r in q]
        labels = [str(r[0]) for r in q]

    return values, labels


def _linear_trend(values: List[float]) -> Dict[str, Any]:
    """Fit y = a + b*x via least-squares. Returns slope, intercept, r_squared."""
    n = len(values)
    if n < 2:
        return {"slope": 0, "intercept": values[0] if values else 0, "r_squared": 0}
    x = np.arange(n, dtype=float)
    y = np.array(values, dtype=float)
    A = np.vstack([x, np.ones(n)]).T
    result = np.linalg.lstsq(A, y, rcond=None)
    slope, intercept = result[0]
    ss_res = np.sum((y - (slope * x + intercept)) ** 2)
    ss_tot = np.sum((y - np.mean(y)) ** 2)
    r_sq = 1 - ss_res / ss_tot if ss_tot > 0 else 0
    return {
        "slope": round(float(slope), 2),
        "intercept": round(float(intercept), 2),
        "r_squared": round(float(r_sq), 4),
        "direction": "growing" if slope > 0 else "declining" if slope < 0 else "flat",
    }


# ═══════════════════════════════════════════════════════════════════
#  2. FORECASTING
# ═══════════════════════════════════════════════════════════════════

def _forecast_holt_winters(
    values: List[float], horizon: int = 3
) -> List[Dict[str, float]]:
    """
    Holt-Winters / Exponential Smoothing forecast.

    Falls back to linear extrapolation if statsmodels fails or series too short.
    """
    if len(values) < 4:
        return _forecast_linear(values, horizon)

    try:
        from statsmodels.tsa.holtwinters import ExponentialSmoothing

        y = np.array(values, dtype=float)

        # Choose seasonal or non-seasonal based on series length
        seasonal = None
        seasonal_periods = None
        if len(values) >= 24:  # at least 2 full annual cycles (monthly)
            seasonal = "add"
            seasonal_periods = 12
        elif len(values) >= 6:  # at least 2 cycles of a smaller period
            seasonal = None

        model = ExponentialSmoothing(
            y,
            trend="add",
            seasonal=seasonal,
            seasonal_periods=seasonal_periods,
            initialization_method="estimated",
        ).fit(optimized=True)

        forecast = model.forecast(horizon)

        # Confidence intervals via residual std
        residuals = y - model.fittedvalues
        std = float(np.std(residuals))

        results = []
        for i, val in enumerate(forecast):
            ci_width = 1.28 * std * math.sqrt(i + 1)  # ~80% CI
            results.append({
                "predicted": round(float(val), 2),
                "lower": round(float(val) - ci_width, 2),
                "upper": round(float(val) + ci_width, 2),
                "model": "holt_winters",
            })
        return results

    except Exception as e:
        logger.warning("Holt-Winters failed, falling back to linear: %s", e)
        return _forecast_linear(values, horizon)


def _forecast_linear(values: List[float], horizon: int = 3) -> List[Dict[str, float]]:
    """Simple linear extrapolation."""
    if len(values) < 2:
        val = values[0] if values else 0
        return [{"predicted": val, "lower": val * 0.8, "upper": val * 1.2, "model": "linear"}] * horizon

    trend = _linear_trend(values)
    n = len(values)
    std = float(np.std(values)) if len(values) > 2 else 0

    results = []
    for i in range(1, horizon + 1):
        pred = trend["intercept"] + trend["slope"] * (n + i - 1)
        ci_width = 1.28 * std * math.sqrt(i)
        results.append({
            "predicted": round(pred, 2),
            "lower": round(pred - ci_width, 2),
            "upper": round(pred + ci_width, 2),
            "model": "linear",
        })
    return results


# ═══════════════════════════════════════════════════════════════════
#  3. ANOMALY DETECTION
# ═══════════════════════════════════════════════════════════════════

def _detect_anomalies(
    values: List[float], labels: List[str], threshold: float = 2.0
) -> List[Dict[str, Any]]:
    """
    Z-score anomaly detection + optional Isolation Forest.

    Returns list of anomaly dicts with z_score, type, severity.
    """
    if len(values) < 5:
        return []

    arr = np.array(values, dtype=float)
    mean = float(np.mean(arr))
    std = float(np.std(arr))
    if std < 1e-10:
        return []

    anomalies = []

    # --- Z-score method ---
    for i, (val, label) in enumerate(zip(values, labels)):
        z = (val - mean) / std
        if abs(z) >= threshold:
            anomaly_type = "spike" if z > 0 else "drop"
            severity = "critical" if abs(z) >= 3.5 else "high" if abs(z) >= 3 else "medium" if abs(z) >= 2.5 else "low"
            anomalies.append({
                "index": i,
                "label": label,
                "value": round(val, 2),
                "expected": round(mean, 2),
                "z_score": round(float(z), 2),
                "type": anomaly_type,
                "severity": severity,
            })

    # --- Isolation Forest (if sklearn available and enough data) ---
    if len(values) >= 20:
        try:
            from sklearn.ensemble import IsolationForest

            # Use rolling window features
            window = min(6, len(values) // 3)
            features = []
            for i in range(len(values)):
                start = max(0, i - window)
                local_vals = arr[start:i + 1]
                features.append([
                    arr[i],
                    float(np.mean(local_vals)),
                    float(np.std(local_vals)) if len(local_vals) > 1 else 0,
                    arr[i] - arr[i - 1] if i > 0 else 0,
                ])

            X = np.array(features)
            iso = IsolationForest(contamination=0.1, random_state=42, n_estimators=100)
            preds = iso.fit_predict(X)
            scores = iso.decision_function(X)

            for i, (pred, score) in enumerate(zip(preds, scores)):
                if pred == -1:
                    # Check if already detected by z-score
                    already = any(a["index"] == i for a in anomalies)
                    if not already:
                        anomalies.append({
                            "index": i,
                            "label": labels[i],
                            "value": round(values[i], 2),
                            "expected": round(mean, 2),
                            "z_score": round(float((values[i] - mean) / std), 2),
                            "type": "structural_break",
                            "severity": "medium",
                            "method": "isolation_forest",
                            "if_score": round(float(score), 4),
                        })
        except Exception as e:
            logger.debug("Isolation Forest skipped: %s", e)

    anomalies.sort(key=lambda a: abs(a["z_score"]), reverse=True)
    return anomalies


# ═══════════════════════════════════════════════════════════════════
#  4. YOY GROWTH ANALYSIS
# ═══════════════════════════════════════════════════════════════════

def compute_yoy_growth(db: Session, year: int, limit: int = 30) -> List[Dict[str, Any]]:
    """
    Year-over-year trade growth for each country.
    Returns list sorted by growth_pct descending.
    """
    prev_year = year - 1

    # Subquery: total trade (exports + imports) per country per year
    current = (
        db.query(
            TradeFlow.exporter_iso.label("iso"),
            sqlfunc.sum(TradeFlow.trade_value_usd).label("total"),
        )
        .filter(TradeFlow.year == year)
        .group_by(TradeFlow.exporter_iso)
        .all()
    )

    previous = (
        db.query(
            TradeFlow.exporter_iso.label("iso"),
            sqlfunc.sum(TradeFlow.trade_value_usd).label("total"),
        )
        .filter(TradeFlow.year == prev_year)
        .group_by(TradeFlow.exporter_iso)
        .all()
    )

    curr_map = {r.iso: float(r.total) for r in current}
    prev_map = {r.iso: float(r.total) for r in previous}

    all_isos = set(curr_map.keys()) | set(prev_map.keys())

    # Country name lookup
    countries = db.query(Country.iso_code, Country.name).all()
    name_map = {c.iso_code: c.name for c in countries}

    results = []
    for iso in all_isos:
        curr_val = curr_map.get(iso, 0)
        prev_val = prev_map.get(iso, 0)
        if prev_val > 0:
            growth = ((curr_val - prev_val) / prev_val) * 100
        elif curr_val > 0:
            growth = 100.0
        else:
            growth = 0.0

        results.append({
            "iso_code": iso,
            "name": name_map.get(iso, iso),
            "current_value": round(curr_val, 2),
            "previous_value": round(prev_val, 2),
            "change_usd": round(curr_val - prev_val, 2),
            "growth_pct": round(growth, 2),
            "year": year,
        })

    results.sort(key=lambda r: r["growth_pct"], reverse=True)
    return results[:limit]


# ═══════════════════════════════════════════════════════════════════
#  5. COUNTRY ANALYTICS
# ═══════════════════════════════════════════════════════════════════

def country_trade_analytics(
    db: Session,
    iso_code: str,
    direction: str = "export",
    horizon: int = 3,
) -> Dict[str, Any]:
    """
    Full analytics for a single country + direction:
    - historical series
    - trend analysis
    - forecast
    - anomalies
    """
    values, labels = _build_trade_series(db, iso_code, direction, granularity="annual")

    if not values:
        return {
            "iso_code": iso_code,
            "direction": direction,
            "data_points": 0,
            "error": "No trade data found",
        }

    trend = _linear_trend(values)
    forecast = _forecast_holt_winters(values, horizon=horizon)
    anomalies = _detect_anomalies(values, labels)

    # Forecast labels
    if labels:
        last_year = int(labels[-1].split("-")[0])
        forecast_labels = [str(last_year + i + 1) for i in range(horizon)]
    else:
        forecast_labels = [f"+{i + 1}" for i in range(horizon)]

    return {
        "iso_code": iso_code,
        "direction": direction,
        "data_points": len(values),
        "historical": {
            "labels": labels,
            "values": [round(v, 2) for v in values],
        },
        "trend": trend,
        "forecast": {
            "labels": forecast_labels,
            "predictions": forecast,
        },
        "anomalies": anomalies,
        "summary": {
            "min": round(min(values), 2),
            "max": round(max(values), 2),
            "mean": round(float(np.mean(values)), 2),
            "std": round(float(np.std(values)), 2),
            "latest": round(values[-1], 2),
            "cagr": _cagr(values),
        },
    }


def _cagr(values: List[float]) -> Optional[float]:
    """Compound Annual Growth Rate."""
    if len(values) < 2 or values[0] <= 0:
        return None
    n = len(values) - 1
    ratio = values[-1] / values[0]
    if ratio <= 0:
        return None
    return round((ratio ** (1 / n) - 1) * 100, 2)


# ═══════════════════════════════════════════════════════════════════
#  6. TOP MOVERS & GLOBAL ANALYTICS
# ═══════════════════════════════════════════════════════════════════

def top_trade_movers(db: Session, year: int, limit: int = 10) -> Dict[str, Any]:
    """Top gainers and losers by trade value change."""
    growth = compute_yoy_growth(db, year, limit=200)
    if not growth:
        return {"gainers": [], "losers": [], "year": year}

    # Filter out zero-trade countries
    active = [g for g in growth if g["current_value"] > 0 or g["previous_value"] > 0]

    gainers = active[:limit]
    losers = list(reversed(active[-limit:]))

    return {"gainers": gainers, "losers": losers, "year": year}


def global_trade_trend(db: Session) -> Dict[str, Any]:
    """
    Global aggregate trade trend across all years.
    """
    q = (
        db.query(
            TradeFlow.year,
            sqlfunc.sum(TradeFlow.trade_value_usd).label("total"),
            sqlfunc.count(TradeFlow.id).label("flow_count"),
        )
        .group_by(TradeFlow.year)
        .order_by(TradeFlow.year)
        .all()
    )

    if not q:
        return {"labels": [], "values": [], "trend": {}, "flow_counts": []}

    labels = [str(r.year) for r in q]
    values = [round(float(r.total), 2) for r in q]
    flow_counts = [int(r.flow_count) for r in q]

    trend = _linear_trend(values)
    forecast = _forecast_holt_winters(values, horizon=3)

    forecast_labels = []
    if labels:
        last_year = int(labels[-1])
        forecast_labels = [str(last_year + i + 1) for i in range(3)]

    return {
        "labels": labels,
        "values": values,
        "flow_counts": flow_counts,
        "trend": trend,
        "forecast": {"labels": forecast_labels, "predictions": forecast},
        "summary": {
            "total_years": len(values),
            "min": round(min(values), 2),
            "max": round(max(values), 2),
            "latest": round(values[-1], 2),
            "cagr": _cagr(values),
        },
    }


def analytics_dashboard(db: Session, year: int) -> Dict[str, Any]:
    """
    Aggregate analytics dashboard combining all analytics.
    """
    global_trend = global_trade_trend(db)
    movers = top_trade_movers(db, year, limit=5)

    # Count anomalies across top-20 trading countries
    top_countries = (
        db.query(TradeFlow.exporter_iso)
        .filter(TradeFlow.year == year)
        .group_by(TradeFlow.exporter_iso)
        .order_by(sqlfunc.sum(TradeFlow.trade_value_usd).desc())
        .limit(20)
        .all()
    )

    total_anomalies = 0
    critical_anomalies = 0
    country_anomalies: List[Dict[str, Any]] = []

    for (iso,) in top_countries:
        values, labels = _build_trade_series(db, iso, "export", granularity="annual")
        if len(values) >= 5:
            anomalies = _detect_anomalies(values, labels)
            if anomalies:
                total_anomalies += len(anomalies)
                critical = sum(1 for a in anomalies if a["severity"] in ("critical", "high"))
                critical_anomalies += critical
                country_anomalies.append({
                    "iso_code": iso,
                    "count": len(anomalies),
                    "critical": critical,
                    "worst_z": anomalies[0]["z_score"] if anomalies else 0,
                })

    country_anomalies.sort(key=lambda c: abs(c.get("worst_z", 0)), reverse=True)

    return {
        "global_trend": global_trend,
        "top_movers": movers,
        "anomaly_summary": {
            "countries_scanned": len(top_countries),
            "total_anomalies": total_anomalies,
            "critical_anomalies": critical_anomalies,
            "by_country": country_anomalies[:10],
        },
        "year": year,
    }

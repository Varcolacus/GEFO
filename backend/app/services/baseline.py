"""
Historical Baseline & Z-Score Normalization Service
────────────────────────────────────────────────────
Computes multi-year baselines for all indicators and normalizes current
values using z-scores.

For any indicator X over baseline period [Y1..Yn]:
  μ = mean(X_Y1, X_Y2, ..., X_Yn)
  σ = std(X_Y1, X_Y2, ..., X_Yn)
  z = (X_current - μ) / σ

z-score interpretation:
  |z| < 1.0   → Within normal range
  1.0 - 1.5   → Notable deviation
  1.5 - 2.0   → Significant deviation
  |z| > 2.0   → Extreme deviation (potential anomaly)

Also computes:
  - Year-over-year growth rates
  - Trend direction (increasing / stable / decreasing)
  - Deviation from 5-year trend line
"""
import logging
import math
from typing import Dict, List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.trade_flow import TradeFlow
from app.models.shipping_density import ShippingDensity
from app.models.port import Port
from app.models.country import Country

logger = logging.getLogger("gefo.intelligence.baseline")


def _mean(values: List[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _std(values: List[float]) -> float:
    if len(values) < 2:
        return 0.0
    m = _mean(values)
    return math.sqrt(sum((v - m) ** 2 for v in values) / (len(values) - 1))


def _z_score(current: float, mean: float, std: float) -> float:
    return (current - mean) / std if std > 0 else 0.0


def _trend_direction(values: List[float]) -> str:
    """Simple trend via sign of linear slope."""
    if len(values) < 2:
        return "stable"
    n = len(values)
    x_mean = (n - 1) / 2
    y_mean = _mean(values)
    num = sum((i - x_mean) * (values[i] - y_mean) for i in range(n))
    den = sum((i - x_mean) ** 2 for i in range(n))
    slope = num / den if den != 0 else 0
    if abs(slope) / (abs(y_mean) + 1e-9) < 0.02:  # <2% annual change
        return "stable"
    return "increasing" if slope > 0 else "decreasing"


def _growth_rate(old: float, new: float) -> Optional[float]:
    if old and old != 0:
        return round((new - old) / abs(old) * 100, 2)
    return None


def _classify_z(z: float) -> str:
    abs_z = abs(z)
    if abs_z < 1.0:
        return "normal"
    elif abs_z < 1.5:
        return "notable"
    elif abs_z < 2.0:
        return "significant"
    else:
        return "extreme"


# ─────────────────────────────────────────────────────────────────────────────
# Trade Baseline
# ─────────────────────────────────────────────────────────────────────────────

def compute_trade_baselines(
    db: Session,
    current_year: int = 2023,
    baseline_years: Optional[List[int]] = None,
) -> Dict:
    """
    Compute baseline and z-scores for global trade metrics.
    """
    if baseline_years is None:
        baseline_years = list(range(current_year - 4, current_year + 1))

    logger.info(f"Computing trade baselines: years {baseline_years}")

    yearly_totals = []
    yearly_corridors = []
    yearly_data = {}

    for y in baseline_years:
        total = (
            db.query(func.sum(TradeFlow.trade_value_usd))
            .filter(TradeFlow.year == y)
            .scalar()
        ) or 0
        corridors = (
            db.query(func.count())
            .select_from(TradeFlow)
            .filter(TradeFlow.year == y)
            .scalar()
        ) or 0

        yearly_totals.append(total)
        yearly_corridors.append(float(corridors))
        yearly_data[y] = {"total_trade": total, "corridors": corridors}

    current_total = yearly_totals[-1] if yearly_totals else 0
    current_corridors = yearly_corridors[-1] if yearly_corridors else 0

    trade_mean = _mean(yearly_totals)
    trade_std = _std(yearly_totals)
    trade_z = _z_score(current_total, trade_mean, trade_std)

    return {
        "metric": "Global Trade Volume",
        "current_year": current_year,
        "current_value": current_total,
        "baseline_mean": round(trade_mean, 2),
        "baseline_std": round(trade_std, 2),
        "z_score": round(trade_z, 4),
        "classification": _classify_z(trade_z),
        "trend": _trend_direction(yearly_totals),
        "yoy_growth": _growth_rate(
            yearly_totals[-2] if len(yearly_totals) >= 2 else 0,
            current_total,
        ),
        "yearly_data": [
            {
                "year": y,
                "total_trade": d["total_trade"],
                "corridors": d["corridors"],
            }
            for y, d in sorted(yearly_data.items())
        ],
    }


# ─────────────────────────────────────────────────────────────────────────────
# Country Trade Baseline
# ─────────────────────────────────────────────────────────────────────────────

def compute_country_trade_baseline(
    db: Session,
    iso_code: str,
    current_year: int = 2023,
    baseline_years: Optional[List[int]] = None,
) -> Dict:
    """
    Compute baseline and z-scores for a specific country's trade metrics.
    """
    if baseline_years is None:
        baseline_years = list(range(current_year - 4, current_year + 1))

    iso = iso_code.upper()
    country = db.query(Country).filter(Country.iso_code == iso).first()
    if not country:
        return {"error": f"Country {iso} not found"}

    yearly_exports = []
    yearly_imports = []
    yearly_data = {}

    for y in baseline_years:
        exports = (
            db.query(func.sum(TradeFlow.trade_value_usd))
            .filter(TradeFlow.exporter_iso == iso, TradeFlow.year == y)
            .scalar()
        ) or 0
        imports = (
            db.query(func.sum(TradeFlow.trade_value_usd))
            .filter(TradeFlow.importer_iso == iso, TradeFlow.year == y)
            .scalar()
        ) or 0

        yearly_exports.append(exports)
        yearly_imports.append(imports)
        yearly_data[y] = {"exports": exports, "imports": imports, "balance": exports - imports}

    # Current year values
    curr_exp = yearly_exports[-1] if yearly_exports else 0
    curr_imp = yearly_imports[-1] if yearly_imports else 0

    exp_mean = _mean(yearly_exports)
    exp_std = _std(yearly_exports)
    imp_mean = _mean(yearly_imports)
    imp_std = _std(yearly_imports)

    # Trade openness over time
    gdp = country.gdp or 0
    openness_values = [
        ((e + i) / gdp * 100) if gdp > 0 else 0
        for e, i in zip(yearly_exports, yearly_imports)
    ]
    openness_mean = _mean(openness_values)
    openness_std = _std(openness_values)
    current_openness = openness_values[-1] if openness_values else 0

    return {
        "iso_code": iso,
        "country_name": country.name,
        "current_year": current_year,
        "indicators": [
            {
                "name": "Exports",
                "current": curr_exp,
                "baseline_mean": round(exp_mean, 2),
                "baseline_std": round(exp_std, 2),
                "z_score": round(_z_score(curr_exp, exp_mean, exp_std), 4),
                "classification": _classify_z(_z_score(curr_exp, exp_mean, exp_std)),
                "trend": _trend_direction(yearly_exports),
                "yoy_growth": _growth_rate(
                    yearly_exports[-2] if len(yearly_exports) >= 2 else 0, curr_exp
                ),
                "unit": "USD",
            },
            {
                "name": "Imports",
                "current": curr_imp,
                "baseline_mean": round(imp_mean, 2),
                "baseline_std": round(imp_std, 2),
                "z_score": round(_z_score(curr_imp, imp_mean, imp_std), 4),
                "classification": _classify_z(_z_score(curr_imp, imp_mean, imp_std)),
                "trend": _trend_direction(yearly_imports),
                "yoy_growth": _growth_rate(
                    yearly_imports[-2] if len(yearly_imports) >= 2 else 0, curr_imp
                ),
                "unit": "USD",
            },
            {
                "name": "Trade Openness",
                "current": round(current_openness, 2),
                "baseline_mean": round(openness_mean, 2),
                "baseline_std": round(openness_std, 2),
                "z_score": round(_z_score(current_openness, openness_mean, openness_std), 4),
                "classification": _classify_z(_z_score(current_openness, openness_mean, openness_std)),
                "trend": _trend_direction(openness_values),
                "unit": "%",
            },
        ],
        "yearly_data": [
            {"year": y, **d} for y, d in sorted(yearly_data.items())
        ],
    }


# ─────────────────────────────────────────────────────────────────────────────
# Shipping Density Baseline
# ─────────────────────────────────────────────────────────────────────────────

def compute_density_baselines(
    db: Session,
    current_year: int = 2023,
    baseline_years: Optional[List[int]] = None,
) -> Dict:
    """
    Compute baseline and z-scores for global shipping density.
    """
    if baseline_years is None:
        baseline_years = list(range(current_year - 4, current_year + 1))

    yearly_densities = []
    for y in baseline_years:
        avg = (
            db.query(func.avg(ShippingDensity.density_value))
            .filter(ShippingDensity.year == y)
            .scalar()
        )
        yearly_densities.append(float(avg) if avg else 0)

    current = yearly_densities[-1] if yearly_densities else 0
    mean = _mean(yearly_densities)
    std = _std(yearly_densities)

    return {
        "metric": "Global Shipping Density",
        "current_year": current_year,
        "current_value": round(current, 2),
        "baseline_mean": round(mean, 2),
        "baseline_std": round(std, 2),
        "z_score": round(_z_score(current, mean, std), 4),
        "classification": _classify_z(_z_score(current, mean, std)),
        "trend": _trend_direction(yearly_densities),
        "yearly_values": [
            {"year": y, "density": round(d, 2)}
            for y, d in zip(baseline_years, yearly_densities)
        ],
    }


# ─────────────────────────────────────────────────────────────────────────────
# Combined Dashboard
# ─────────────────────────────────────────────────────────────────────────────

def compute_all_baselines(
    db: Session,
    current_year: int = 2023,
) -> Dict:
    """
    Combined baseline dashboard with all key metrics.
    """
    trade = compute_trade_baselines(db, current_year)
    density = compute_density_baselines(db, current_year)

    return {
        "reference_year": current_year,
        "metrics": [trade, density],
        "summary": {
            "total_metrics": 2,
            "anomalies": sum(
                1 for m in [trade, density]
                if m.get("classification") in ("significant", "extreme")
            ),
        },
    }

"""
Chokepoint Monitoring Service
─────────────────────────────
Monitors 5 + 1 strategic maritime chokepoints for traffic anomalies.

For each chokepoint:
1. Pulls current density from shipping_density data near the chokepoint
2. Compares against historical 5-year baseline (mean + std)
3. Outputs z-score and stress classification

Chokepoints monitored:
  - Strait of Hormuz (21% of global oil)
  - Suez Canal (12% of global trade)
  - Panama Canal (5% of global trade)
  - Strait of Malacca (25% of global trade)
  - Bab el-Mandeb (9% of global oil)
  - English Channel (major Europe-Atlantic gateway)
"""
import logging
import math
from typing import Dict, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.shipping_density import ShippingDensity
from app.models.chokepoint import Chokepoint

logger = logging.getLogger("gefo.intelligence.chokepoint")

# Chokepoint reference coordinates and search radius
CHOKEPOINT_DEFS = [
    {
        "name": "Strait of Hormuz",
        "lat": 26.5, "lon": 56.2,
        "radius": 2.0,  # degrees
        "region_prefix": "Strait of Hormuz",
        "capacity_daily": 80,  # approximate tanker transits/day
        "description": "Narrow passage between Iran and Oman. Carries ~21% of global oil supply.",
        "oil_share_pct": 21.0,
        "lng_share_pct": 27.0,
    },
    {
        "name": "Suez Canal",
        "lat": 30.5, "lon": 32.5,
        "radius": 2.0,
        "region_prefix": "Suez Canal",
        "capacity_daily": 70,
        "description": "Connects Mediterranean to Red Sea. ~12% of global trade transits here.",
        "oil_share_pct": 12.0,
        "lng_share_pct": 8.0,
    },
    {
        "name": "Panama Canal",
        "lat": 9.1, "lon": -79.7,
        "radius": 2.0,
        "region_prefix": "Panama Canal",
        "capacity_daily": 40,
        "description": "Connects Atlantic and Pacific. Critical for US-Asia trade.",
        "oil_share_pct": 1.0,
        "lng_share_pct": 5.0,
    },
    {
        "name": "Strait of Malacca",
        "lat": 2.5, "lon": 101.5,
        "radius": 3.0,
        "region_prefix": "Strait of Malacca",
        "capacity_daily": 100,
        "description": "Busiest shipping lane globally. ~25% of world trade passes through.",
        "oil_share_pct": 16.0,
        "lng_share_pct": 25.0,
    },
    {
        "name": "Bab el-Mandeb",
        "lat": 12.6, "lon": 43.3,
        "radius": 2.0,
        "region_prefix": "Bab el-Mandeb",
        "capacity_daily": 60,
        "description": "Connects Red Sea to Gulf of Aden. Gateway between Suez route and Indian Ocean.",
        "oil_share_pct": 9.0,
        "lng_share_pct": 8.0,
    },
    {
        "name": "English Channel",
        "lat": 50.8, "lon": 1.0,
        "radius": 2.0,
        "region_prefix": "English Channel",
        "capacity_daily": 500,
        "description": "Busiest single shipping lane in Europe. Dover Strait carries ~400 vessels/day.",
        "oil_share_pct": 3.0,
        "lng_share_pct": 2.0,
    },
]


def _get_density_near(
    db: Session, lat: float, lon: float, radius: float,
    region_prefix: str, year: int, quarter: Optional[int] = None,
) -> float:
    """Average shipping density near a chokepoint for a given period."""
    q = db.query(func.avg(ShippingDensity.density_value)).filter(
        ShippingDensity.year == year,
    )

    # Prefer region-based filter (more accurate)
    region_result = (
        db.query(func.avg(ShippingDensity.density_value))
        .filter(
            ShippingDensity.year == year,
            ShippingDensity.region_name.ilike(f"{region_prefix}%"),
        )
    )
    if quarter:
        region_result = region_result.filter(
            ShippingDensity.month.between((quarter - 1) * 3 + 1, quarter * 3)
        )
    val = region_result.scalar()
    if val:
        return float(val)

    # Fallback to spatial proximity
    spatial_q = db.query(func.avg(ShippingDensity.density_value)).filter(
        ShippingDensity.year == year,
        ShippingDensity.lat.between(lat - radius, lat + radius),
        ShippingDensity.lon.between(lon - radius, lon + radius),
    )
    if quarter:
        spatial_q = spatial_q.filter(
            ShippingDensity.month.between((quarter - 1) * 3 + 1, quarter * 3)
        )
    val = spatial_q.scalar()
    return float(val) if val else 0.0


def _compute_baseline(
    db: Session, chokepoint_def: Dict, baseline_years: List[int],
) -> Dict:
    """Compute 5-year baseline (mean + std) for a chokepoint."""
    densities = []
    for y in baseline_years:
        d = _get_density_near(
            db, chokepoint_def["lat"], chokepoint_def["lon"],
            chokepoint_def["radius"], chokepoint_def["region_prefix"], y,
        )
        if d > 0:
            densities.append(d)

    if len(densities) < 2:
        return {"mean": densities[0] if densities else 0, "std": 0, "n": len(densities)}

    mean = sum(densities) / len(densities)
    variance = sum((d - mean) ** 2 for d in densities) / (len(densities) - 1)
    std = math.sqrt(variance)

    return {"mean": round(mean, 4), "std": round(std, 4), "n": len(densities)}


def monitor_chokepoints(
    db: Session,
    current_year: int = 2023,
    baseline_years: Optional[List[int]] = None,
) -> List[Dict]:
    """
    Monitor all strategic chokepoints. Returns current status with z-scores.
    """
    if baseline_years is None:
        baseline_years = list(range(current_year - 4, current_year + 1))  # 5-year window

    logger.info(f"Monitoring chokepoints — current year: {current_year}, baseline: {baseline_years}")
    results = []

    for cpdef in CHOKEPOINT_DEFS:
        # Current density
        current = _get_density_near(
            db, cpdef["lat"], cpdef["lon"], cpdef["radius"],
            cpdef["region_prefix"], current_year,
        )

        # Baseline
        baseline = _compute_baseline(db, cpdef, baseline_years)

        # Z-score
        z_score = 0.0
        if baseline["std"] > 0:
            z_score = (current - baseline["mean"]) / baseline["std"]

        # Stress classification
        abs_z = abs(z_score)
        if abs_z < 1.0:
            stress_level = "normal"
        elif abs_z < 1.5:
            stress_level = "elevated"
        elif abs_z < 2.0:
            stress_level = "high"
        else:
            stress_level = "critical"

        # Quarterly breakdown for the current year
        quarterly = []
        for q in range(1, 5):
            qd = _get_density_near(
                db, cpdef["lat"], cpdef["lon"], cpdef["radius"],
                cpdef["region_prefix"], current_year, quarter=q,
            )
            if qd > 0:
                q_z = ((qd - baseline["mean"]) / baseline["std"]) if baseline["std"] > 0 else 0
                quarterly.append({
                    "quarter": q,
                    "density": round(qd, 2),
                    "z_score": round(q_z, 4),
                })

        results.append({
            "name": cpdef["name"],
            "lat": cpdef["lat"],
            "lon": cpdef["lon"],
            "description": cpdef["description"],
            "current_density": round(current, 2),
            "baseline_mean": baseline["mean"],
            "baseline_std": baseline["std"],
            "z_score": round(z_score, 4),
            "stress_level": stress_level,
            "oil_share_pct": cpdef["oil_share_pct"],
            "lng_share_pct": cpdef["lng_share_pct"],
            "capacity_daily_transits": cpdef["capacity_daily"],
            "quarterly": quarterly,
        })

    # Sort by stress severity
    stress_order = {"critical": 0, "high": 1, "elevated": 2, "normal": 3}
    results.sort(key=lambda x: (stress_order.get(x["stress_level"], 4), -abs(x["z_score"])))
    return results


def get_chokepoint_history(
    db: Session,
    chokepoint_name: str,
    years: Optional[List[int]] = None,
) -> Dict:
    """
    Historical density data for a specific chokepoint.
    """
    cpdef = next((c for c in CHOKEPOINT_DEFS if c["name"] == chokepoint_name), None)
    if not cpdef:
        return {"error": f"Unknown chokepoint: {chokepoint_name}"}

    if years is None:
        years = list(range(2018, 2024))

    history = []
    for y in years:
        yearly = _get_density_near(
            db, cpdef["lat"], cpdef["lon"], cpdef["radius"],
            cpdef["region_prefix"], y,
        )
        quarterly = []
        for q in range(1, 5):
            qd = _get_density_near(
                db, cpdef["lat"], cpdef["lon"], cpdef["radius"],
                cpdef["region_prefix"], y, quarter=q,
            )
            if qd > 0:
                quarterly.append({"quarter": q, "density": round(qd, 2)})

        history.append({
            "year": y,
            "avg_density": round(yearly, 2),
            "quarterly": quarterly,
        })

    return {
        "chokepoint": cpdef["name"],
        "description": cpdef["description"],
        "lat": cpdef["lat"],
        "lon": cpdef["lon"],
        "oil_share_pct": cpdef["oil_share_pct"],
        "lng_share_pct": cpdef["lng_share_pct"],
        "history": history,
    }

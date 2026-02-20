"""
Port Stress Indicator (PSI)
───────────────────────────
Proprietary indicator measuring port congestion relative to regional capacity.

Formula:
  PSI = (throughput / regional_avg_throughput) × density_factor × utilization_score

Components:
  - Throughput Ratio: port's TEU vs regional average (how busy vs peers)
  - Density Factor: nearby shipping density (approach congestion)
  - Utilization Score: throughput vs estimated capacity

Stress Levels:
  PSI < 0.5   → Low       (underutilized)
  0.5 - 1.0   → Normal    (healthy utilization)
  1.0 - 2.0   → Elevated  (approaching capacity)
  2.0 - 3.0   → High      (congested)
  > 3.0       → Critical  (severe bottleneck)
"""
import logging
import math
from typing import Dict, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.port import Port
from app.models.shipping_density import ShippingDensity
from app.models.country import Country

logger = logging.getLogger("gefo.intelligence.port_stress")

# Estimated capacity multipliers by port type
# (actual capacity would come from port authority data)
CAPACITY_MULTIPLIERS = {
    "container": 1.3,       # container ports can exceed nominal capacity
    "bulk": 1.2,
    "oil": 1.1,
    "multipurpose": 1.25,
    "mixed": 1.25,
    None: 1.2,
}

# Regional groupings for peer comparison
REGION_GROUPS = {
    "East Asia": ["CHN", "JPN", "KOR", "TWN", "HKG"],
    "Southeast Asia": ["SGP", "MYS", "THA", "VNM", "IDN", "PHL", "MMR"],
    "South Asia": ["IND", "LKA", "BGD", "PAK"],
    "Middle East": ["ARE", "SAU", "OMN", "QAT", "KWT", "IRQ", "BHR"],
    "North Europe": ["DEU", "NLD", "BEL", "GBR", "FRA", "DNK", "NOR", "SWE", "FIN"],
    "Mediterranean": ["ITA", "ESP", "GRC", "TUR", "EGY", "MAR"],
    "North America": ["USA", "CAN", "MEX"],
    "South America": ["BRA", "ARG", "CHL", "COL", "PER"],
    "Africa": ["NGA", "ZAF", "KEN", "TZA", "GHA", "SEN"],
    "Oceania": ["AUS", "NZL"],
}


def _get_region_for_port(country_iso: str) -> str:
    for region, countries in REGION_GROUPS.items():
        if country_iso in countries:
            return region
    return "Other"


def _nearby_density(db: Session, lat: float, lon: float, year: int, radius_deg: float = 3.0) -> float:
    """
    Average shipping density within radius_deg degrees of the port.
    A rough spatial proximity measure (not geodesic, but fine for analytics).
    """
    result = (
        db.query(func.avg(ShippingDensity.density_value))
        .filter(
            ShippingDensity.year == year,
            ShippingDensity.lat.between(lat - radius_deg, lat + radius_deg),
            ShippingDensity.lon.between(lon - radius_deg, lon + radius_deg),
        )
        .scalar()
    )
    return float(result) if result else 0.0


def compute_port_stress(
    db: Session,
    year: int = 2023,
) -> List[Dict]:
    """
    Compute Port Stress Indicator for all tracked ports.
    """
    logger.info(f"Computing Port Stress Indicators for year {year}")

    ports = db.query(Port).all()
    if not ports:
        return []

    # Group ports by region for peer comparison
    region_ports: Dict[str, List[Port]] = {}
    for p in ports:
        region = _get_region_for_port(p.country_iso)
        region_ports.setdefault(region, []).append(p)

    # Compute regional average throughput
    region_avg_teu: Dict[str, float] = {}
    for region, rports in region_ports.items():
        teus = [p.throughput_teu for p in rports if p.throughput_teu and p.throughput_teu > 0]
        region_avg_teu[region] = (sum(teus) / len(teus)) if teus else 1.0

    # Global average for normalization
    all_teus = [p.throughput_teu for p in ports if p.throughput_teu and p.throughput_teu > 0]
    global_avg_teu = (sum(all_teus) / len(all_teus)) if all_teus else 1.0

    # Global average density for normalization
    global_avg_density = (
        db.query(func.avg(ShippingDensity.density_value))
        .filter(ShippingDensity.year == year)
        .scalar()
    )
    global_avg_density = float(global_avg_density) if global_avg_density else 50.0

    results = []
    for port in ports:
        teu = port.throughput_teu or 0
        region = _get_region_for_port(port.country_iso)
        reg_avg = region_avg_teu.get(region, global_avg_teu)

        # Component 1: Throughput ratio vs regional peers
        throughput_ratio = teu / reg_avg if reg_avg > 0 else 0

        # Component 2: Nearby shipping density factor
        nearby_dens = _nearby_density(db, port.lat, port.lon, year)
        density_factor = nearby_dens / global_avg_density if global_avg_density > 0 else 1.0

        # Component 3: Utilization score (throughput vs estimated capacity)
        cap_mult = CAPACITY_MULTIPLIERS.get(port.port_type, 1.2)
        estimated_capacity = reg_avg * cap_mult * 1.5  # rough capacity estimate
        utilization = teu / estimated_capacity if estimated_capacity > 0 else 0

        # PSI = weighted combination
        psi = (throughput_ratio * 0.4 + density_factor * 0.3 + utilization * 0.3)

        # Stress level classification
        if psi < 0.5:
            stress_level = "low"
        elif psi < 1.0:
            stress_level = "normal"
        elif psi < 2.0:
            stress_level = "elevated"
        elif psi < 3.0:
            stress_level = "high"
        else:
            stress_level = "critical"

        results.append({
            "port_id": port.id,
            "port_name": port.name,
            "country_iso": port.country_iso,
            "lat": port.lat,
            "lon": port.lon,
            "port_type": port.port_type,
            "throughput_teu": teu,
            "region": region,
            "psi": round(psi, 4),
            "stress_level": stress_level,
            "components": {
                "throughput_ratio": round(throughput_ratio, 4),
                "density_factor": round(density_factor, 4),
                "utilization": round(utilization, 4),
            },
            "nearby_density": round(nearby_dens, 2),
            "regional_avg_teu": round(reg_avg, 0),
        })

    results.sort(key=lambda x: x["psi"], reverse=True)
    return results


def compute_port_stress_summary(db: Session, year: int = 2023) -> Dict:
    """Aggregate port stress statistics."""
    scores = compute_port_stress(db, year)
    if not scores:
        return {"total_ports": 0, "by_level": {}}

    by_level = {"low": 0, "normal": 0, "elevated": 0, "high": 0, "critical": 0}
    for s in scores:
        by_level[s["stress_level"]] = by_level.get(s["stress_level"], 0) + 1

    psi_values = [s["psi"] for s in scores]
    return {
        "total_ports": len(scores),
        "mean_psi": round(sum(psi_values) / len(psi_values), 4),
        "max_psi": round(max(psi_values), 4),
        "min_psi": round(min(psi_values), 4),
        "by_level": by_level,
        "most_stressed": scores[:5],
        "least_stressed": scores[-5:],
    }

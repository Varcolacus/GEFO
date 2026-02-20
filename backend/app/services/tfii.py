"""
Trade Flow Intensity Index (TFII)
─────────────────────────────────
Proprietary indicator measuring the relationship between trade value and
shipping lane utilization along corridors.

Formula:
  TFII_corridor = trade_value_usd / regional_shipping_density × normalization_factor

A high TFII means large trade value flows through relatively uncrowded lanes
(efficient or under-monitored). A low TFII means heavy shipping activity
relative to trade value (bulk/commodity-heavy or congested).

Country-level TFII = weighted average across all corridors touching that country.
"""
import logging
import math
from typing import Dict, List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.trade_flow import TradeFlow
from app.models.shipping_density import ShippingDensity
from app.models.country import Country

logger = logging.getLogger("gefo.intelligence.tfii")

# Approximate chokepoint/lane association for corridors
# Maps (region_name prefix) -> list of ISO pairs that typically transit through it
# This is a simplified model — a full version would use actual ship routing
CORRIDOR_LANES = {
    "Strait of Malacca": [
        ("CHN", "IDN"), ("CHN", "MYS"), ("CHN", "SGP"), ("CHN", "IND"),
        ("JPN", "ARE"), ("JPN", "SAU"), ("JPN", "IND"), ("JPN", "SGP"),
        ("KOR", "ARE"), ("KOR", "SAU"), ("KOR", "IND"), ("KOR", "SGP"),
        ("CHN", "ARE"), ("CHN", "SAU"), ("CHN", "NGA"),
        ("AUS", "CHN"), ("AUS", "JPN"), ("AUS", "KOR"),
        ("IDN", "JPN"), ("IDN", "CHN"), ("IDN", "KOR"),
    ],
    "Suez Canal": [
        ("CHN", "DEU"), ("CHN", "FRA"), ("CHN", "GBR"), ("CHN", "ITA"),
        ("CHN", "NLD"), ("CHN", "ESP"), ("CHN", "BEL"),
        ("JPN", "DEU"), ("JPN", "GBR"), ("JPN", "NLD"),
        ("KOR", "DEU"), ("KOR", "GBR"), ("KOR", "NLD"),
        ("IND", "DEU"), ("IND", "GBR"), ("IND", "NLD"),
        ("SAU", "DEU"), ("SAU", "FRA"), ("SAU", "ITA"),
        ("ARE", "DEU"), ("ARE", "GBR"), ("ARE", "ITA"),
    ],
    "Panama Canal": [
        ("CHN", "USA"), ("JPN", "USA"), ("KOR", "USA"),
        ("CHN", "BRA"), ("USA", "CHL"), ("USA", "PER"),
        ("CHN", "COL"), ("CHN", "MEX"),
    ],
    "English Channel": [
        ("DEU", "GBR"), ("FRA", "GBR"), ("NLD", "GBR"),
        ("BEL", "GBR"), ("DEU", "USA"), ("FRA", "USA"),
        ("NLD", "USA"), ("DEU", "CAN"),
    ],
    "Bab el-Mandeb": [
        ("SAU", "CHN"), ("SAU", "IND"), ("SAU", "JPN"), ("SAU", "KOR"),
        ("ARE", "CHN"), ("ARE", "IND"), ("ARE", "JPN"),
        ("ETH", "CHN"), ("KEN", "CHN"), ("TZA", "CHN"),
    ],
    "Strait of Hormuz": [
        ("SAU", "CHN"), ("SAU", "JPN"), ("SAU", "KOR"), ("SAU", "IND"),
        ("ARE", "CHN"), ("ARE", "JPN"), ("ARE", "KOR"), ("ARE", "IND"),
        ("IRQ", "CHN"), ("IRQ", "IND"), ("KWT", "JPN"), ("KWT", "KOR"),
        ("QAT", "JPN"), ("QAT", "KOR"), ("QAT", "CHN"),
    ],
}


def _get_lane_density(db: Session, lane_prefix: str, year: int) -> float:
    """Average shipping density for a given lane region in a given year."""
    result = (
        db.query(func.avg(ShippingDensity.density_value))
        .filter(
            ShippingDensity.region_name.ilike(f"{lane_prefix}%"),
            ShippingDensity.year == year,
        )
        .scalar()
    )
    return float(result) if result else 0.0


def _corridor_uses_lane(exporter: str, importer: str, lane: str) -> bool:
    """Check if a corridor pair likely transits through a given lane."""
    pairs = CORRIDOR_LANES.get(lane, [])
    return (exporter, importer) in pairs or (importer, exporter) in pairs


def compute_corridor_tfii(
    db: Session,
    year: int = 2023,
    top_n: int = 50,
) -> List[Dict]:
    """
    Compute TFII for each bilateral trade corridor.
    Returns list of dicts sorted by TFII descending.
    """
    logger.info(f"Computing corridor TFII for year {year}")

    # Get all trade flows for the year
    flows = (
        db.query(
            TradeFlow.exporter_iso,
            TradeFlow.importer_iso,
            func.sum(TradeFlow.trade_value_usd).label("trade_value"),
        )
        .filter(TradeFlow.year == year)
        .group_by(TradeFlow.exporter_iso, TradeFlow.importer_iso)
        .all()
    )

    # Pre-compute lane densities
    lane_densities = {}
    for lane in CORRIDOR_LANES:
        lane_densities[lane] = _get_lane_density(db, lane, year)

    # Global normalization: median trade value
    all_values = [f.trade_value for f in flows if f.trade_value > 0]
    if not all_values:
        return []
    median_val = sorted(all_values)[len(all_values) // 2]

    results = []
    for flow in flows:
        if flow.trade_value <= 0:
            continue

        # Find which lanes this corridor uses
        corridor_densities = []
        corridor_lanes = []
        for lane, density in lane_densities.items():
            if _corridor_uses_lane(flow.exporter_iso, flow.importer_iso, lane):
                if density > 0:
                    corridor_densities.append(density)
                    corridor_lanes.append(lane)

        if not corridor_densities:
            # Corridor doesn't transit monitored lanes — assign neutral density
            avg_density = 50.0  # neutral baseline
        else:
            avg_density = sum(corridor_densities) / len(corridor_densities)

        # TFII = normalized_trade / density × 100
        normalized_trade = flow.trade_value / median_val
        tfii = (normalized_trade / avg_density) * 100

        results.append({
            "exporter_iso": flow.exporter_iso,
            "importer_iso": flow.importer_iso,
            "trade_value_usd": flow.trade_value,
            "avg_lane_density": round(avg_density, 2),
            "tfii": round(tfii, 4),
            "lanes": corridor_lanes,
            "interpretation": (
                "high-value / low-congestion" if tfii > 5
                else "balanced" if tfii > 1
                else "low-value / high-congestion"
            ),
        })

    results.sort(key=lambda x: x["tfii"], reverse=True)
    return results[:top_n]


def compute_country_tfii(
    db: Session,
    year: int = 2023,
) -> List[Dict]:
    """
    Compute country-level TFII (weighted average of corridor TFIIs).
    """
    logger.info(f"Computing country-level TFII for year {year}")
    corridor_scores = compute_corridor_tfii(db, year, top_n=9999)

    country_data: Dict[str, Dict] = {}
    for c in corridor_scores:
        for role in ["exporter_iso", "importer_iso"]:
            iso = c[role]
            if iso not in country_data:
                country_data[iso] = {"total_value": 0, "weighted_tfii": 0}
            country_data[iso]["total_value"] += c["trade_value_usd"]
            country_data[iso]["weighted_tfii"] += c["tfii"] * c["trade_value_usd"]

    results = []
    for iso, d in country_data.items():
        if d["total_value"] > 0:
            avg_tfii = d["weighted_tfii"] / d["total_value"]
            results.append({
                "iso_code": iso,
                "tfii": round(avg_tfii, 4),
                "total_trade_value": d["total_value"],
                "interpretation": (
                    "high-value / low-congestion" if avg_tfii > 5
                    else "balanced" if avg_tfii > 1
                    else "low-value / high-congestion"
                ),
            })

    results.sort(key=lambda x: x["tfii"], reverse=True)
    return results

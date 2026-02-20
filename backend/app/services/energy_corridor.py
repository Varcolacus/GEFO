"""
Energy Corridor Exposure Index (ECEI)
─────────────────────────────────────
Proprietary indicator measuring a country's trade dependency on energy-sensitive
maritime chokepoints.

For each country, calculates what fraction of total trade transits through
strategic chokepoints that carry significant oil/LNG traffic.

Formula:
  ECEI_country = Σ (trade_through_chokepoint_i / total_trade) × energy_weight_i

Where:
  - trade_through_chokepoint_i = sum of corridors transiting chokepoint i
  - energy_weight_i = (oil_share_pct + lng_share_pct) / 100 for that chokepoint
  - Higher ECEI = more trade depends on energy-sensitive routes

Risk interpretation:
  ECEI < 0.1  → Low exposure
  0.1 - 0.3   → Moderate exposure
  0.3 - 0.5   → High exposure
  > 0.5       → Critical exposure (highly dependent on energy corridors)
"""
import logging
from typing import Dict, List
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.trade_flow import TradeFlow
from app.models.chokepoint import Chokepoint
from app.services.tfii import CORRIDOR_LANES, _corridor_uses_lane

logger = logging.getLogger("gefo.intelligence.energy_corridor")

# Energy weights for chokepoints (% of global oil/LNG that transits)
# Source: EIA, IEA published estimates
ENERGY_WEIGHTS = {
    "Strait of Hormuz": {"oil_share": 21.0, "lng_share": 27.0},
    "Strait of Malacca": {"oil_share": 16.0, "lng_share": 25.0},
    "Suez Canal": {"oil_share": 12.0, "lng_share": 8.0},
    "Bab el-Mandeb": {"oil_share": 9.0, "lng_share": 8.0},
    "Panama Canal": {"oil_share": 1.0, "lng_share": 5.0},
    "English Channel": {"oil_share": 3.0, "lng_share": 2.0},
}


def compute_energy_corridor_exposure(
    db: Session,
    year: int = 2023,
) -> List[Dict]:
    """
    Compute Energy Corridor Exposure Index for each country.
    """
    logger.info(f"Computing Energy Corridor Exposure Index for year {year}")

    # Get all trade flows
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

    # Compute total trade per country
    country_total: Dict[str, float] = {}
    country_chokepoint_exposure: Dict[str, Dict[str, float]] = {}

    for flow in flows:
        for iso in [flow.exporter_iso, flow.importer_iso]:
            country_total.setdefault(iso, 0)
            country_total[iso] += flow.trade_value

        # Check which chokepoints this corridor transits
        for lane_name in CORRIDOR_LANES:
            if _corridor_uses_lane(flow.exporter_iso, flow.importer_iso, lane_name):
                for iso in [flow.exporter_iso, flow.importer_iso]:
                    country_chokepoint_exposure.setdefault(iso, {})
                    country_chokepoint_exposure[iso].setdefault(lane_name, 0)
                    country_chokepoint_exposure[iso][lane_name] += flow.trade_value

    # Compute ECEI per country
    results = []
    for iso, total in country_total.items():
        if total <= 0:
            continue

        ecei = 0.0
        exposure_detail = []
        chokepoint_data = country_chokepoint_exposure.get(iso, {})

        for chokepoint_name, trade_through in chokepoint_data.items():
            weights = ENERGY_WEIGHTS.get(chokepoint_name, {"oil_share": 0, "lng_share": 0})
            energy_weight = (weights["oil_share"] + weights["lng_share"]) / 100.0
            corridor_share = trade_through / total
            contribution = corridor_share * energy_weight

            ecei += contribution
            exposure_detail.append({
                "chokepoint": chokepoint_name,
                "trade_share": round(corridor_share * 100, 2),
                "energy_weight": round(energy_weight, 4),
                "contribution": round(contribution, 6),
            })

        # Risk classification
        if ecei < 0.1:
            risk_level = "low"
        elif ecei < 0.3:
            risk_level = "moderate"
        elif ecei < 0.5:
            risk_level = "high"
        else:
            risk_level = "critical"

        results.append({
            "iso_code": iso,
            "ecei": round(ecei, 6),
            "risk_level": risk_level,
            "total_trade_usd": total,
            "chokepoint_exposure": sorted(
                exposure_detail,
                key=lambda x: x["contribution"],
                reverse=True,
            ),
        })

    results.sort(key=lambda x: x["ecei"], reverse=True)
    return results


def compute_chokepoint_energy_summary(db: Session, year: int = 2023) -> List[Dict]:
    """
    Summary of trade transit through each energy-sensitive chokepoint.
    """
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

    total_global_trade = sum(f.trade_value for f in flows if f.trade_value > 0)
    results = []

    for lane_name, pairs in CORRIDOR_LANES.items():
        trade_through = 0
        corridor_count = 0

        for flow in flows:
            if _corridor_uses_lane(flow.exporter_iso, flow.importer_iso, lane_name):
                trade_through += flow.trade_value
                corridor_count += 1

        weights = ENERGY_WEIGHTS.get(lane_name, {"oil_share": 0, "lng_share": 0})
        global_share = (trade_through / total_global_trade * 100) if total_global_trade > 0 else 0

        results.append({
            "chokepoint": lane_name,
            "trade_transit_usd": trade_through,
            "global_trade_share_pct": round(global_share, 2),
            "corridor_count": corridor_count,
            "oil_share_pct": weights["oil_share"],
            "lng_share_pct": weights["lng_share"],
            "energy_sensitivity": round(
                (weights["oil_share"] + weights["lng_share"]) / 2, 1
            ),
        })

    results.sort(key=lambda x: x["trade_transit_usd"], reverse=True)
    return results

"""
Geopolitical Risk Scoring Service — Phase 6
────────────────────────────────────────────
Computes composite risk scores per country based on:
  1. Sanctions exposure (active sanctions on the country)
  2. Conflict proximity (nearby conflict zones)
  3. Trade dependency (over-reliance on risky corridors)
  4. Chokepoint vulnerability (exposure to stressed chokepoints)
  5. Energy risk (energy corridor exposure index)

Provides supply-chain vulnerability assessment for key trade routes.
"""
import json
import math
import logging
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.country import Country
from app.models.chokepoint import Chokepoint
from app.models.trade_flow import TradeFlow
from app.models.port import Port
from app.models.geopolitical import (
    SanctionedEntity, ConflictZone, CountryRiskScore, SupplyChainRoute,
)
from app.services.energy_corridor import compute_energy_corridor_exposure
from app.services.chokepoint_monitor import monitor_chokepoints

logger = logging.getLogger("gefo.services.risk_scoring")

# ─── Weights for composite score ───
RISK_WEIGHTS = {
    "sanctions": 0.30,
    "conflict": 0.25,
    "trade_dependency": 0.15,
    "chokepoint": 0.15,
    "energy": 0.15,
}

RISK_THRESHOLDS = [
    (80, "critical"),
    (60, "high"),
    (40, "elevated"),
    (20, "moderate"),
    (0, "low"),
]


def _risk_level(score: float) -> str:
    for threshold, level in RISK_THRESHOLDS:
        if score >= threshold:
            return level
    return "low"


# ══════════════════════════════════════════════════════════════════════════
#  COMPONENT SCORERS
# ══════════════════════════════════════════════════════════════════════════

def _sanctions_score(db: Session, iso: str) -> float:
    """Score 0-100 based on active sanctions targeting this country."""
    count = db.query(func.count(SanctionedEntity.id)).filter(
        SanctionedEntity.country_iso == iso,
        SanctionedEntity.is_active == True,  # noqa
    ).scalar() or 0

    # Count by sanctioning body (more bodies = more severe)
    bodies = db.query(func.count(func.distinct(SanctionedEntity.sanctioning_body))).filter(
        SanctionedEntity.country_iso == iso,
        SanctionedEntity.is_active == True,  # noqa
    ).scalar() or 0

    if count == 0:
        return 0.0

    # Base score: logarithmic scaling on entity count (max ~60 from count alone)
    base = min(60, math.log2(count + 1) * 12)
    # Multiplier body bonus: each additional sanctioning body adds up to 10 pts
    body_bonus = min(40, bodies * 10)

    return min(100, base + body_bonus)


def _conflict_score(db: Session, iso: str, country_lat: float, country_lon: float) -> float:
    """Score 0-100 based on proximity to active conflict zones."""
    zones = db.query(ConflictZone).filter(ConflictZone.is_active == True).all()  # noqa
    if not zones:
        return 0.0

    max_impact = 0.0
    for zone in zones:
        # Check if country is in affected list
        affected = []
        if zone.affected_countries:
            try:
                affected = json.loads(zone.affected_countries)
            except (json.JSONDecodeError, TypeError):
                affected = []

        if iso in affected:
            severity_map = {"critical": 90, "high": 70, "moderate": 45, "low": 20}
            impact = severity_map.get(zone.severity, 30)
            max_impact = max(max_impact, impact)
            continue

        # Distance-based falloff
        dist_km = _haversine(country_lat, country_lon, zone.lat, zone.lon)
        if dist_km < zone.radius_km * 3:
            severity_map = {"critical": 80, "high": 60, "moderate": 35, "low": 15}
            base = severity_map.get(zone.severity, 25)
            # Linear falloff within 3x radius
            falloff = max(0, 1 - (dist_km / (zone.radius_km * 3)))
            max_impact = max(max_impact, base * falloff)

    return min(100, max_impact)


def _trade_dependency_score(db: Session, iso: str, year: int) -> float:
    """Score 0-100 based on trade concentration with sanctioned/risky partners."""
    # Get this country's trade partners
    exports = db.query(
        TradeFlow.importer_iso, func.sum(TradeFlow.trade_value_usd)
    ).filter(
        TradeFlow.exporter_iso == iso, TradeFlow.year == year
    ).group_by(TradeFlow.importer_iso).all()

    imports = db.query(
        TradeFlow.exporter_iso, func.sum(TradeFlow.trade_value_usd)
    ).filter(
        TradeFlow.importer_iso == iso, TradeFlow.year == year
    ).group_by(TradeFlow.exporter_iso).all()

    total_trade = sum(v for _, v in exports) + sum(v for _, v in imports)
    if total_trade == 0:
        return 0.0

    # Get sanctioned country ISOs
    sanctioned_isos = set(
        r[0] for r in db.query(func.distinct(SanctionedEntity.country_iso)).filter(
            SanctionedEntity.is_active == True,  # noqa
            SanctionedEntity.country_iso.isnot(None),
        ).all()
    )

    # Calculate trade share with sanctioned countries
    risky_trade = 0.0
    for partner, value in exports + imports:
        if partner in sanctioned_isos:
            risky_trade += value

    risky_share = risky_trade / total_trade
    # Scale: 50% trade with sanctioned partners = score 100
    return min(100, risky_share * 200)


def _chokepoint_vulnerability_score(chokepoint_data: list, iso: str) -> float:
    """Score 0-100 based on exposure to stressed chokepoints."""
    # Use existing chokepoint monitoring data
    stressed = [c for c in chokepoint_data if c.get("stress_level") in ("high", "critical")]
    if not stressed:
        return 0.0

    # Countries near chokepoints are more vulnerable
    # For simplicity, assess based on number of stressed chokepoints * max stress
    max_z = max(abs(c.get("z_score", 0)) for c in stressed) if stressed else 0
    score = min(100, len(stressed) * 15 + max_z * 10)
    return score


def _energy_risk_score(energy_data: list, iso: str) -> float:
    """Score 0-100 based on energy corridor exposure."""
    for entry in energy_data:
        if entry.get("iso_code") == iso:
            ecei = entry.get("ecei", 0)
            # ECEI is typically 0-1, scale to 0-100
            return min(100, ecei * 100)
    return 0.0


# ══════════════════════════════════════════════════════════════════════════
#  MAIN SCORING FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════

def compute_country_risk_scores(db: Session, year: int = 2023) -> list[dict]:
    """Compute risk scores for all countries."""
    countries = db.query(Country).filter(
        Country.centroid_lat.isnot(None),
        Country.centroid_lon.isnot(None),
    ).all()

    # Pre-compute shared data
    try:
        chokepoint_data = monitor_chokepoints(db, year)
    except Exception:
        chokepoint_data = []

    try:
        energy_data = compute_energy_corridor_exposure(db, year)
    except Exception:
        energy_data = []

    results = []
    for country in countries:
        sanctions = _sanctions_score(db, country.iso_code)
        conflict = _conflict_score(db, country.iso_code, country.centroid_lat, country.centroid_lon)
        trade_dep = _trade_dependency_score(db, country.iso_code, year)
        chokepoint = _chokepoint_vulnerability_score(chokepoint_data, country.iso_code)
        energy = _energy_risk_score(energy_data, country.iso_code)

        composite = (
            sanctions * RISK_WEIGHTS["sanctions"] +
            conflict * RISK_WEIGHTS["conflict"] +
            trade_dep * RISK_WEIGHTS["trade_dependency"] +
            chokepoint * RISK_WEIGHTS["chokepoint"] +
            energy * RISK_WEIGHTS["energy"]
        )
        level = _risk_level(composite)

        results.append({
            "iso_code": country.iso_code,
            "name": country.name,
            "lat": country.centroid_lat,
            "lon": country.centroid_lon,
            "scores": {
                "sanctions": round(sanctions, 1),
                "conflict": round(conflict, 1),
                "trade_dependency": round(trade_dep, 1),
                "chokepoint_vulnerability": round(chokepoint, 1),
                "energy_risk": round(energy, 1),
            },
            "composite_risk": round(composite, 1),
            "risk_level": level,
        })

    results.sort(key=lambda x: x["composite_risk"], reverse=True)
    return results


def compute_single_country_risk(db: Session, iso: str, year: int = 2023) -> Optional[dict]:
    """Compute risk score for a single country."""
    country = db.query(Country).filter(Country.iso_code == iso).first()
    if not country:
        return None

    try:
        chokepoint_data = monitor_chokepoints(db, year)
    except Exception:
        chokepoint_data = []

    try:
        energy_data = compute_energy_corridor_exposure(db, year)
    except Exception:
        energy_data = []

    sanctions = _sanctions_score(db, iso)
    conflict = _conflict_score(db, iso, country.centroid_lat or 0, country.centroid_lon or 0)
    trade_dep = _trade_dependency_score(db, iso, year)
    chokepoint = _chokepoint_vulnerability_score(chokepoint_data, iso)
    energy = _energy_risk_score(energy_data, iso)

    composite = (
        sanctions * RISK_WEIGHTS["sanctions"] +
        conflict * RISK_WEIGHTS["conflict"] +
        trade_dep * RISK_WEIGHTS["trade_dependency"] +
        chokepoint * RISK_WEIGHTS["chokepoint"] +
        energy * RISK_WEIGHTS["energy"]
    )

    # Get sanctioned entities for this country
    entities = db.query(SanctionedEntity).filter(
        SanctionedEntity.country_iso == iso,
        SanctionedEntity.is_active == True,  # noqa
    ).all()

    # Get conflict zones affecting this country
    zones = db.query(ConflictZone).filter(ConflictZone.is_active == True).all()  # noqa
    affecting_zones = []
    for z in zones:
        affected = []
        if z.affected_countries:
            try:
                affected = json.loads(z.affected_countries)
            except (json.JSONDecodeError, TypeError):
                pass
        if iso in affected:
            affecting_zones.append({
                "id": z.id, "name": z.name, "zone_type": z.zone_type,
                "severity": z.severity, "lat": z.lat, "lon": z.lon,
                "radius_km": z.radius_km,
            })

    return {
        "iso_code": iso,
        "name": country.name,
        "lat": country.centroid_lat,
        "lon": country.centroid_lon,
        "scores": {
            "sanctions": round(sanctions, 1),
            "conflict": round(conflict, 1),
            "trade_dependency": round(trade_dep, 1),
            "chokepoint_vulnerability": round(chokepoint, 1),
            "energy_risk": round(energy, 1),
        },
        "composite_risk": round(composite, 1),
        "risk_level": _risk_level(composite),
        "sanctions_detail": [{
            "id": e.id, "entity_type": e.entity_type, "name": e.name,
            "sanctioning_body": e.sanctioning_body, "programme": e.programme,
            "date_listed": e.date_listed.isoformat() if e.date_listed else None,
        } for e in entities],
        "conflict_zones": affecting_zones,
    }


def compute_supply_chain_vulnerabilities(db: Session, year: int = 2023) -> list[dict]:
    """Assess vulnerability of registered supply chain routes."""
    routes = db.query(SupplyChainRoute).filter(SupplyChainRoute.is_active == True).all()  # noqa
    if not routes:
        return _generate_default_routes(db, year)

    try:
        chokepoint_data = monitor_chokepoints(db, year)
    except Exception:
        chokepoint_data = []

    results = []
    for route in routes:
        # Score based on chokepoints on route
        transit = []
        if route.chokepoints_transit:
            try:
                transit = json.loads(route.chokepoints_transit)
            except (json.JSONDecodeError, TypeError):
                transit = []

        stressed_on_route = []
        for cp in chokepoint_data:
            if cp["name"] in transit:
                stressed_on_route.append(cp)

        # Origin/destination risk
        origin_sanctions = _sanctions_score(db, route.origin_iso) if route.origin_iso else 0
        dest_sanctions = _sanctions_score(db, route.destination_iso) if route.destination_iso else 0

        # Calculate vulnerability
        chokepoint_risk = sum(
            30 if cp["stress_level"] == "critical" else 20 if cp["stress_level"] == "high" else 5
            for cp in stressed_on_route
        )
        sanctions_risk = max(origin_sanctions, dest_sanctions) * 0.3
        vuln = min(100, chokepoint_risk + sanctions_risk)

        risk_factors = []
        if stressed_on_route:
            risk_factors.append(f"{len(stressed_on_route)} stressed chokepoint(s)")
        if origin_sanctions > 20:
            risk_factors.append("Sanctioned origin")
        if dest_sanctions > 20:
            risk_factors.append("Sanctioned destination")

        results.append({
            "id": route.id,
            "name": route.name,
            "origin_iso": route.origin_iso,
            "destination_iso": route.destination_iso,
            "commodity": route.commodity,
            "annual_value_usd": route.annual_value_usd,
            "chokepoints": transit,
            "vulnerability_score": round(vuln, 1),
            "risk_level": _risk_level(vuln),
            "risk_factors": risk_factors,
            "stressed_chokepoints": [
                {"name": cp["name"], "stress_level": cp["stress_level"], "z_score": cp.get("z_score")}
                for cp in stressed_on_route
            ],
        })

    results.sort(key=lambda x: x["vulnerability_score"], reverse=True)
    return results


def _generate_default_routes(db: Session, year: int) -> list[dict]:
    """Generate supply chain routes from top trade flows & chokepoints when no routes exist."""
    from app.services.tfii import CORRIDOR_LANES

    try:
        chokepoint_data = monitor_chokepoints(db, year)
    except Exception:
        chokepoint_data = []

    # Pre-defined critical supply chains
    DEFAULT_ROUTES = [
        {"name": "Middle East → East Asia Oil", "origin": "SAU", "dest": "CHN", "commodity": "Oil",
         "chokepoints": ["Strait of Hormuz", "Strait of Malacca"], "value": 87e9},
        {"name": "Middle East → Europe Oil", "origin": "SAU", "dest": "DEU", "commodity": "Oil",
         "chokepoints": ["Strait of Hormuz", "Suez Canal"], "value": 45e9},
        {"name": "East Asia → North America Electronics", "origin": "CHN", "dest": "USA", "commodity": "Electronics",
         "chokepoints": ["Strait of Malacca", "Panama Canal"], "value": 200e9},
        {"name": "Australia → China Iron Ore", "origin": "AUS", "dest": "CHN", "commodity": "Iron Ore",
         "chokepoints": ["Strait of Malacca"], "value": 145e9},
        {"name": "Russia → Europe Natural Gas", "origin": "RUS", "dest": "DEU", "commodity": "Natural Gas",
         "chokepoints": ["Turkish Straits"], "value": 40e9},
        {"name": "Black Sea → Mediterranean Grain", "origin": "UKR", "dest": "EGY", "commodity": "Grain",
         "chokepoints": ["Turkish Straits", "Suez Canal"], "value": 12e9},
        {"name": "Brazil → China Soybeans", "origin": "BRA", "dest": "CHN", "commodity": "Soybeans",
         "chokepoints": ["Cape of Good Hope"], "value": 35e9},
        {"name": "West Africa → Europe Oil", "origin": "NGA", "dest": "GBR", "commodity": "Oil",
         "chokepoints": ["Strait of Gibraltar"], "value": 15e9},
        {"name": "Southeast Asia → World Semiconductors", "origin": "KOR", "dest": "USA", "commodity": "Semiconductors",
         "chokepoints": ["Strait of Malacca", "Panama Canal"], "value": 80e9},
        {"name": "Norway → Europe Energy", "origin": "NOR", "dest": "GBR", "commodity": "Oil & Gas",
         "chokepoints": [], "value": 56e9},
    ]

    results = []
    for r in DEFAULT_ROUTES:
        stressed = [cp for cp in chokepoint_data if cp["name"] in r["chokepoints"]]
        chokepoint_risk = sum(
            30 if cp["stress_level"] == "critical" else 20 if cp["stress_level"] == "high" else 5
            for cp in stressed
        )
        origin_sanctions = _sanctions_score(db, r["origin"]) if r["origin"] else 0
        dest_sanctions = _sanctions_score(db, r["dest"]) if r["dest"] else 0
        sanctions_risk = max(origin_sanctions, dest_sanctions) * 0.3
        vuln = min(100, chokepoint_risk + sanctions_risk)

        risk_factors = []
        if stressed:
            risk_factors.append(f"{len(stressed)} stressed chokepoint(s)")
        if origin_sanctions > 20:
            risk_factors.append("Sanctioned origin")
        if dest_sanctions > 20:
            risk_factors.append("Sanctioned destination")

        results.append({
            "id": None,
            "name": r["name"],
            "origin_iso": r["origin"],
            "destination_iso": r["dest"],
            "commodity": r["commodity"],
            "annual_value_usd": r["value"],
            "chokepoints": r["chokepoints"],
            "vulnerability_score": round(vuln, 1),
            "risk_level": _risk_level(vuln),
            "risk_factors": risk_factors,
            "stressed_chokepoints": [
                {"name": cp["name"], "stress_level": cp["stress_level"], "z_score": cp.get("z_score")}
                for cp in stressed
            ],
        })

    results.sort(key=lambda x: x["vulnerability_score"], reverse=True)
    return results


def get_sanctions_summary(db: Session) -> dict:
    """Get overview of all active sanctions."""
    total = db.query(func.count(SanctionedEntity.id)).filter(
        SanctionedEntity.is_active == True  # noqa
    ).scalar() or 0

    by_body = dict(
        db.query(SanctionedEntity.sanctioning_body, func.count(SanctionedEntity.id)).filter(
            SanctionedEntity.is_active == True  # noqa
        ).group_by(SanctionedEntity.sanctioning_body).all()
    )

    by_type = dict(
        db.query(SanctionedEntity.entity_type, func.count(SanctionedEntity.id)).filter(
            SanctionedEntity.is_active == True  # noqa
        ).group_by(SanctionedEntity.entity_type).all()
    )

    # Countries with most sanctions
    top_countries = db.query(
        SanctionedEntity.country_iso, func.count(SanctionedEntity.id).label("cnt")
    ).filter(
        SanctionedEntity.is_active == True,  # noqa
        SanctionedEntity.country_iso.isnot(None),
    ).group_by(SanctionedEntity.country_iso).order_by(func.count(SanctionedEntity.id).desc()).limit(15).all()

    return {
        "total_active": total,
        "by_sanctioning_body": by_body,
        "by_entity_type": by_type,
        "most_sanctioned_countries": [
            {"iso_code": iso, "count": cnt} for iso, cnt in top_countries
        ],
    }


def get_conflict_zones_summary(db: Session) -> list[dict]:
    """Get all active conflict zones."""
    zones = db.query(ConflictZone).filter(ConflictZone.is_active == True).order_by(  # noqa
        ConflictZone.severity.desc()
    ).all()

    return [{
        "id": z.id,
        "name": z.name,
        "zone_type": z.zone_type,
        "severity": z.severity,
        "lat": z.lat,
        "lon": z.lon,
        "radius_km": z.radius_km,
        "affected_countries": json.loads(z.affected_countries) if z.affected_countries else [],
        "affected_chokepoints": json.loads(z.affected_chokepoints) if z.affected_chokepoints else [],
        "description": z.description,
        "start_date": z.start_date.isoformat() if z.start_date else None,
        "is_active": z.is_active,
    } for z in zones]


# ─── Haversine helper ───

def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance in km between two points on Earth."""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

"""
Geopolitical Risk & Sanctions API — Phase 6
────────────────────────────────────────────
Endpoints:
  GET  /api/geopolitical/risk-scores              Country risk rankings
  GET  /api/geopolitical/risk-scores/{iso}        Single country risk detail
  GET  /api/geopolitical/sanctions                Sanctions summary
  GET  /api/geopolitical/sanctions/entities        List sanctioned entities
  POST /api/geopolitical/sanctions/entities        Add sanctioned entity (admin)
  GET  /api/geopolitical/conflict-zones           Active conflict zones
  POST /api/geopolitical/conflict-zones           Add conflict zone (admin)
  GET  /api/geopolitical/supply-chains            Supply chain vulnerability
  GET  /api/geopolitical/dashboard                Combined geopolitical dashboard
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
import logging

from app.core.database import get_db
from app.core.security import get_admin_user
from app.models.user import User
from app.models.geopolitical import SanctionedEntity, ConflictZone
from app.schemas.geopolitical import (
    SanctionedEntityCreate, SanctionedEntityResponse,
    ConflictZoneCreate, ConflictZoneResponse,
)
from app.services.risk_scoring import (
    compute_country_risk_scores,
    compute_single_country_risk,
    compute_supply_chain_vulnerabilities,
    get_sanctions_summary,
    get_conflict_zones_summary,
)

logger = logging.getLogger("gefo.api.geopolitical")
router = APIRouter(prefix="/api/geopolitical", tags=["Geopolitical Risk"])


# ══════════════════════════════════════════════════════════════════════════
#  RISK SCORES
# ══════════════════════════════════════════════════════════════════════════

@router.get("/risk-scores")
def risk_scores(
    year: int = Query(2023, description="Reference year"),
    top_n: int = Query(50, le=300),
    db: Session = Depends(get_db),
):
    """Country-level composite geopolitical risk scores."""
    logger.info(f"GET /geopolitical/risk-scores year={year} top_n={top_n}")
    results = compute_country_risk_scores(db, year)
    return {
        "indicator": "Geopolitical Risk Score",
        "year": year,
        "count": min(top_n, len(results)),
        "countries": results[:top_n],
    }


@router.get("/risk-scores/{iso_code}")
def risk_score_detail(
    iso_code: str,
    year: int = Query(2023),
    db: Session = Depends(get_db),
):
    """Detailed risk breakdown for a single country."""
    result = compute_single_country_risk(db, iso_code.upper(), year)
    if not result:
        raise HTTPException(404, f"Country {iso_code} not found")
    return result


# ══════════════════════════════════════════════════════════════════════════
#  SANCTIONS
# ══════════════════════════════════════════════════════════════════════════

@router.get("/sanctions")
def sanctions_overview(db: Session = Depends(get_db)):
    """Overview of active sanctions across all programmes."""
    return get_sanctions_summary(db)


@router.get("/sanctions/entities", response_model=list[SanctionedEntityResponse])
def list_sanctions(
    country_iso: Optional[str] = None,
    body: Optional[str] = None,
    entity_type: Optional[str] = None,
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """List sanctioned entities with filters."""
    q = db.query(SanctionedEntity).filter(SanctionedEntity.is_active == True)  # noqa
    if country_iso:
        q = q.filter(SanctionedEntity.country_iso == country_iso.upper())
    if body:
        q = q.filter(SanctionedEntity.sanctioning_body == body)
    if entity_type:
        q = q.filter(SanctionedEntity.entity_type == entity_type)
    return q.order_by(SanctionedEntity.date_listed.desc().nullslast()).offset(offset).limit(limit).all()


@router.post("/sanctions/entities", response_model=SanctionedEntityResponse, status_code=201)
def create_sanction(
    body: SanctionedEntityCreate,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Add a sanctioned entity (admin only)."""
    entity = SanctionedEntity(
        entity_type=body.entity_type,
        name=body.name,
        country_iso=body.country_iso.upper() if body.country_iso else None,
        sanctioning_body=body.sanctioning_body,
        programme=body.programme,
        reason=body.reason,
        date_listed=body.date_listed,
        identifiers=body.identifiers,
    )
    db.add(entity)
    db.commit()
    db.refresh(entity)
    logger.info(f"Sanction created: {entity.name} by {entity.sanctioning_body}")
    return entity


@router.delete("/sanctions/entities/{entity_id}", status_code=204)
def remove_sanction(
    entity_id: int,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Deactivate a sanctioned entity (admin only)."""
    entity = db.query(SanctionedEntity).filter(SanctionedEntity.id == entity_id).first()
    if not entity:
        raise HTTPException(404, "Sanctioned entity not found")
    entity.is_active = False
    from datetime import datetime
    entity.date_delisted = datetime.utcnow()
    db.commit()


# ══════════════════════════════════════════════════════════════════════════
#  CONFLICT ZONES
# ══════════════════════════════════════════════════════════════════════════

@router.get("/conflict-zones")
def list_conflict_zones(db: Session = Depends(get_db)):
    """List all active conflict zones."""
    return get_conflict_zones_summary(db)


@router.post("/conflict-zones", response_model=ConflictZoneResponse, status_code=201)
def create_conflict_zone(
    zone: ConflictZoneCreate,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Add a conflict zone (admin only)."""
    cz = ConflictZone(
        name=zone.name,
        zone_type=zone.zone_type,
        severity=zone.severity,
        lat=zone.lat,
        lon=zone.lon,
        radius_km=zone.radius_km,
        affected_countries=zone.affected_countries,
        affected_chokepoints=zone.affected_chokepoints,
        description=zone.description,
        start_date=zone.start_date,
        source=zone.source,
    )
    db.add(cz)
    db.commit()
    db.refresh(cz)
    logger.info(f"Conflict zone created: {cz.name} ({cz.severity})")
    return cz


@router.delete("/conflict-zones/{zone_id}", status_code=204)
def deactivate_conflict_zone(
    zone_id: int,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Deactivate a conflict zone (admin only)."""
    zone = db.query(ConflictZone).filter(ConflictZone.id == zone_id).first()
    if not zone:
        raise HTTPException(404, "Conflict zone not found")
    zone.is_active = False
    from datetime import datetime
    zone.end_date = datetime.utcnow()
    db.commit()


# ══════════════════════════════════════════════════════════════════════════
#  SUPPLY CHAIN VULNERABILITY
# ══════════════════════════════════════════════════════════════════════════

@router.get("/supply-chains")
def supply_chain_vulnerability(
    year: int = Query(2023),
    db: Session = Depends(get_db),
):
    """Supply chain route vulnerability assessment."""
    logger.info(f"GET /geopolitical/supply-chains year={year}")
    results = compute_supply_chain_vulnerabilities(db, year)
    return {
        "indicator": "Supply Chain Vulnerability",
        "year": year,
        "count": len(results),
        "routes": results,
    }


# ══════════════════════════════════════════════════════════════════════════
#  COMBINED DASHBOARD
# ══════════════════════════════════════════════════════════════════════════

@router.get("/dashboard")
def geopolitical_dashboard(
    year: int = Query(2023),
    db: Session = Depends(get_db),
):
    """Combined geopolitical risk dashboard."""
    logger.info(f"GET /geopolitical/dashboard year={year}")

    risk_scores = compute_country_risk_scores(db, year)
    high_risk = [r for r in risk_scores if r["risk_level"] in ("high", "critical")]
    elevated = [r for r in risk_scores if r["risk_level"] == "elevated"]

    sanctions = get_sanctions_summary(db)
    conflicts = get_conflict_zones_summary(db)
    supply_chains = compute_supply_chain_vulnerabilities(db, year)
    vulnerable_routes = [r for r in supply_chains if r["vulnerability_score"] >= 40]

    return {
        "year": year,
        "risk_overview": {
            "total_countries_scored": len(risk_scores),
            "high_risk_count": len(high_risk),
            "elevated_count": len(elevated),
            "highest_risk": risk_scores[:10] if risk_scores else [],
        },
        "sanctions": sanctions,
        "conflict_zones": {
            "active_count": len(conflicts),
            "by_severity": {
                s: len([z for z in conflicts if z["severity"] == s])
                for s in ["critical", "high", "moderate", "low"]
            },
            "zones": conflicts,
        },
        "supply_chain": {
            "routes_assessed": len(supply_chains),
            "vulnerable_count": len(vulnerable_routes),
            "most_vulnerable": supply_chains[:5],
        },
    }

"""
API routes for economic groups (G7, G20, BRICS, EU, OPEC, ASEAN, etc.).
Phase 11 — Globe merge.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.data_source import EconomicGroup, CountryGroupMembership
from app.models.country import Country

router = APIRouter(prefix="/api/economic-groups", tags=["Economic Groups"])


@router.get("/")
def list_groups(
    category: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """List all economic/political groups."""
    q = db.query(EconomicGroup)
    if category:
        q = q.filter(EconomicGroup.category == category)
    groups = q.order_by(EconomicGroup.code).all()
    return {
        "count": len(groups),
        "groups": [
            {
                "code": g.code,
                "name": g.name,
                "category": g.category,
                "member_count": g.member_count,
            }
            for g in groups
        ],
    }


@router.get("/{code}")
def get_group(code: str, db: Session = Depends(get_db)):
    """Get a specific economic group with its member countries."""
    grp = db.query(EconomicGroup).filter(EconomicGroup.code == code.upper()).first()
    if not grp:
        raise HTTPException(404, f"Group '{code}' not found")

    memberships = (
        db.query(CountryGroupMembership)
        .filter(CountryGroupMembership.group_code == code.upper())
        .all()
    )
    member_isos = [m.country_iso for m in memberships]

    # Fetch country details
    countries = (
        db.query(Country)
        .filter(Country.iso_code.in_(member_isos))
        .order_by(Country.name)
        .all()
    )

    return {
        "code": grp.code,
        "name": grp.name,
        "category": grp.category,
        "member_count": grp.member_count,
        "members": [
            {
                "iso_code": c.iso_code,
                "name": c.name,
                "flag_emoji": c.flag_emoji,
                "capital": c.capital,
                "income_group": c.income_group,
                "centroid_lat": c.centroid_lat,
                "centroid_lon": c.centroid_lon,
            }
            for c in countries
        ],
    }


@router.get("/by-country/{country_iso}")
def get_groups_for_country(country_iso: str, db: Session = Depends(get_db)):
    """Get all economic groups a country belongs to."""
    memberships = (
        db.query(CountryGroupMembership)
        .filter(CountryGroupMembership.country_iso == country_iso.upper())
        .all()
    )
    if not memberships:
        return {"country_iso": country_iso.upper(), "groups": []}

    group_codes = [m.group_code for m in memberships]
    groups = (
        db.query(EconomicGroup)
        .filter(EconomicGroup.code.in_(group_codes))
        .order_by(EconomicGroup.code)
        .all()
    )

    return {
        "country_iso": country_iso.upper(),
        "groups": [
            {
                "code": g.code,
                "name": g.name,
                "category": g.category,
                "member_count": g.member_count,
            }
            for g in groups
        ],
    }

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional, List
from pydantic import BaseModel

from app.core.database import get_db
from app.models.rail_freight import RailFreight
from app.models.country import Country

router = APIRouter(prefix="/api/rail_freight", tags=["Rail Freight"])


class RailFreightFlow(BaseModel):
    origin_iso: str
    destination_iso: str
    origin_name: str = ""
    destination_name: str = ""
    origin_lat: Optional[float] = None
    origin_lon: Optional[float] = None
    dest_lat: Optional[float] = None
    dest_lon: Optional[float] = None
    year: int
    tonnes: float


@router.get("/", response_model=List[RailFreightFlow])
def get_rail_freight(
    year: int = Query(2022, description="Year"),
    min_tonnes: float = Query(100, description="Minimum thousand tonnes to include"),
    db: Session = Depends(get_db),
):
    """Get bilateral rail freight flows for a given year."""
    # Build country lookup
    countries = {c.iso_code: c for c in db.query(Country).all()}

    flows = (
        db.query(RailFreight)
        .filter(RailFreight.year == year, RailFreight.tonnes >= min_tonnes)
        .order_by(RailFreight.tonnes.desc())
        .all()
    )

    results = []
    for f in flows:
        oc = countries.get(f.origin_iso)
        dc = countries.get(f.destination_iso)
        if not oc or not dc:
            continue
        results.append(RailFreightFlow(
            origin_iso=f.origin_iso,
            destination_iso=f.destination_iso,
            origin_name=oc.name,
            destination_name=dc.name,
            origin_lat=oc.centroid_lat,
            origin_lon=oc.centroid_lon,
            dest_lat=dc.centroid_lat,
            dest_lon=dc.centroid_lon,
            year=f.year,
            tonnes=f.tonnes,
        ))

    return results


@router.get("/years")
def get_rail_freight_years(db: Session = Depends(get_db)):
    """Get available years for rail freight data."""
    rows = (
        db.query(RailFreight.year)
        .distinct()
        .order_by(RailFreight.year)
        .all()
    )
    return [r.year for r in rows]

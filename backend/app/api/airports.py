from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional, List
import logging

from app.core.database import get_db

logger = logging.getLogger("gefo.api.airports")
from app.models.airport import Airport
from app.schemas.schemas import AirportResponse

router = APIRouter(prefix="/api/airports", tags=["Airports"])


@router.get("/", response_model=List[AirportResponse])
def get_airports(
    country: Optional[str] = Query(None, description="Filter by country ISO code"),
    airport_type: Optional[str] = Query(None, description="Filter by type (large_airport, medium_airport, small_airport)"),
    continent: Optional[str] = Query(None, description="Filter by continent (AF, AN, AS, EU, NA, OC, SA)"),
    min_pax: Optional[float] = Query(None, description="Minimum annual passengers (millions)"),
    limit: int = Query(500, le=5000, description="Max results"),
    db: Session = Depends(get_db),
):
    """Get airport locations with passenger data."""
    query = db.query(Airport)

    if country:
        query = query.filter(Airport.country_iso == country.upper())
    if airport_type:
        query = query.filter(Airport.airport_type == airport_type)
    if continent:
        query = query.filter(Airport.continent == continent.upper())
    if min_pax is not None:
        query = query.filter(Airport.pax_annual >= min_pax)

    airports = query.order_by(Airport.pax_annual.desc().nullslast()).limit(limit).all()
    logger.info(f"Airports fetched: {len(airports)} (country={country}, type={airport_type})")
    return airports


@router.get("/{airport_id}", response_model=AirportResponse)
def get_airport(airport_id: int, db: Session = Depends(get_db)):
    """Get a single airport by ID."""
    airport = db.query(Airport).filter(Airport.id == airport_id).first()
    if not airport:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Airport {airport_id} not found")
    return airport

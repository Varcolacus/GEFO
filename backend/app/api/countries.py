from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional, List

from app.core.database import get_db
from app.models.country import Country
from app.schemas.schemas import CountryMacro

router = APIRouter(prefix="/api/countries", tags=["Countries"])


@router.get("/", response_model=List[CountryMacro])
def get_countries(
    region: Optional[str] = Query(None, description="Filter by region"),
    db: Session = Depends(get_db),
):
    """Get all countries with macro indicators."""
    query = db.query(Country)
    if region:
        query = query.filter(Country.region == region)
    countries = query.all()
    return countries


@router.get("/geojson")
def get_countries_geojson(
    indicator: str = Query("gdp", description="Indicator for coloring: gdp, trade_balance, current_account, export_value"),
    db: Session = Depends(get_db),
):
    """Get countries as GeoJSON with selected indicator for choropleth."""
    countries = db.query(Country).filter(Country.geometry.isnot(None)).all()

    features = []
    for c in countries:
        feature = {
            "type": "Feature",
            "properties": {
                "iso_code": c.iso_code,
                "name": c.name,
                "region": c.region,
                "value": getattr(c, indicator, None),
                "indicator": indicator,
                "gdp": c.gdp,
                "trade_balance": c.trade_balance,
                "current_account": c.current_account,
                "export_value": c.export_value,
                "import_value": c.import_value,
                "population": c.population,
            },
            "geometry": None,  # Will be populated from PostGIS
        }
        features.append(feature)

    return {
        "type": "FeatureCollection",
        "features": features,
    }


@router.get("/{iso_code}", response_model=CountryMacro)
def get_country(iso_code: str, db: Session = Depends(get_db)):
    """Get a single country by ISO code."""
    country = db.query(Country).filter(Country.iso_code == iso_code.upper()).first()
    if not country:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Country {iso_code} not found")
    return country

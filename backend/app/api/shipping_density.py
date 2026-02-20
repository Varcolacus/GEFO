from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional, List

from app.core.database import get_db
from app.models.shipping_density import ShippingDensity
from app.schemas.schemas import ShippingDensityResponse, ShippingDensityGrid

router = APIRouter(prefix="/api/shipping_density", tags=["Shipping Density"])


@router.get("/", response_model=ShippingDensityGrid)
def get_shipping_density(
    year: int = Query(..., description="Year"),
    month: Optional[int] = Query(None, description="Month (1-12)"),
    vessel_type: Optional[str] = Query(None, description="Vessel type filter"),
    db: Session = Depends(get_db),
):
    """Get shipping density grid data for heatmap visualization."""
    query = db.query(ShippingDensity).filter(ShippingDensity.year == year)

    if month:
        query = query.filter(ShippingDensity.month == month)
    if vessel_type:
        query = query.filter(ShippingDensity.vessel_type == vessel_type)

    data = query.all()

    if not data:
        return ShippingDensityGrid(data=[], min_density=0, max_density=0)

    density_values = [d.density_value for d in data]
    return ShippingDensityGrid(
        data=[ShippingDensityResponse(
            lat=d.lat,
            lon=d.lon,
            density_value=d.density_value,
            year=d.year,
            month=d.month,
            vessel_type=d.vessel_type,
        ) for d in data],
        min_density=min(density_values),
        max_density=max(density_values),
    )

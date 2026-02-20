from fastapi import APIRouter
from typing import List

from app.schemas.schemas import IndicatorResponse

router = APIRouter(prefix="/api/indicators", tags=["Indicators"])


@router.get("/", response_model=List[IndicatorResponse])
def get_indicators():
    """Get available analytical indicators (Phase 2 - placeholder)."""
    return [
        IndicatorResponse(
            name="Trade Flow Intensity Index",
            description="Shipping density vs export value correlation",
            value=0.0,
            unit="index",
            reference_period="Coming in Phase 2",
            metadata={"status": "planned"},
        ),
        IndicatorResponse(
            name="Port Stress Indicator",
            description="Deviation from historical shipping averages",
            value=0.0,
            unit="z-score",
            reference_period="Coming in Phase 2",
            metadata={"status": "planned"},
        ),
        IndicatorResponse(
            name="Energy Corridor Exposure Index",
            description="Oil/gas flow concentration across chokepoints",
            value=0.0,
            unit="index",
            reference_period="Coming in Phase 2",
            metadata={"status": "planned"},
        ),
    ]

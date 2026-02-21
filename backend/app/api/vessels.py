"""
Vessel tracking API endpoints.

GET /api/vessels/          — current vessel positions snapshot
GET /api/vessels/stats     — tracker statistics
"""

from fastapi import APIRouter
from typing import List

from app.services.vessel_tracker import vessel_tracker

router = APIRouter(prefix="/api/vessels", tags=["Vessels"])


@router.get("/")
def get_vessels():
    """Get current snapshot of all tracked vessels."""
    vessels = vessel_tracker.get_vessels()
    return {
        "mode": "live" if vessel_tracker.is_live else "simulation",
        "count": len(vessels),
        "vessels": vessels,
    }


@router.get("/stats")
def get_vessel_stats():
    """Get vessel tracker statistics."""
    return vessel_tracker.get_stats()

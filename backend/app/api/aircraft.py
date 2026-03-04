"""
Aircraft tracking API endpoints.

GET /api/aircraft/          — current aircraft positions snapshot
GET /api/aircraft/stats     — tracker statistics
"""

from fastapi import APIRouter

from app.services.aircraft_tracker import aircraft_tracker

router = APIRouter(prefix="/api/aircraft", tags=["Aircraft"])


@router.get("/")
def get_aircraft():
    """Get current snapshot of all tracked aircraft (airborne only)."""
    aircraft = aircraft_tracker.get_aircraft()
    return {
        "source": "opensky",
        "count": len(aircraft),
        "aircraft": aircraft,
    }


@router.get("/stats")
def get_aircraft_stats():
    """Get aircraft tracker statistics."""
    return aircraft_tracker.get_stats()

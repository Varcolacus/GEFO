"""
Advanced Analytics & Forecasting API — Phase 8
───────────────────────────────────────────────
Endpoints:
  GET  /api/analytics/dashboard        Full analytics dashboard
  GET  /api/analytics/global-trend     Global trade trend + forecast
  GET  /api/analytics/yoy-growth       YoY growth ranking
  GET  /api/analytics/top-movers       Top gainers / losers
  GET  /api/analytics/country/{iso}    Country analytics (trend + forecast + anomalies)
"""

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
import logging

from app.core.database import get_db
from app.services.analytics import (
    analytics_dashboard,
    global_trade_trend,
    compute_yoy_growth,
    top_trade_movers,
    country_trade_analytics,
)

logger = logging.getLogger("gefo.api.analytics")
router = APIRouter(prefix="/api/analytics", tags=["analytics"])


# ── Dashboard ─────────────────────────────────────────────────────

@router.get("/dashboard")
def get_analytics_dashboard(
    year: int = Query(2023, ge=1900, le=2100),
    db: Session = Depends(get_db),
):
    """Full analytics dashboard: global trend, top movers, anomaly summary."""
    try:
        return analytics_dashboard(db, year)
    except Exception as e:
        logger.error("Dashboard error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ── Global Trend ──────────────────────────────────────────────────

@router.get("/global-trend")
def get_global_trend(db: Session = Depends(get_db)):
    """Global aggregate trade trend with forecast."""
    try:
        return global_trade_trend(db)
    except Exception as e:
        logger.error("Global trend error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ── YoY Growth ────────────────────────────────────────────────────

@router.get("/yoy-growth")
def get_yoy_growth(
    year: int = Query(2023, ge=1900, le=2100),
    limit: int = Query(30, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Year-over-year trade growth ranking by country."""
    try:
        return compute_yoy_growth(db, year, limit)
    except Exception as e:
        logger.error("YoY growth error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ── Top Movers ────────────────────────────────────────────────────

@router.get("/top-movers")
def get_top_movers(
    year: int = Query(2023, ge=1900, le=2100),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """Top gainers and losers by trade value change."""
    try:
        return top_trade_movers(db, year, limit)
    except Exception as e:
        logger.error("Top movers error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ── Country Analytics ─────────────────────────────────────────────

@router.get("/country/{iso_code}")
def get_country_analytics(
    iso_code: str,
    direction: str = Query("export", regex="^(export|import|total)$"),
    horizon: int = Query(3, ge=1, le=10),
    db: Session = Depends(get_db),
):
    """
    Full analytics for a single country: trend, forecast, anomalies, summary.
    """
    iso = iso_code.upper()
    try:
        result = country_trade_analytics(db, iso, direction, horizon)
        if result.get("error"):
            raise HTTPException(status_code=404, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Country analytics error for %s: %s", iso, e)
        raise HTTPException(status_code=500, detail=str(e))

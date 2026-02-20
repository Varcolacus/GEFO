"""
Commodity & Supply Chain API — Phase 10
───────────────────────────────────────
Endpoints:
  GET  /api/commodities/                     List commodities
  GET  /api/commodities/categories           Category listing
  GET  /api/commodities/dashboard            Price dashboard overview
  GET  /api/commodities/{id}/prices          Price history for commodity
  GET  /api/commodities/{id}/correlation     Price-trade correlation
  GET  /api/commodities/trade/{code}         Trade flows by commodity code
  GET  /api/commodities/flows/{code}         Flow graph for globe overlay
  GET  /api/commodities/overview             Global commodity overview
  GET  /api/commodities/country/{iso}        Country commodity profile
  GET  /api/commodities/supply-risk          Supply risk matrix
  GET  /api/commodities/dependencies         Supply dependencies
"""

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
import logging

from app.core.database import get_db
from app.services.commodity import (
    get_commodities,
    get_commodity_categories,
    get_price_history,
    commodity_price_dashboard,
    trade_by_commodity,
    get_supply_dependencies,
    supply_risk_matrix,
    price_trade_correlation,
)
from app.services.supply_chain import (
    commodity_flow_graph,
    country_commodity_profile,
    global_commodity_overview,
)

logger = logging.getLogger("gefo.api.commodities")
router = APIRouter(prefix="/api/commodities", tags=["commodities"])


# ── List Commodities ──────────────────────────────────────────────

@router.get("/")
def list_commodities(
    category: Optional[str] = Query(None),
    strategic_only: bool = Query(False),
    db: Session = Depends(get_db),
):
    """List all tracked commodities."""
    return get_commodities(db, category=category, strategic_only=strategic_only)


@router.get("/categories")
def list_categories(db: Session = Depends(get_db)):
    """Get commodity categories with counts."""
    return get_commodity_categories(db)


# ── Price Dashboard ───────────────────────────────────────────────

@router.get("/dashboard")
def get_dashboard(
    year: int = Query(2023, ge=1900, le=2100),
    db: Session = Depends(get_db),
):
    """Commodity price dashboard: latest prices, movers, categories."""
    try:
        return commodity_price_dashboard(db, year)
    except Exception as e:
        logger.error("Commodity dashboard error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ── Price History ─────────────────────────────────────────────────

@router.get("/{commodity_id}/prices")
def get_prices(
    commodity_id: int,
    start_year: int = Query(2018, ge=1900),
    end_year: int = Query(2023, le=2100),
    db: Session = Depends(get_db),
):
    """Monthly price history for a commodity."""
    result = get_price_history(db, commodity_id, start_year, end_year)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


# ── Price-Trade Correlation ───────────────────────────────────────

@router.get("/{commodity_id}/correlation")
def get_correlation(
    commodity_id: int,
    start_year: int = Query(2018, ge=1900),
    end_year: int = Query(2023, le=2100),
    db: Session = Depends(get_db),
):
    """Price vs trade volume correlation analysis."""
    result = price_trade_correlation(db, commodity_id, start_year, end_year)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


# ── Trade by Commodity ────────────────────────────────────────────

@router.get("/trade/{commodity_code}")
def get_trade_by_commodity(
    commodity_code: str,
    year: int = Query(2023, ge=1900, le=2100),
    top_n: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Top trade flows for a specific commodity code."""
    return trade_by_commodity(db, commodity_code, year, top_n)


# ── Flow Graph for Globe ─────────────────────────────────────────

@router.get("/flows/{commodity_code}")
def get_flow_graph(
    commodity_code: str,
    year: int = Query(2023, ge=1900, le=2100),
    top_n: int = Query(15, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """Commodity flow graph with coordinates for globe overlay."""
    return commodity_flow_graph(db, commodity_code, year, top_n)


# ── Global Overview ───────────────────────────────────────────────

@router.get("/overview")
def get_overview(
    year: int = Query(2023, ge=1900, le=2100),
    db: Session = Depends(get_db),
):
    """Global commodity trade overview: top commodities by value."""
    return global_commodity_overview(db, year)


# ── Country Profile ──────────────────────────────────────────────

@router.get("/country/{country_iso}")
def get_country_profile(
    country_iso: str,
    year: int = Query(2023, ge=1900, le=2100),
    db: Session = Depends(get_db),
):
    """Country commodity profile: top exports/imports and dependencies."""
    result = country_commodity_profile(db, country_iso, year)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


# ── Supply Risk Matrix ────────────────────────────────────────────

@router.get("/supply-risk")
def get_supply_risk(
    year: int = Query(2023, ge=1900, le=2100),
    db: Session = Depends(get_db),
):
    """Supply risk matrix for strategic commodities."""
    try:
        return supply_risk_matrix(db, year)
    except Exception as e:
        logger.error("Supply risk error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ── Supply Dependencies ──────────────────────────────────────────

@router.get("/dependencies")
def get_dependencies(
    country_iso: Optional[str] = Query(None),
    commodity_id: Optional[int] = Query(None),
    year: int = Query(2023, ge=1900, le=2100),
    direction: str = Query("import"),
    db: Session = Depends(get_db),
):
    """Supply dependency data by country and/or commodity."""
    return get_supply_dependencies(db, country_iso, commodity_id, year, direction)

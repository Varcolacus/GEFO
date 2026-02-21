from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional, List
import logging

from app.core.database import get_db

logger = logging.getLogger("gefo.api.trade_flows")
from app.models.trade_flow import TradeFlow
from app.models.country import Country
from app.schemas.schemas import TradeFlowResponse, TradeFlowAggregated

router = APIRouter(prefix="/api/trade_flows", tags=["Trade Flows"])


@router.get("/", response_model=List[TradeFlowResponse])
def get_trade_flows(
    year: int = Query(..., description="Year of trade data"),
    exporter: Optional[str] = Query(None, description="Exporter ISO code"),
    importer: Optional[str] = Query(None, description="Importer ISO code"),
    min_value: Optional[float] = Query(None, description="Minimum trade value USD"),
    limit: int = Query(500, le=5000, description="Max results"),
    db: Session = Depends(get_db),
):
    """Get bilateral trade flows for a given year."""
    query = db.query(TradeFlow).filter(TradeFlow.year == year)

    if exporter:
        query = query.filter(TradeFlow.exporter_iso == exporter.upper())
    if importer:
        query = query.filter(TradeFlow.importer_iso == importer.upper())
    if min_value:
        query = query.filter(TradeFlow.trade_value_usd >= min_value)

    query = query.order_by(TradeFlow.trade_value_usd.desc()).limit(limit)
    flows = query.all()
    logger.info(f"Trade flows fetched: {len(flows)} (year={year}, exporter={exporter}, importer={importer})")

    # Enrich with country centroids
    countries = {c.iso_code: c for c in db.query(Country).all()}
    results = []
    for f in flows:
        exp = countries.get(f.exporter_iso)
        imp = countries.get(f.importer_iso)
        results.append(TradeFlowResponse(
            id=f.id,
            exporter_iso=f.exporter_iso,
            importer_iso=f.importer_iso,
            year=f.year,
            month=f.month,
            commodity_code=f.commodity_code,
            commodity_description=f.commodity_description,
            trade_value_usd=f.trade_value_usd,
            weight_kg=f.weight_kg,
            flow_type=f.flow_type,
            exporter_lat=exp.centroid_lat if exp else None,
            exporter_lon=exp.centroid_lon if exp else None,
            importer_lat=imp.centroid_lat if imp else None,
            importer_lon=imp.centroid_lon if imp else None,
        ))

    return results


@router.get("/aggregated", response_model=List[TradeFlowAggregated])
def get_aggregated_trade_flows(
    year: int = Query(..., description="Year"),
    top_n: int = Query(100, le=10000, description="Top N flows by value"),
    db: Session = Depends(get_db),
):
    """Get aggregated bilateral trade flows (for globe visualization)."""
    results = (
        db.query(
            TradeFlow.exporter_iso,
            TradeFlow.importer_iso,
            func.sum(TradeFlow.trade_value_usd).label("total_value_usd"),
        )
        .filter(TradeFlow.year == year)
        .group_by(TradeFlow.exporter_iso, TradeFlow.importer_iso)
        .order_by(func.sum(TradeFlow.trade_value_usd).desc())
        .limit(top_n)
        .all()
    )

    countries = {c.iso_code: c for c in db.query(Country).all()}
    aggregated = []
    for r in results:
        exp = countries.get(r.exporter_iso)
        imp = countries.get(r.importer_iso)
        aggregated.append(TradeFlowAggregated(
            exporter_iso=r.exporter_iso,
            importer_iso=r.importer_iso,
            total_value_usd=r.total_value_usd,
            exporter_lat=exp.centroid_lat if exp else None,
            exporter_lon=exp.centroid_lon if exp else None,
            importer_lat=imp.centroid_lat if imp else None,
            importer_lon=imp.centroid_lon if imp else None,
        ))

    return aggregated

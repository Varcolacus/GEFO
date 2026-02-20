"""CSV export endpoints — data download for Pro/Institutional tiers."""

import csv
import io
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_tier
from app.models.user import User, SubscriptionTier
from app.models.country import Country
from app.models.trade_flow import TradeFlow
from app.models.port import Port

router = APIRouter(prefix="/api/export", tags=["export"])

PAID_TIERS = (SubscriptionTier.PRO, SubscriptionTier.INSTITUTIONAL)


def _csv_response(rows: list[list], headers: list[str], filename: str) -> StreamingResponse:
    """Build a streaming CSV response."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    writer.writerows(rows)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── Countries CSV ───


@router.get("/countries.csv")
def export_countries(
    user: User = Depends(require_tier(*PAID_TIERS)),
    db: Session = Depends(get_db),
):
    """Export all country macro data as CSV (Pro+)."""
    countries = db.query(Country).order_by(Country.iso_code).all()
    headers = [
        "iso_code", "name", "region", "sub_region",
        "gdp", "gdp_per_capita", "trade_balance", "current_account",
        "export_value", "import_value", "population",
        "centroid_lat", "centroid_lon",
    ]
    rows = [
        [
            c.iso_code, c.name, c.region, c.sub_region,
            c.gdp, c.gdp_per_capita, c.trade_balance, c.current_account,
            c.export_value, c.import_value, c.population,
            c.centroid_lat, c.centroid_lon,
        ]
        for c in countries
    ]
    return _csv_response(rows, headers, "gefo_countries.csv")


# ─── Trade Flows CSV ───


@router.get("/trade_flows.csv")
def export_trade_flows(
    year: int = Query(2023),
    user: User = Depends(require_tier(*PAID_TIERS)),
    db: Session = Depends(get_db),
):
    """Export bilateral trade flows for a year as CSV (Pro+)."""
    flows = (
        db.query(TradeFlow)
        .filter(TradeFlow.year == year)
        .order_by(TradeFlow.trade_value_usd.desc())
        .all()
    )
    headers = [
        "exporter_iso", "importer_iso", "year", "month",
        "trade_value_usd", "commodity_code", "commodity_desc",
    ]
    rows = [
        [
            f.exporter_iso, f.importer_iso, f.year, f.month,
            f.trade_value_usd, f.commodity_code, f.commodity_description,
        ]
        for f in flows
    ]
    return _csv_response(rows, headers, f"gefo_trade_flows_{year}.csv")


# ─── Ports CSV ───


@router.get("/ports.csv")
def export_ports(
    user: User = Depends(require_tier(*PAID_TIERS)),
    db: Session = Depends(get_db),
):
    """Export port data as CSV (Pro+)."""
    ports = db.query(Port).order_by(Port.name).all()
    headers = [
        "id", "name", "country_iso", "lat", "lon",
        "port_type", "throughput_teu", "throughput_tons",
    ]
    rows = [
        [
            p.id, p.name, p.country_iso, p.lat, p.lon,
            p.port_type, p.throughput_teu, p.throughput_tons,
        ]
        for p in ports
    ]
    return _csv_response(rows, headers, "gefo_ports.csv")

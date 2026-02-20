from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
import math

from app.core.database import get_db
from app.models.country import Country
from app.models.trade_flow import TradeFlow
from app.models.port import Port
from app.models.shipping_density import ShippingDensity
from app.schemas.schemas import IndicatorResponse, CountryIndicator

router = APIRouter(prefix="/api/indicators", tags=["Indicators"])


# ────────────────────────────── GLOBAL SUMMARY ──────────────────────────────

@router.get("/", response_model=List[IndicatorResponse])
def get_indicators(
    year: int = Query(2023, description="Reference year"),
    db: Session = Depends(get_db),
):
    """
    Get high-level global indicators computed from the database.
    Returns aggregate stats for the requested year.
    """
    # Total global trade (sum of all export flows)
    total_trade = (
        db.query(func.sum(TradeFlow.trade_value_usd))
        .filter(TradeFlow.year == year)
        .scalar()
    ) or 0

    # Number of active bilateral corridors
    corridor_count = (
        db.query(func.count())
        .select_from(TradeFlow)
        .filter(TradeFlow.year == year)
        .scalar()
    ) or 0

    # Average shipping density for the year
    avg_density = (
        db.query(func.avg(ShippingDensity.density_value))
        .filter(ShippingDensity.year == year)
        .scalar()
    ) or 0

    # Total port throughput (TEU)
    total_port_teu = (
        db.query(func.sum(Port.throughput_teu)).scalar()
    ) or 0

    # Countries with trade data
    active_countries = (
        db.query(func.count(func.distinct(TradeFlow.exporter_iso)))
        .filter(TradeFlow.year == year)
        .scalar()
    ) or 0

    # Global trade concentration (HHI on exporter shares)
    exporter_shares = (
        db.query(
            TradeFlow.exporter_iso,
            func.sum(TradeFlow.trade_value_usd).label("total"),
        )
        .filter(TradeFlow.year == year)
        .group_by(TradeFlow.exporter_iso)
        .all()
    )
    hhi = 0.0
    if exporter_shares and total_trade > 0:
        hhi = sum((row.total / total_trade) ** 2 for row in exporter_shares) * 10000

    return [
        IndicatorResponse(
            name="Global Trade Volume",
            description="Total bilateral trade value (exports) for the year",
            value=round(total_trade, 2),
            unit="USD",
            reference_period=str(year),
            metadata={"corridors": corridor_count, "active_exporters": active_countries},
        ),
        IndicatorResponse(
            name="Trade Concentration Index (HHI)",
            description="Herfindahl-Hirschman Index on global export shares (0-10000)",
            value=round(hhi, 2),
            unit="index",
            reference_period=str(year),
            metadata={"interpretation": "Higher = more concentrated; <1500 competitive, >2500 concentrated"},
        ),
        IndicatorResponse(
            name="Average Shipping Density",
            description="Mean vessel density across monitored shipping lanes",
            value=round(float(avg_density), 2),
            unit="vessels/grid-cell",
            reference_period=str(year),
            metadata={},
        ),
        IndicatorResponse(
            name="Global Port Throughput",
            description="Total container port throughput across all tracked ports",
            value=round(total_port_teu, 0),
            unit="TEU",
            reference_period="latest",
            metadata={"port_count": db.query(func.count(Port.id)).scalar()},
        ),
    ]


# ────────────────────────────── PER-COUNTRY INDICATORS ──────────────────────


@router.get("/country/{iso_code}", response_model=List[CountryIndicator])
def get_country_indicators(
    iso_code: str,
    year: int = Query(2023, description="Reference year"),
    db: Session = Depends(get_db),
):
    """
    Compute derived indicators for a single country:
    - Trade Openness  (exports+imports) / GDP
    - Import Dependency  imports / (GDP + imports - exports)
    - Export Diversification  HHI across partner countries
    - Trade Balance Ratio  (exports - imports) / (exports + imports)
    """
    iso = iso_code.upper()
    country = db.query(Country).filter(Country.iso_code == iso).first()
    if not country:
        from fastapi import HTTPException
        raise HTTPException(404, f"Country {iso} not found")

    # Aggregate exports and imports for this country/year
    total_exports = (
        db.query(func.sum(TradeFlow.trade_value_usd))
        .filter(TradeFlow.exporter_iso == iso, TradeFlow.year == year)
        .scalar()
    ) or 0

    total_imports = (
        db.query(func.sum(TradeFlow.trade_value_usd))
        .filter(TradeFlow.importer_iso == iso, TradeFlow.year == year)
        .scalar()
    ) or 0

    gdp = country.gdp or 0
    results: List[CountryIndicator] = []

    # 1. Trade Openness
    trade_openness = ((total_exports + total_imports) / gdp * 100) if gdp > 0 else None
    results.append(CountryIndicator(
        iso_code=iso,
        indicator_name="Trade Openness",
        value=round(trade_openness, 2) if trade_openness is not None else None,
        unit="%",
        year=year,
        description="(Exports + Imports) / GDP × 100",
    ))

    # 2. Import Dependency
    domestic_absorption = gdp + total_imports - total_exports
    import_dep = (total_imports / domestic_absorption * 100) if domestic_absorption > 0 else None
    results.append(CountryIndicator(
        iso_code=iso,
        indicator_name="Import Dependency",
        value=round(import_dep, 2) if import_dep is not None else None,
        unit="%",
        year=year,
        description="Imports / (GDP + Imports − Exports) × 100",
    ))

    # 3. Export Diversification (HHI across partners — lower = more diversified)
    partner_exports = (
        db.query(
            TradeFlow.importer_iso,
            func.sum(TradeFlow.trade_value_usd).label("total"),
        )
        .filter(TradeFlow.exporter_iso == iso, TradeFlow.year == year)
        .group_by(TradeFlow.importer_iso)
        .all()
    )
    if partner_exports and total_exports > 0:
        hhi = sum((p.total / total_exports) ** 2 for p in partner_exports) * 10000
    else:
        hhi = None
    results.append(CountryIndicator(
        iso_code=iso,
        indicator_name="Export Diversification (HHI)",
        value=round(hhi, 2) if hhi is not None else None,
        unit="index (0-10000)",
        year=year,
        description="Herfindahl-Hirschman Index on export partners. Lower = more diversified.",
    ))

    # 4. Trade Balance Ratio
    total_trade = total_exports + total_imports
    tb_ratio = ((total_exports - total_imports) / total_trade * 100) if total_trade > 0 else None
    results.append(CountryIndicator(
        iso_code=iso,
        indicator_name="Trade Balance Ratio",
        value=round(tb_ratio, 2) if tb_ratio is not None else None,
        unit="%",
        year=year,
        description="(Exports − Imports) / Total Trade × 100. Positive = surplus.",
    ))

    # 5. Export Intensity
    export_intensity = (total_exports / gdp * 100) if gdp > 0 else None
    results.append(CountryIndicator(
        iso_code=iso,
        indicator_name="Export Intensity",
        value=round(export_intensity, 2) if export_intensity is not None else None,
        unit="%",
        year=year,
        description="Exports / GDP × 100",
    ))

    return results


# ────────────────────────────── RANKINGS ────────────────────────────────────


@router.get("/rankings", response_model=List[CountryIndicator])
def get_rankings(
    indicator: str = Query("trade_openness", description="Indicator to rank by"),
    year: int = Query(2023, description="Reference year"),
    top_n: int = Query(20, le=100),
    db: Session = Depends(get_db),
):
    """
    Rank countries by a computed indicator.
    Available indicators: trade_openness, export_intensity, import_dependency,
                          trade_balance_ratio, export_diversification
    """
    # Build per-country aggregates
    export_agg = dict(
        db.query(TradeFlow.exporter_iso, func.sum(TradeFlow.trade_value_usd))
        .filter(TradeFlow.year == year)
        .group_by(TradeFlow.exporter_iso)
        .all()
    )
    import_agg = dict(
        db.query(TradeFlow.importer_iso, func.sum(TradeFlow.trade_value_usd))
        .filter(TradeFlow.year == year)
        .group_by(TradeFlow.importer_iso)
        .all()
    )

    countries = db.query(Country).filter(Country.gdp.isnot(None), Country.gdp > 0).all()
    scored: List[CountryIndicator] = []

    for c in countries:
        exp = export_agg.get(c.iso_code, 0)
        imp = import_agg.get(c.iso_code, 0)
        gdp = c.gdp or 0
        if gdp <= 0:
            continue

        if indicator == "trade_openness":
            val = (exp + imp) / gdp * 100
            desc = "(Exports + Imports) / GDP × 100"
            unit = "%"
        elif indicator == "export_intensity":
            val = exp / gdp * 100
            desc = "Exports / GDP × 100"
            unit = "%"
        elif indicator == "import_dependency":
            da = gdp + imp - exp
            val = (imp / da * 100) if da > 0 else 0
            desc = "Imports / (GDP + Imports − Exports) × 100"
            unit = "%"
        elif indicator == "trade_balance_ratio":
            total = exp + imp
            val = ((exp - imp) / total * 100) if total > 0 else 0
            desc = "(Exports − Imports) / Total Trade × 100"
            unit = "%"
        else:
            continue

        scored.append(CountryIndicator(
            iso_code=c.iso_code,
            indicator_name=indicator.replace("_", " ").title(),
            value=round(val, 2),
            unit=unit,
            year=year,
            description=desc,
        ))

    # Sort descending (except trade_balance_ratio where both directions are meaningful)
    scored.sort(key=lambda x: x.value if x.value is not None else 0, reverse=True)
    return scored[:top_n]

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional, List

from app.core.database import get_db
from app.models.country import Country
from app.models.trade_flow import TradeFlow
from app.models.port import Port
from app.schemas.schemas import CountryMacro, CountryProfile, TradePartner, TradeYearSummary, PortResponse

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


@router.get("/{iso_code}/profile", response_model=CountryProfile)
def get_country_profile(iso_code: str, db: Session = Depends(get_db)):
    """Get detailed country profile with trade history and partners."""
    country = db.query(Country).filter(Country.iso_code == iso_code.upper()).first()
    if not country:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Country {iso_code} not found")

    iso = iso_code.upper()

    # Top export partners (aggregated across all years)
    export_partners_raw = (
        db.query(
            TradeFlow.importer_iso,
            func.sum(TradeFlow.trade_value_usd).label("total"),
        )
        .filter(TradeFlow.exporter_iso == iso)
        .group_by(TradeFlow.importer_iso)
        .order_by(func.sum(TradeFlow.trade_value_usd).desc())
        .limit(10)
        .all()
    )

    countries_map = {c.iso_code: c.name for c in db.query(Country.iso_code, Country.name).all()}

    top_export_partners = [
        TradePartner(
            iso_code=r.importer_iso,
            name=countries_map.get(r.importer_iso, r.importer_iso),
            total_value_usd=r.total,
            direction="export",
        )
        for r in export_partners_raw
    ]

    # Top import partners
    import_partners_raw = (
        db.query(
            TradeFlow.exporter_iso,
            func.sum(TradeFlow.trade_value_usd).label("total"),
        )
        .filter(TradeFlow.importer_iso == iso)
        .group_by(TradeFlow.exporter_iso)
        .order_by(func.sum(TradeFlow.trade_value_usd).desc())
        .limit(10)
        .all()
    )

    top_import_partners = [
        TradePartner(
            iso_code=r.exporter_iso,
            name=countries_map.get(r.exporter_iso, r.exporter_iso),
            total_value_usd=r.total,
            direction="import",
        )
        for r in import_partners_raw
    ]

    # Trade history by year
    export_by_year = dict(
        db.query(TradeFlow.year, func.sum(TradeFlow.trade_value_usd))
        .filter(TradeFlow.exporter_iso == iso)
        .group_by(TradeFlow.year)
        .all()
    )

    import_by_year = dict(
        db.query(TradeFlow.year, func.sum(TradeFlow.trade_value_usd))
        .filter(TradeFlow.importer_iso == iso)
        .group_by(TradeFlow.year)
        .all()
    )

    # Top partner per year
    all_years = sorted(set(list(export_by_year.keys()) + list(import_by_year.keys())))
    trade_history = []
    for yr in all_years:
        exp_total = export_by_year.get(yr, 0) or 0
        imp_total = import_by_year.get(yr, 0) or 0

        # Top export partner for this year
        top_exp = (
            db.query(TradeFlow.importer_iso)
            .filter(TradeFlow.exporter_iso == iso, TradeFlow.year == yr)
            .group_by(TradeFlow.importer_iso)
            .order_by(func.sum(TradeFlow.trade_value_usd).desc())
            .first()
        )
        top_imp = (
            db.query(TradeFlow.exporter_iso)
            .filter(TradeFlow.importer_iso == iso, TradeFlow.year == yr)
            .group_by(TradeFlow.exporter_iso)
            .order_by(func.sum(TradeFlow.trade_value_usd).desc())
            .first()
        )

        trade_history.append(
            TradeYearSummary(
                year=yr,
                total_exports=exp_total,
                total_imports=imp_total,
                trade_balance=exp_total - imp_total,
                top_export_partner=top_exp[0] if top_exp else None,
                top_import_partner=top_imp[0] if top_imp else None,
            )
        )

    # Ports in this country
    country_ports = db.query(Port).filter(Port.country_iso == iso).all()

    return CountryProfile(
        country=country,
        top_export_partners=top_export_partners,
        top_import_partners=top_import_partners,
        trade_history=trade_history,
        ports=country_ports,
    )


@router.get("/{iso_code}", response_model=CountryMacro)
def get_country(iso_code: str, db: Session = Depends(get_db)):
    """Get a single country by ISO code."""
    country = db.query(Country).filter(Country.iso_code == iso_code.upper()).first()
    if not country:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Country {iso_code} not found")
    return country

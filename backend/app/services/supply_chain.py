"""
Supply Chain Graph Service — Phase 10
──────────────────────────────────────
Builds commodity flow graphs showing which countries supply what to whom,
generates globe overlay data for commodity-specific trade arcs.
"""

from sqlalchemy.orm import Session
from sqlalchemy import func, desc, and_
from typing import Dict, List, Optional, Any
import logging

from app.models.commodity import Commodity, SupplyDependency
from app.models.trade_flow import TradeFlow
from app.models.country import Country

logger = logging.getLogger("gefo.services.supply_chain")


def commodity_flow_graph(
    db: Session,
    commodity_code: str,
    year: int = 2023,
    top_n: int = 15,
) -> Dict[str, Any]:
    """
    Build a flow graph for a given commodity:
    Returns nodes (countries) and edges (trade flows) with coordinates for globe overlay.
    """
    commodity = db.query(Commodity).filter(Commodity.hs_code == commodity_code).first()

    # Get top flows for this commodity
    code_filter = TradeFlow.commodity_code == commodity_code
    if commodity_code == "TOTAL":
        code_filter = TradeFlow.commodity_code == "TOTAL"

    flows = (
        db.query(
            TradeFlow.exporter_iso,
            TradeFlow.importer_iso,
            func.sum(TradeFlow.trade_value_usd).label("value"),
        )
        .filter(code_filter, TradeFlow.year == year)
        .group_by(TradeFlow.exporter_iso, TradeFlow.importer_iso)
        .order_by(desc("value"))
        .limit(top_n)
        .all()
    )

    # Collect unique ISOs
    iso_set = set()
    for f in flows:
        iso_set.add(f[0])
        iso_set.add(f[1])

    # Get country centroids
    countries = (
        db.query(Country)
        .filter(Country.iso_code.in_(list(iso_set)))
        .all()
    )
    centroid_map = {
        c.iso_code: {"name": c.name, "lat": c.centroid_lat, "lon": c.centroid_lon}
        for c in countries
    }

    # Build nodes
    nodes = [
        {
            "iso": iso,
            "name": centroid_map.get(iso, {}).get("name", iso),
            "lat": centroid_map.get(iso, {}).get("lat", 0),
            "lon": centroid_map.get(iso, {}).get("lon", 0),
        }
        for iso in iso_set
        if iso in centroid_map
    ]

    # Build edges with coordinates for globe overlay
    max_val = max((float(f[2]) for f in flows), default=1)
    edges = []
    for f in flows:
        exp_iso, imp_iso, val = f[0], f[1], float(f[2])
        exp_c = centroid_map.get(exp_iso)
        imp_c = centroid_map.get(imp_iso)
        if exp_c and imp_c:
            edges.append({
                "exporter_iso": exp_iso,
                "importer_iso": imp_iso,
                "value_usd": val,
                "weight": round(val / max_val, 3),  # 0-1 normalized
                "exporter_lat": exp_c["lat"],
                "exporter_lon": exp_c["lon"],
                "importer_lat": imp_c["lat"],
                "importer_lon": imp_c["lon"],
            })

    return {
        "commodity_code": commodity_code,
        "commodity_name": commodity.name if commodity else commodity_code,
        "icon": commodity.icon if commodity else None,
        "year": year,
        "nodes": nodes,
        "edges": edges,
        "total_value": sum(e["value_usd"] for e in edges),
    }


def country_commodity_profile(
    db: Session,
    country_iso: str,
    year: int = 2023,
) -> Dict[str, Any]:
    """
    Build a commodity profile for a country:
    Top exported/imported commodities with values and partners.
    """
    country = db.query(Country).filter(Country.iso_code == country_iso).first()
    if not country:
        return {"error": f"Country {country_iso} not found"}

    # Top exported commodities
    top_exports = (
        db.query(
            TradeFlow.commodity_code,
            TradeFlow.commodity_description,
            func.sum(TradeFlow.trade_value_usd).label("total"),
        )
        .filter(
            TradeFlow.exporter_iso == country_iso,
            TradeFlow.year == year,
            TradeFlow.commodity_code != "TOTAL",
        )
        .group_by(TradeFlow.commodity_code, TradeFlow.commodity_description)
        .order_by(desc("total"))
        .limit(10)
        .all()
    )

    # Top imported commodities
    top_imports = (
        db.query(
            TradeFlow.commodity_code,
            TradeFlow.commodity_description,
            func.sum(TradeFlow.trade_value_usd).label("total"),
        )
        .filter(
            TradeFlow.importer_iso == country_iso,
            TradeFlow.year == year,
            TradeFlow.commodity_code != "TOTAL",
        )
        .group_by(TradeFlow.commodity_code, TradeFlow.commodity_description)
        .order_by(desc("total"))
        .limit(10)
        .all()
    )

    # Dependency data
    deps = (
        db.query(SupplyDependency)
        .filter(SupplyDependency.country_iso == country_iso, SupplyDependency.year == year)
        .order_by(desc(SupplyDependency.value_usd))
        .all()
    )

    commodity_names = {c.id: c.name for c in db.query(Commodity).all()}

    return {
        "country_iso": country_iso,
        "country_name": country.name,
        "year": year,
        "top_exports": [
            {
                "commodity_code": r[0],
                "description": r[1] or r[0],
                "value_usd": float(r[2]),
            }
            for r in top_exports
        ],
        "top_imports": [
            {
                "commodity_code": r[0],
                "description": r[1] or r[0],
                "value_usd": float(r[2]),
            }
            for r in top_imports
        ],
        "dependencies": [
            {
                "commodity_name": commodity_names.get(d.commodity_id, "?"),
                "direction": d.direction,
                "value_usd": d.value_usd,
                "share_pct": d.share_pct,
                "risk_score": d.risk_score,
                "top_partner_iso": d.top_partner_iso,
            }
            for d in deps
        ],
    }


def global_commodity_overview(db: Session, year: int = 2023) -> Dict[str, Any]:
    """Summary of global commodity trade: top commodities by trade value."""
    rows = (
        db.query(
            TradeFlow.commodity_code,
            TradeFlow.commodity_description,
            func.sum(TradeFlow.trade_value_usd).label("total"),
            func.count(func.distinct(TradeFlow.exporter_iso)).label("n_exporters"),
            func.count(func.distinct(TradeFlow.importer_iso)).label("n_importers"),
        )
        .filter(TradeFlow.year == year, TradeFlow.commodity_code != "TOTAL")
        .group_by(TradeFlow.commodity_code, TradeFlow.commodity_description)
        .order_by(desc("total"))
        .limit(20)
        .all()
    )

    # Enrich with commodity model data
    code_map = {c.hs_code: c for c in db.query(Commodity).all()}

    commodities = []
    for r in rows:
        c = code_map.get(r[0])
        commodities.append({
            "commodity_code": r[0],
            "description": r[1] or (c.name if c else r[0]),
            "category": c.category if c else "other",
            "icon": c.icon if c else None,
            "total_trade_usd": float(r[2]),
            "n_exporters": r[3],
            "n_importers": r[4],
            "is_strategic": c.is_strategic if c else False,
        })

    return {
        "year": year,
        "top_commodities": commodities,
        "total_commodity_trade": sum(c["total_trade_usd"] for c in commodities),
    }

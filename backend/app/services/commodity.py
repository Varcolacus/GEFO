"""
Commodity Price & Analytics Service — Phase 10
───────────────────────────────────────────────
Price trend analysis, trade-by-commodity aggregation, price-volume correlation,
supply risk scoring.
"""

from sqlalchemy.orm import Session
from sqlalchemy import func, desc, and_
from typing import Dict, List, Optional, Any
import logging

from app.models.commodity import Commodity, CommodityPrice, SupplyDependency
from app.models.trade_flow import TradeFlow

logger = logging.getLogger("gefo.services.commodity")


# ─── Commodity Listing ────────────────────────────────────────────

def get_commodities(db: Session, category: Optional[str] = None, strategic_only: bool = False) -> List[Dict]:
    """List all tracked commodities, optionally filtered."""
    q = db.query(Commodity)
    if category:
        q = q.filter(Commodity.category == category)
    if strategic_only:
        q = q.filter(Commodity.is_strategic == True)
    rows = q.order_by(Commodity.category, Commodity.name).all()
    return [
        {
            "id": r.id,
            "hs_code": r.hs_code,
            "name": r.name,
            "category": r.category,
            "sub_category": r.sub_category,
            "unit": r.unit,
            "is_strategic": r.is_strategic,
            "icon": r.icon,
        }
        for r in rows
    ]


def get_commodity_categories(db: Session) -> List[Dict]:
    """Get categories with count."""
    rows = (
        db.query(Commodity.category, func.count(Commodity.id))
        .group_by(Commodity.category)
        .order_by(Commodity.category)
        .all()
    )
    return [{"category": r[0], "count": r[1]} for r in rows]


# ─── Price Analytics ──────────────────────────────────────────────

def get_price_history(
    db: Session,
    commodity_id: int,
    start_year: int = 2018,
    end_year: int = 2023,
) -> Dict[str, Any]:
    """Get monthly price history for a commodity."""
    commodity = db.query(Commodity).filter(Commodity.id == commodity_id).first()
    if not commodity:
        return {"error": "Commodity not found"}

    prices = (
        db.query(CommodityPrice)
        .filter(
            CommodityPrice.commodity_id == commodity_id,
            CommodityPrice.year >= start_year,
            CommodityPrice.year <= end_year,
        )
        .order_by(CommodityPrice.year, CommodityPrice.month)
        .all()
    )

    return {
        "commodity": {
            "id": commodity.id,
            "name": commodity.name,
            "hs_code": commodity.hs_code,
            "unit": commodity.unit,
            "category": commodity.category,
            "icon": commodity.icon,
        },
        "prices": [
            {
                "year": p.year,
                "month": p.month,
                "price": p.price,
                "price_change_pct": p.price_change_pct,
                "yoy_change_pct": p.yoy_change_pct,
                "high": p.high,
                "low": p.low,
            }
            for p in prices
        ],
        "summary": _price_summary(prices, commodity.unit),
    }


def _price_summary(prices: list, unit: str) -> Dict:
    """Compute price summary stats."""
    if not prices:
        return {}
    values = [p.price for p in prices]
    latest = prices[-1]
    return {
        "latest_price": latest.price,
        "latest_period": f"{latest.year}-{latest.month:02d}",
        "unit": unit,
        "min_price": min(values),
        "max_price": max(values),
        "avg_price": round(sum(values) / len(values), 2),
        "volatility": round(_std(values), 2),
        "yoy_change_pct": latest.yoy_change_pct,
        "total_periods": len(prices),
    }


def _std(values: list) -> float:
    if len(values) < 2:
        return 0.0
    mean = sum(values) / len(values)
    return (sum((x - mean) ** 2 for x in values) / (len(values) - 1)) ** 0.5


# ─── Price Dashboard ─────────────────────────────────────────────

def commodity_price_dashboard(db: Session, year: int = 2023) -> Dict[str, Any]:
    """Overview: latest prices, biggest movers, category breakdown."""
    commodities = db.query(Commodity).order_by(Commodity.category, Commodity.name).all()

    latest_prices = []
    for c in commodities:
        latest = (
            db.query(CommodityPrice)
            .filter(CommodityPrice.commodity_id == c.id, CommodityPrice.year == year)
            .order_by(desc(CommodityPrice.month))
            .first()
        )
        if latest:
            latest_prices.append({
                "commodity_id": c.id,
                "name": c.name,
                "hs_code": c.hs_code,
                "category": c.category,
                "icon": c.icon,
                "unit": c.unit,
                "is_strategic": c.is_strategic,
                "price": latest.price,
                "price_change_pct": latest.price_change_pct,
                "yoy_change_pct": latest.yoy_change_pct,
                "period": f"{latest.year}-{latest.month:02d}",
            })

    # Sort by YoY change for movers
    movers = sorted(
        [p for p in latest_prices if p.get("yoy_change_pct") is not None],
        key=lambda x: abs(x["yoy_change_pct"] or 0),
        reverse=True,
    )

    # Category averages
    cat_map: Dict[str, list] = {}
    for p in latest_prices:
        cat_map.setdefault(p["category"], []).append(p)
    categories = [
        {
            "category": cat,
            "count": len(items),
            "avg_yoy_change": round(
                sum(i.get("yoy_change_pct", 0) or 0 for i in items) / max(len(items), 1), 1
            ),
        }
        for cat, items in sorted(cat_map.items())
    ]

    return {
        "year": year,
        "total_commodities": len(commodities),
        "tracked_with_prices": len(latest_prices),
        "latest_prices": latest_prices,
        "top_movers": movers[:10],
        "categories": categories,
    }


# ─── Trade by Commodity ──────────────────────────────────────────

def trade_by_commodity(
    db: Session,
    commodity_code: str,
    year: int = 2023,
    top_n: int = 20,
) -> Dict[str, Any]:
    """Get top trade flows for a specific commodity code."""
    commodity = db.query(Commodity).filter(Commodity.hs_code == commodity_code).first()

    # Query trade flows matching this commodity code
    flows = (
        db.query(
            TradeFlow.exporter_iso,
            TradeFlow.importer_iso,
            func.sum(TradeFlow.trade_value_usd).label("total_value"),
        )
        .filter(TradeFlow.commodity_code == commodity_code, TradeFlow.year == year)
        .group_by(TradeFlow.exporter_iso, TradeFlow.importer_iso)
        .order_by(desc("total_value"))
        .limit(top_n)
        .all()
    )

    # Also try with LIKE prefix match for HS-2 → HS-4 rollup
    if len(flows) == 0 and len(commodity_code) <= 4:
        flows = (
            db.query(
                TradeFlow.exporter_iso,
                TradeFlow.importer_iso,
                func.sum(TradeFlow.trade_value_usd).label("total_value"),
            )
            .filter(TradeFlow.commodity_code.like(f"{commodity_code}%"), TradeFlow.year == year)
            .group_by(TradeFlow.exporter_iso, TradeFlow.importer_iso)
            .order_by(desc("total_value"))
            .limit(top_n)
            .all()
        )

    # Top exporters
    exporters = (
        db.query(
            TradeFlow.exporter_iso,
            func.sum(TradeFlow.trade_value_usd).label("total_export"),
        )
        .filter(TradeFlow.commodity_code == commodity_code, TradeFlow.year == year)
        .group_by(TradeFlow.exporter_iso)
        .order_by(desc("total_export"))
        .limit(10)
        .all()
    )

    # Top importers
    importers = (
        db.query(
            TradeFlow.importer_iso,
            func.sum(TradeFlow.trade_value_usd).label("total_import"),
        )
        .filter(TradeFlow.commodity_code == commodity_code, TradeFlow.year == year)
        .group_by(TradeFlow.importer_iso)
        .order_by(desc("total_import"))
        .limit(10)
        .all()
    )

    return {
        "commodity_code": commodity_code,
        "commodity_name": commodity.name if commodity else commodity_code,
        "year": year,
        "flows": [
            {
                "exporter_iso": f[0],
                "importer_iso": f[1],
                "value_usd": float(f[2]),
            }
            for f in flows
        ],
        "top_exporters": [{"iso": r[0], "value_usd": float(r[1])} for r in exporters],
        "top_importers": [{"iso": r[0], "value_usd": float(r[1])} for r in importers],
        "total_flows": len(flows),
    }


# ─── Supply Dependencies ─────────────────────────────────────────

def get_supply_dependencies(
    db: Session,
    country_iso: Optional[str] = None,
    commodity_id: Optional[int] = None,
    year: int = 2023,
    direction: str = "import",
) -> List[Dict]:
    """Get supply dependency data, optionally filtered."""
    q = db.query(SupplyDependency).filter(
        SupplyDependency.year == year,
        SupplyDependency.direction == direction,
    )
    if country_iso:
        q = q.filter(SupplyDependency.country_iso == country_iso)
    if commodity_id:
        q = q.filter(SupplyDependency.commodity_id == commodity_id)

    rows = q.order_by(desc(SupplyDependency.value_usd)).limit(50).all()

    # Enrich with commodity name
    commodity_names = {
        c.id: c.name
        for c in db.query(Commodity).all()
    }

    return [
        {
            "country_iso": r.country_iso,
            "commodity_id": r.commodity_id,
            "commodity_name": commodity_names.get(r.commodity_id, "Unknown"),
            "year": r.year,
            "direction": r.direction,
            "value_usd": r.value_usd,
            "share_pct": r.share_pct,
            "world_share_pct": r.world_share_pct,
            "top_partner_iso": r.top_partner_iso,
            "concentration_hhi": r.concentration_hhi,
            "risk_score": r.risk_score,
        }
        for r in rows
    ]


# ─── Supply Risk Analysis ────────────────────────────────────────

def supply_risk_matrix(db: Session, year: int = 2023) -> Dict[str, Any]:
    """Build supply risk matrix: strategic commodities × major importers."""
    strategic = db.query(Commodity).filter(Commodity.is_strategic == True).all()

    matrix = []
    for commodity in strategic:
        deps = (
            db.query(SupplyDependency)
            .filter(
                SupplyDependency.commodity_id == commodity.id,
                SupplyDependency.year == year,
                SupplyDependency.direction == "import",
            )
            .order_by(desc(SupplyDependency.value_usd))
            .limit(10)
            .all()
        )
        if deps:
            avg_risk = sum(d.risk_score or 0 for d in deps) / len(deps)
            max_conc = max(d.concentration_hhi or 0 for d in deps)
            matrix.append({
                "commodity_id": commodity.id,
                "commodity_name": commodity.name,
                "hs_code": commodity.hs_code,
                "icon": commodity.icon,
                "category": commodity.category,
                "avg_risk_score": round(avg_risk, 1),
                "max_concentration_hhi": round(max_conc, 1),
                "dependent_countries": len(deps),
                "top_dependencies": [
                    {
                        "country_iso": d.country_iso,
                        "value_usd": d.value_usd,
                        "share_pct": d.share_pct,
                        "risk_score": d.risk_score,
                    }
                    for d in deps[:5]
                ],
            })

    matrix.sort(key=lambda x: x["avg_risk_score"], reverse=True)

    return {
        "year": year,
        "strategic_commodities": len(strategic),
        "risk_matrix": matrix,
    }


# ─── Price-Trade Correlation ─────────────────────────────────────

def price_trade_correlation(
    db: Session,
    commodity_id: int,
    start_year: int = 2018,
    end_year: int = 2023,
) -> Dict[str, Any]:
    """Correlate commodity prices with trade volume over time."""
    commodity = db.query(Commodity).filter(Commodity.id == commodity_id).first()
    if not commodity:
        return {"error": "Commodity not found"}

    prices = (
        db.query(CommodityPrice)
        .filter(
            CommodityPrice.commodity_id == commodity_id,
            CommodityPrice.year >= start_year,
            CommodityPrice.year <= end_year,
        )
        .order_by(CommodityPrice.year, CommodityPrice.month)
        .all()
    )

    # Aggregate trade value by year
    trade_by_year = (
        db.query(
            TradeFlow.year,
            func.sum(TradeFlow.trade_value_usd).label("total"),
        )
        .filter(
            TradeFlow.commodity_code == commodity.hs_code,
            TradeFlow.year >= start_year,
            TradeFlow.year <= end_year,
        )
        .group_by(TradeFlow.year)
        .order_by(TradeFlow.year)
        .all()
    )

    # Build yearly avg prices
    yearly_prices: Dict[int, list] = {}
    for p in prices:
        yearly_prices.setdefault(p.year, []).append(p.price)
    avg_prices = {yr: sum(v) / len(v) for yr, v in yearly_prices.items()}

    # Correlation data
    corr_data = []
    for row in trade_by_year:
        yr = row[0]
        corr_data.append({
            "year": yr,
            "trade_value_usd": float(row[1]),
            "avg_price": round(avg_prices.get(yr, 0), 2),
        })

    # Compute simple correlation if enough data
    correlation = None
    if len(corr_data) >= 3:
        px = [d["avg_price"] for d in corr_data if d["avg_price"] > 0]
        ty = [d["trade_value_usd"] for d in corr_data if d["avg_price"] > 0]
        if len(px) >= 3:
            correlation = _pearson(px, ty)

    return {
        "commodity": commodity.name,
        "hs_code": commodity.hs_code,
        "period": f"{start_year}-{end_year}",
        "data": corr_data,
        "correlation": round(correlation, 3) if correlation is not None else None,
    }


def _pearson(x: list, y: list) -> float:
    """Pearson correlation coefficient."""
    n = len(x)
    if n < 2:
        return 0.0
    mx = sum(x) / n
    my = sum(y) / n
    sx = ((sum((xi - mx) ** 2 for xi in x)) / (n - 1)) ** 0.5
    sy = ((sum((yi - my) ** 2 for yi in y)) / (n - 1)) ** 0.5
    if sx == 0 or sy == 0:
        return 0.0
    return sum((xi - mx) * (yi - my) for xi, yi in zip(x, y)) / ((n - 1) * sx * sy)

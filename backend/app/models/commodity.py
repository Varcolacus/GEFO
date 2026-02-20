"""
Commodity & Price Models — Phase 10: Supply Chain & Commodity Tracker
─────────────────────────────────────────────────────────────────────
Tables:
  commodities       Master commodity reference (HS codes, categories, units)
  commodity_prices   Historical price series per commodity
  supply_dependencies  Country-commodity dependency links
"""

from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, UniqueConstraint
)
from sqlalchemy.sql import func
from app.core.database import Base


class Commodity(Base):
    """Master commodity reference table (HS-2/HS-4 level)."""
    __tablename__ = "commodities"

    id = Column(Integer, primary_key=True, index=True)
    hs_code = Column(String(10), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    category = Column(String(100), nullable=False, index=True)       # energy, metals, agriculture, technology, minerals
    sub_category = Column(String(100), nullable=True)                 # crude_oil, natural_gas, copper, etc.
    unit = Column(String(50), nullable=False, default="USD/MT")       # USD/MT, USD/bbl, USD/oz, USD/bushel
    description = Column(Text, nullable=True)
    is_strategic = Column(Boolean, default=False, index=True)         # critical / strategic commodity flag
    icon = Column(String(10), nullable=True)                          # emoji icon for UI
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CommodityPrice(Base):
    """Monthly price series for tracked commodities."""
    __tablename__ = "commodity_prices"
    __table_args__ = (
        UniqueConstraint("commodity_id", "year", "month", name="uq_commodity_price_period"),
    )

    id = Column(Integer, primary_key=True, index=True)
    commodity_id = Column(Integer, ForeignKey("commodities.id"), nullable=False, index=True)
    year = Column(Integer, nullable=False, index=True)
    month = Column(Integer, nullable=False)           # 1-12
    price = Column(Float, nullable=False)              # in commodity's unit
    price_change_pct = Column(Float, nullable=True)    # MoM % change
    yoy_change_pct = Column(Float, nullable=True)      # YoY % change
    volume_traded = Column(Float, nullable=True)       # global trade volume in unit
    high = Column(Float, nullable=True)
    low = Column(Float, nullable=True)
    source = Column(String(100), nullable=True, default="world_bank")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SupplyDependency(Base):
    """Country–commodity dependency links (import/export concentration)."""
    __tablename__ = "supply_dependencies"
    __table_args__ = (
        UniqueConstraint("country_iso", "commodity_id", "direction", "year", name="uq_supply_dep"),
    )

    id = Column(Integer, primary_key=True, index=True)
    country_iso = Column(String(3), ForeignKey("countries.iso_code"), nullable=False, index=True)
    commodity_id = Column(Integer, ForeignKey("commodities.id"), nullable=False, index=True)
    year = Column(Integer, nullable=False, index=True)
    direction = Column(String(10), nullable=False)     # 'export' or 'import'
    value_usd = Column(Float, nullable=False)          # total trade value
    share_pct = Column(Float, nullable=True)           # share of country's total exports/imports
    world_share_pct = Column(Float, nullable=True)     # country's share of global trade for this commodity
    top_partner_iso = Column(String(3), nullable=True) # largest partner for this commodity
    concentration_hhi = Column(Float, nullable=True)   # HHI of partner concentration (0-10000)
    risk_score = Column(Float, nullable=True)          # 0-100 supply risk score

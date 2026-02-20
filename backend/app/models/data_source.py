"""
Models for national data source registry, economic groups, and data provenance.
Ported from globe project's national-apis-config.js and app.js.
"""

from sqlalchemy import (
    Column, Integer, String, Float, Text, Boolean, DateTime,
    ForeignKey, UniqueConstraint
)
from datetime import datetime
from app.core.database import Base


class NationalDataSource(Base):
    """Registry of national statistical offices / central bank APIs."""
    __tablename__ = "national_data_sources"

    id = Column(Integer, primary_key=True, index=True)
    country_iso = Column(String(3), ForeignKey("countries.iso_code"), nullable=False, index=True)
    iso2 = Column(String(2), nullable=True, index=True)  # 2-letter ISO for matching globe data
    institution = Column(String(255), nullable=False)
    api_url = Column(Text, nullable=True)
    docs_url = Column(Text, nullable=True)
    auth_required = Column(Boolean, default=False)
    api_key_env_var = Column(String(100), nullable=True)  # e.g. "US_CENSUS_API_KEY"
    quality = Column(String(20), default="good")  # excellent/good/limited
    coverage = Column(String(20), default="partial")  # complete/partial
    update_frequency = Column(String(20), default="annual")  # monthly/quarterly/annual
    data_format = Column(String(30), nullable=True)  # sdmx/pxweb/xlsx/csv/json/html_scrape
    tier = Column(String(20), default="premium")  # premium/standard/limited
    is_active = Column(Boolean, default=True)
    last_fetch_at = Column(DateTime, nullable=True)
    last_fetch_status = Column(String(20), nullable=True)  # success/error/timeout
    fetch_error_count = Column(Integer, default=0)
    circuit_breaker_until = Column(DateTime, nullable=True)  # disable until this time
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("country_iso", "institution", name="uq_nds_country_institution"),
    )


class EconomicGroup(Base):
    """Economic/political groupings: G7, G20, BRICS, EU, OPEC, ASEAN, etc."""
    __tablename__ = "economic_groups"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(30), unique=True, nullable=False, index=True)  # e.g. "G7", "EU", "BRICS"
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(30), nullable=True)  # political/economic/trade/regional
    member_count = Column(Integer, nullable=True)

    def __repr__(self):
        return f"<EconomicGroup(code={self.code}, name={self.name})>"


class CountryGroupMembership(Base):
    """Many-to-many: countries belong to economic groups."""
    __tablename__ = "country_group_memberships"

    id = Column(Integer, primary_key=True, index=True)
    country_iso = Column(String(3), ForeignKey("countries.iso_code"), nullable=False, index=True)
    group_code = Column(String(30), ForeignKey("economic_groups.code"), nullable=False, index=True)

    __table_args__ = (
        UniqueConstraint("country_iso", "group_code", name="uq_country_group"),
    )


class DataProvenance(Base):
    """Track which institution provided specific data points."""
    __tablename__ = "data_provenance"

    id = Column(Integer, primary_key=True, index=True)
    entity_type = Column(String(30), nullable=False, index=True)  # trade_flow/country_macro/price
    entity_id = Column(Integer, nullable=False, index=True)
    source_id = Column(Integer, ForeignKey("national_data_sources.id"), nullable=True)
    source_name = Column(String(255), nullable=True)  # fallback if no source_id
    source_url = Column(Text, nullable=True)
    fetched_at = Column(DateTime, default=datetime.utcnow)
    data_year = Column(Integer, nullable=True)
    quality = Column(String(20), nullable=True)  # official/estimated/simulated
    notes = Column(Text, nullable=True)

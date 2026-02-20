"""
Geopolitical Risk models — sanctions, conflict zones, country risk scores.
Phase 6: Geopolitical Risk & Sanctions Layer.
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey
from app.core.database import Base


class SanctionedEntity(Base):
    """Sanctioned countries, organisations, individuals, or vessels."""
    __tablename__ = "sanctioned_entities"

    id = Column(Integer, primary_key=True, index=True)
    entity_type = Column(String(30), nullable=False, index=True)  # country, organisation, vessel, individual
    name = Column(String(300), nullable=False)
    country_iso = Column(String(3), ForeignKey("countries.iso_code", ondelete="SET NULL"), nullable=True, index=True)
    sanctioning_body = Column(String(100), nullable=False)  # UN, EU, US_OFAC, UK_OFSI
    programme = Column(String(200), nullable=True)  # e.g. "North Korea Sanctions", "Russia/Ukraine"
    reason = Column(Text, nullable=True)
    date_listed = Column(DateTime, nullable=True)
    date_delisted = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    identifiers = Column(Text, nullable=True)  # JSON: aliases, IMO numbers, etc.
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<SanctionedEntity({self.entity_type}: {self.name}, by={self.sanctioning_body})>"


class ConflictZone(Base):
    """Active conflict zones / areas of instability affecting trade."""
    __tablename__ = "conflict_zones"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False, unique=True)
    zone_type = Column(String(50), nullable=False)  # armed_conflict, piracy, territorial_dispute, civil_unrest
    severity = Column(String(20), nullable=False, default="moderate")  # low, moderate, high, critical
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    radius_km = Column(Float, nullable=False, default=200)  # affected radius
    affected_countries = Column(Text, nullable=True)  # JSON array of ISO codes
    affected_chokepoints = Column(Text, nullable=True)  # JSON array of chokepoint names
    description = Column(Text, nullable=True)
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)  # NULL = ongoing
    is_active = Column(Boolean, default=True, nullable=False)
    source = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<ConflictZone({self.name}, severity={self.severity})>"


class CountryRiskScore(Base):
    """Composite geopolitical risk score per country per year."""
    __tablename__ = "country_risk_scores"

    id = Column(Integer, primary_key=True, index=True)
    country_iso = Column(String(3), ForeignKey("countries.iso_code", ondelete="CASCADE"), nullable=False, index=True)
    year = Column(Integer, nullable=False, index=True)

    # Component scores (0-100, higher = more risk)
    sanctions_score = Column(Float, default=0)  # based on sanctions count & severity
    conflict_score = Column(Float, default=0)   # proximity to conflict zones
    trade_dependency_score = Column(Float, default=0)  # over-reliance on risky corridors
    chokepoint_vulnerability = Column(Float, default=0)  # exposure to stressed chokepoints
    energy_risk_score = Column(Float, default=0)  # energy corridor exposure

    # Composite
    composite_risk = Column(Float, default=0)    # weighted average of all components
    risk_level = Column(String(20), default="low")  # low, moderate, elevated, high, critical

    calculated_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<CountryRiskScore({self.country_iso} {self.year}: {self.risk_level} = {self.composite_risk:.1f})>"


class SupplyChainRoute(Base):
    """Key supply chain routes with vulnerability assessment."""
    __tablename__ = "supply_chain_routes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    origin_iso = Column(String(3), ForeignKey("countries.iso_code", ondelete="SET NULL"), nullable=True)
    destination_iso = Column(String(3), ForeignKey("countries.iso_code", ondelete="SET NULL"), nullable=True)
    commodity = Column(String(100), nullable=True)  # oil, gas, semiconductors, rare_earths, grain, etc.
    chokepoints_transit = Column(Text, nullable=True)  # JSON array of chokepoint names on route
    annual_value_usd = Column(Float, nullable=True)
    vulnerability_score = Column(Float, default=0)  # 0-100
    risk_factors = Column(Text, nullable=True)  # JSON array of risk factors
    alternative_routes = Column(Text, nullable=True)  # JSON description of alternatives
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<SupplyChainRoute({self.name}, vuln={self.vulnerability_score:.0f})>"

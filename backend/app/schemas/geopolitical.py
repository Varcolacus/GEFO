"""
Pydantic schemas for Geopolitical Risk & Sanctions API — Phase 6.
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


# ─── Sanctioned Entity ───

class SanctionedEntityCreate(BaseModel):
    entity_type: str                # country, organisation, vessel, individual
    name: str
    country_iso: Optional[str] = None
    sanctioning_body: str           # UN, EU, US_OFAC, UK_OFSI
    programme: Optional[str] = None
    reason: Optional[str] = None
    date_listed: Optional[datetime] = None
    identifiers: Optional[str] = None  # JSON string


class SanctionedEntityResponse(BaseModel):
    id: int
    entity_type: str
    name: str
    country_iso: Optional[str]
    sanctioning_body: str
    programme: Optional[str]
    reason: Optional[str]
    date_listed: Optional[datetime]
    date_delisted: Optional[datetime]
    is_active: bool

    class Config:
        from_attributes = True


# ─── Conflict Zone ───

class ConflictZoneCreate(BaseModel):
    name: str
    zone_type: str               # armed_conflict, piracy, territorial_dispute, civil_unrest
    severity: str = "moderate"   # low, moderate, high, critical
    lat: float
    lon: float
    radius_km: float = 200
    affected_countries: Optional[str] = None  # JSON array of ISO codes
    affected_chokepoints: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    source: Optional[str] = None


class ConflictZoneResponse(BaseModel):
    id: int
    name: str
    zone_type: str
    severity: str
    lat: float
    lon: float
    radius_km: float
    affected_countries: Optional[str]
    affected_chokepoints: Optional[str]
    description: Optional[str]
    start_date: Optional[datetime]
    end_date: Optional[datetime]
    is_active: bool

    class Config:
        from_attributes = True


# ─── Risk Scores ───

class RiskScoreComponents(BaseModel):
    sanctions: float
    conflict: float
    trade_dependency: float
    chokepoint_vulnerability: float
    energy_risk: float


class CountryRiskResponse(BaseModel):
    iso_code: str
    name: str
    lat: Optional[float]
    lon: Optional[float]
    scores: RiskScoreComponents
    composite_risk: float
    risk_level: str


# ─── Supply Chain ───

class SupplyChainRouteResponse(BaseModel):
    id: Optional[int]
    name: str
    origin_iso: Optional[str]
    destination_iso: Optional[str]
    commodity: Optional[str]
    annual_value_usd: Optional[float]
    chokepoints: list[str]
    vulnerability_score: float
    risk_level: str
    risk_factors: list[str]


# ─── Sanctions Summary ───

class SanctionsSummary(BaseModel):
    total_active: int
    by_sanctioning_body: dict[str, int]
    by_entity_type: dict[str, int]
    most_sanctioned_countries: list[dict]

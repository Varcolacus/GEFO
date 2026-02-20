from pydantic import BaseModel
from typing import Optional, List


# ─── Country Schemas ───

class CountryBase(BaseModel):
    iso_code: str
    name: str
    region: Optional[str] = None
    sub_region: Optional[str] = None


class CountryMacro(CountryBase):
    gdp: Optional[float] = None
    gdp_per_capita: Optional[float] = None
    trade_balance: Optional[float] = None
    current_account: Optional[float] = None
    export_value: Optional[float] = None
    import_value: Optional[float] = None
    population: Optional[float] = None
    centroid_lat: Optional[float] = None
    centroid_lon: Optional[float] = None

    class Config:
        from_attributes = True


class CountryGeoJSON(BaseModel):
    type: str = "Feature"
    properties: CountryMacro
    geometry: Optional[dict] = None


class CountryCollection(BaseModel):
    type: str = "FeatureCollection"
    features: List[CountryGeoJSON]


# ─── Trade Flow Schemas ───

class TradeFlowResponse(BaseModel):
    id: int
    exporter_iso: str
    importer_iso: str
    year: int
    month: Optional[int] = None
    commodity_code: Optional[str] = None
    commodity_description: Optional[str] = None
    trade_value_usd: float
    weight_kg: Optional[float] = None
    flow_type: str
    # Coordinates for visualization (populated from country centroids)
    exporter_lat: Optional[float] = None
    exporter_lon: Optional[float] = None
    importer_lat: Optional[float] = None
    importer_lon: Optional[float] = None

    class Config:
        from_attributes = True


class TradeFlowAggregated(BaseModel):
    exporter_iso: str
    importer_iso: str
    total_value_usd: float
    exporter_lat: Optional[float] = None
    exporter_lon: Optional[float] = None
    importer_lat: Optional[float] = None
    importer_lon: Optional[float] = None


# ─── Port Schemas ───

class PortResponse(BaseModel):
    id: int
    name: str
    country_iso: str
    lat: float
    lon: float
    port_type: Optional[str] = None
    throughput_teu: Optional[float] = None
    throughput_tons: Optional[float] = None
    year: Optional[int] = None
    unlocode: Optional[str] = None

    class Config:
        from_attributes = True


# ─── Shipping Density Schemas ───

class ShippingDensityResponse(BaseModel):
    lat: float
    lon: float
    density_value: float
    year: int
    month: int
    vessel_type: Optional[str] = None
    region_name: Optional[str] = None

    class Config:
        from_attributes = True


class ShippingDensityGrid(BaseModel):
    data: List[ShippingDensityResponse]
    min_density: float
    max_density: float


# ─── Indicator Schemas ───

class IndicatorResponse(BaseModel):
    name: str
    description: str
    value: float
    unit: str
    reference_period: str
    metadata: Optional[dict] = None


class CountryIndicator(BaseModel):
    iso_code: str
    indicator_name: str
    value: Optional[float] = None
    unit: str
    year: int
    description: Optional[str] = None


# ─── Country Profile Schemas ───

class TradePartner(BaseModel):
    iso_code: str
    name: str
    total_value_usd: float
    direction: str  # "export" or "import"

class TradeYearSummary(BaseModel):
    year: int
    total_exports: float
    total_imports: float
    trade_balance: float
    top_export_partner: Optional[str] = None
    top_import_partner: Optional[str] = None

class CountryProfile(BaseModel):
    country: CountryMacro
    top_export_partners: List[TradePartner]
    top_import_partners: List[TradePartner]
    trade_history: List[TradeYearSummary]
    ports: List[PortResponse]

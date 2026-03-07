from pydantic import BaseModel
from typing import Optional, List


# ─── Country Schemas ───

class CountryBase(BaseModel):
    iso_code: str
    name: str
    region: Optional[str] = None
    sub_region: Optional[str] = None


class CountryMacro(CountryBase):
    centroid_lat: Optional[float] = None
    centroid_lon: Optional[float] = None

    # Macro
    gdp: Optional[float] = None
    gdp_per_capita: Optional[float] = None
    gdp_growth: Optional[float] = None
    gdp_per_capita_ppp: Optional[float] = None
    gni: Optional[float] = None
    inflation_cpi: Optional[float] = None

    # Trade
    export_value: Optional[float] = None
    import_value: Optional[float] = None
    trade_balance: Optional[float] = None
    current_account: Optional[float] = None
    trade_pct_gdp: Optional[float] = None
    external_balance_pct_gdp: Optional[float] = None
    high_tech_exports_pct: Optional[float] = None
    merch_exports: Optional[float] = None
    merch_imports: Optional[float] = None

    # Investment & Finance
    fdi_inflows_pct_gdp: Optional[float] = None
    fdi_inflows_usd: Optional[float] = None
    gross_capital_formation_pct: Optional[float] = None
    gross_savings_pct: Optional[float] = None
    total_reserves_usd: Optional[float] = None
    external_debt_pct_gni: Optional[float] = None
    external_debt_usd: Optional[float] = None
    remittances_usd: Optional[float] = None
    broad_money_pct_gdp: Optional[float] = None
    domestic_credit_pct_gdp: Optional[float] = None

    # Fiscal
    govt_revenue_pct_gdp: Optional[float] = None
    govt_expense_pct_gdp: Optional[float] = None
    govt_debt_pct_gdp: Optional[float] = None

    # Demographics & Labor
    population: Optional[float] = None
    urban_population_pct: Optional[float] = None
    unemployment_pct: Optional[float] = None
    labor_force_participation_pct: Optional[float] = None
    life_expectancy: Optional[float] = None
    gini_index: Optional[float] = None
    poverty_headcount_pct: Optional[float] = None
    education_expenditure_pct_gdp: Optional[float] = None

    # Energy & Environment
    energy_use_per_capita: Optional[float] = None
    electricity_access_pct: Optional[float] = None
    co2_per_capita: Optional[float] = None
    renewable_energy_pct: Optional[float] = None
    electric_power_consumption: Optional[float] = None

    # Military & Governance
    military_expenditure_pct_gdp: Optional[float] = None
    military_expenditure_usd: Optional[float] = None
    control_corruption: Optional[float] = None
    govt_effectiveness: Optional[float] = None
    regulatory_quality: Optional[float] = None
    rule_of_law: Optional[float] = None
    political_stability: Optional[float] = None
    voice_accountability: Optional[float] = None

    # Technology
    internet_users_pct: Optional[float] = None
    mobile_subscriptions_per100: Optional[float] = None
    rd_expenditure_pct_gdp: Optional[float] = None
    patent_applications: Optional[float] = None

    # Natural Resources
    natural_resource_rents_pct: Optional[float] = None
    oil_rents_pct: Optional[float] = None
    gas_rents_pct: Optional[float] = None
    mineral_rents_pct: Optional[float] = None
    coal_rents_pct: Optional[float] = None
    forest_rents_pct: Optional[float] = None

    # Economic Structure
    agriculture_pct_gdp: Optional[float] = None
    industry_pct_gdp: Optional[float] = None
    services_pct_gdp: Optional[float] = None
    arable_land_pct: Optional[float] = None

    # Transport
    rail_freight_mtkm: Optional[float] = None
    rail_passengers_mkm: Optional[float] = None
    air_freight_mtkm: Optional[float] = None
    air_passengers: Optional[float] = None
    container_port_traffic: Optional[float] = None

    # Misc
    exchange_rate: Optional[float] = None
    tariff_rate_weighted: Optional[float] = None
    tariff_rate_simple: Optional[float] = None

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


# ─── Airport Schemas ───

class AirportResponse(BaseModel):
    id: int
    iata: Optional[str] = None
    icao: Optional[str] = None
    name: str
    city: Optional[str] = None
    country_iso: str
    lat: float
    lon: float
    elevation_ft: Optional[int] = None
    airport_type: Optional[str] = None
    pax_annual: Optional[float] = None
    runways: Optional[int] = None
    continent: Optional[str] = None

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

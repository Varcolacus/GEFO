from sqlalchemy import Column, Integer, String, Float, Text, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from geoalchemy2 import Geometry
from app.core.database import Base


class Country(Base):
    __tablename__ = "countries"

    id = Column(Integer, primary_key=True, index=True)
    iso_code = Column(String(3), unique=True, nullable=False, index=True)
    iso_code_2 = Column(String(2), unique=True, nullable=True)
    name = Column(String(255), nullable=False)
    name_local = Column(String(255), nullable=True)
    region = Column(String(100))
    sub_region = Column(String(100))
    capital = Column(String(255), nullable=True)
    flag_emoji = Column(String(10), nullable=True)
    income_group = Column(String(50), nullable=True)

    # ── Macro-economic ──
    gdp = Column(Float, nullable=True)
    gdp_per_capita = Column(Float, nullable=True)
    gdp_growth = Column(Float, nullable=True)
    gdp_per_capita_ppp = Column(Float, nullable=True)
    gni = Column(Float, nullable=True)
    inflation_cpi = Column(Float, nullable=True)

    # ── Trade ──
    trade_balance = Column(Float, nullable=True)
    current_account = Column(Float, nullable=True)
    export_value = Column(Float, nullable=True)
    import_value = Column(Float, nullable=True)
    trade_pct_gdp = Column(Float, nullable=True)
    external_balance_pct_gdp = Column(Float, nullable=True)
    high_tech_exports_pct = Column(Float, nullable=True)
    merch_exports = Column(Float, nullable=True)
    merch_imports = Column(Float, nullable=True)

    # ── Investment & Finance ──
    fdi_inflows_pct_gdp = Column(Float, nullable=True)
    fdi_inflows_usd = Column(Float, nullable=True)
    gross_capital_formation_pct = Column(Float, nullable=True)
    gross_savings_pct = Column(Float, nullable=True)
    total_reserves_usd = Column(Float, nullable=True)
    external_debt_pct_gni = Column(Float, nullable=True)
    remittances_usd = Column(Float, nullable=True)
    broad_money_pct_gdp = Column(Float, nullable=True)
    domestic_credit_pct_gdp = Column(Float, nullable=True)

    # ── Fiscal ──
    govt_revenue_pct_gdp = Column(Float, nullable=True)
    govt_expense_pct_gdp = Column(Float, nullable=True)
    govt_debt_pct_gdp = Column(Float, nullable=True)

    # ── Demographics & Labor ──
    population = Column(Float, nullable=True)
    urban_population_pct = Column(Float, nullable=True)
    unemployment_pct = Column(Float, nullable=True)
    labor_force_participation_pct = Column(Float, nullable=True)
    life_expectancy = Column(Float, nullable=True)
    gini_index = Column(Float, nullable=True)
    poverty_headcount_pct = Column(Float, nullable=True)
    education_expenditure_pct_gdp = Column(Float, nullable=True)

    # ── Energy & Environment ──
    energy_use_per_capita = Column(Float, nullable=True)
    electricity_access_pct = Column(Float, nullable=True)
    co2_per_capita = Column(Float, nullable=True)
    renewable_energy_pct = Column(Float, nullable=True)
    electric_power_consumption = Column(Float, nullable=True)

    # ── Military & Governance ──
    military_expenditure_pct_gdp = Column(Float, nullable=True)
    military_expenditure_usd = Column(Float, nullable=True)
    control_corruption = Column(Float, nullable=True)
    govt_effectiveness = Column(Float, nullable=True)
    regulatory_quality = Column(Float, nullable=True)
    rule_of_law = Column(Float, nullable=True)
    political_stability = Column(Float, nullable=True)
    voice_accountability = Column(Float, nullable=True)

    # ── Technology ──
    internet_users_pct = Column(Float, nullable=True)
    mobile_subscriptions_per100 = Column(Float, nullable=True)
    rd_expenditure_pct_gdp = Column(Float, nullable=True)
    patent_applications = Column(Float, nullable=True)

    # ── Natural Resources ──
    natural_resource_rents_pct = Column(Float, nullable=True)
    oil_rents_pct = Column(Float, nullable=True)
    gas_rents_pct = Column(Float, nullable=True)
    mineral_rents_pct = Column(Float, nullable=True)
    coal_rents_pct = Column(Float, nullable=True)
    forest_rents_pct = Column(Float, nullable=True)

    # ── Structure ──
    agriculture_pct_gdp = Column(Float, nullable=True)
    industry_pct_gdp = Column(Float, nullable=True)
    services_pct_gdp = Column(Float, nullable=True)
    arable_land_pct = Column(Float, nullable=True)

    # ── Misc ──
    exchange_rate = Column(Float, nullable=True)
    tariff_rate_weighted = Column(Float, nullable=True)
    tariff_rate_simple = Column(Float, nullable=True)
    external_debt_usd = Column(Float, nullable=True)

    # ── Geo ──
    geometry = Column(Geometry("MULTIPOLYGON", srid=4326), nullable=True)
    centroid_lat = Column(Float, nullable=True)
    centroid_lon = Column(Float, nullable=True)

    def __repr__(self):
        return f"<Country(iso_code={self.iso_code}, name={self.name})>"

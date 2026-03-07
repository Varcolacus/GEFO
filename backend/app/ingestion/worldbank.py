"""
World Bank API Data Ingestion Script
Fetches 63 macroeconomic/geoeconomic indicators for all countries.
Free API, no key required.
"""
import httpx
import logging
import time
import argparse
from typing import List, Dict
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.database import SessionLocal
from app.models.country import Country
from app.models.country_indicator import CountryIndicator

logger = logging.getLogger(__name__)

WORLD_BANK_URL = "https://api.worldbank.org/v2"

# World Bank indicator codes mapped to Country model field names
# Format: {db_column: (wb_indicator_code, description)}
INDICATORS = {
    # Macro
    "gdp":                          ("NY.GDP.MKTP.CD",       "GDP (current US$)"),
    "gdp_per_capita":               ("NY.GDP.PCAP.CD",       "GDP per capita (current US$)"),
    "gdp_growth":                   ("NY.GDP.MKTP.KD.ZG",    "GDP growth (annual %)"),
    "gdp_per_capita_ppp":           ("NY.GDP.PCAP.PP.CD",    "GDP per capita, PPP (current intl $)"),
    "gni":                          ("NY.GNP.MKTP.CD",       "GNI (current US$)"),
    "inflation_cpi":                ("FP.CPI.TOTL.ZG",       "Inflation, consumer prices (annual %)"),

    # Trade
    "export_value":                 ("NE.EXP.GNFS.CD",       "Exports of goods and services (current US$)"),
    "import_value":                 ("NE.IMP.GNFS.CD",       "Imports of goods and services (current US$)"),
    "current_account":              ("BN.CAB.XOKA.CD",       "Current account balance (BoP, current US$)"),
    "trade_pct_gdp":                ("NE.TRD.GNFS.ZS",       "Trade (% of GDP)"),
    "external_balance_pct_gdp":     ("NE.RSB.GNFS.ZS",       "External balance on goods and services (% of GDP)"),
    "high_tech_exports_pct":        ("TX.VAL.TECH.MF.ZS",    "High-technology exports (% of manufactured exports)"),
    "merch_exports":                ("BX.GSR.MRCH.CD",       "Merchandise exports (current US$)"),
    "merch_imports":                ("BM.GSR.MRCH.CD",       "Merchandise imports (current US$)"),

    # Investment & Finance
    "fdi_inflows_pct_gdp":          ("BX.KLT.DINV.WD.GD.ZS", "FDI net inflows (% of GDP)"),
    "fdi_inflows_usd":              ("BX.KLT.DINV.CD.WD",    "FDI net inflows (BoP, current US$)"),
    "gross_capital_formation_pct":  ("NE.GDI.TOTL.ZS",       "Gross capital formation (% of GDP)"),
    "gross_savings_pct":            ("NY.GNS.ICTR.ZS",       "Gross savings (% of GDP)"),
    "total_reserves_usd":           ("BN.RES.INCL.CD",       "Total reserves incl gold (current US$)"),
    "external_debt_pct_gni":        ("DT.DOD.DECT.GN.ZS",    "External debt stocks (% of GNI)"),
    "external_debt_usd":            ("DT.DOD.DECT.CD",        "External debt stocks (current US$)"),
    "remittances_usd":              ("BX.TRF.PWKR.CD.DT",    "Personal remittances received (current US$)"),
    "broad_money_pct_gdp":          ("FM.LBL.BMNY.GD.ZS",    "Broad money (% of GDP)"),
    "domestic_credit_pct_gdp":      ("FS.AST.PRVT.GD.ZS",    "Domestic credit to private sector (% of GDP)"),

    # Fiscal
    "govt_revenue_pct_gdp":         ("GC.REV.XGRT.GD.ZS",    "Revenue, excluding grants (% of GDP)"),
    "govt_expense_pct_gdp":         ("GC.XPN.TOTL.GD.ZS",    "Expense (% of GDP)"),
    "govt_debt_pct_gdp":            ("GC.DOD.TOTL.GD.ZS",    "Central government debt (% of GDP)"),

    # Demographics & Labor
    "population":                   ("SP.POP.TOTL",           "Population, total"),
    "urban_population_pct":         ("SP.URB.TOTL.IN.ZS",    "Urban population (% of total)"),
    "unemployment_pct":             ("SL.UEM.TOTL.ZS",       "Unemployment (% of labor force)"),
    "labor_force_participation_pct":("SL.TLF.CACT.ZS",       "Labor force participation rate (% of pop 15+)"),
    "life_expectancy":              ("SP.DYN.LE00.IN",        "Life expectancy at birth (years)"),
    "gini_index":                   ("SI.POV.GINI",           "GINI index"),
    "poverty_headcount_pct":        ("SI.POV.DDAY",           "Poverty headcount at $2.15/day (%)"),
    "education_expenditure_pct_gdp":("SE.XPD.TOTL.GD.ZS",    "Education expenditure (% of GDP)"),

    # Energy & Environment
    "energy_use_per_capita":        ("EG.USE.PCAP.KG.OE",    "Energy use (kg oil eq per capita)"),
    "electricity_access_pct":       ("EG.ELC.ACCS.ZS",       "Access to electricity (%)"),
    "co2_per_capita":               ("EN.GHG.CO2.PC.CE.AR5",  "CO2 emissions per capita (t CO2e/capita)"),
    "renewable_energy_pct":         ("EG.FEC.RNEW.ZS",       "Renewable energy (% of total)"),
    "electric_power_consumption":   ("EG.USE.ELEC.KH.PC",    "Electric power consumption (kWh per capita)"),

    # Military & Governance
    "military_expenditure_pct_gdp": ("MS.MIL.XPND.GD.ZS",    "Military expenditure (% of GDP)"),
    "military_expenditure_usd":     ("MS.MIL.XPND.CD",        "Military expenditure (current US$)"),
    "control_corruption":           ("CC.EST",                "Control of Corruption"),
    "govt_effectiveness":           ("GE.EST",                "Government Effectiveness"),
    "regulatory_quality":           ("RQ.EST",                "Regulatory Quality"),
    "rule_of_law":                  ("RL.EST",                "Rule of Law"),
    "political_stability":          ("PV.EST",                "Political Stability"),
    "voice_accountability":         ("VA.EST",                "Voice and Accountability"),

    # Technology
    "internet_users_pct":           ("IT.NET.USER.ZS",        "Internet users (% of population)"),
    "mobile_subscriptions_per100":  ("IT.CEL.SETS.P2",        "Mobile subscriptions (per 100 people)"),
    "rd_expenditure_pct_gdp":       ("GB.XPD.RSDV.GD.ZS",    "R&D expenditure (% of GDP)"),
    "patent_applications":          ("IP.PAT.RESD",           "Patent applications, residents"),

    # Natural Resources
    "natural_resource_rents_pct":   ("NY.GDP.TOTL.RT.ZS",    "Total natural resource rents (% of GDP)"),
    "oil_rents_pct":                ("NY.GDP.PETR.RT.ZS",    "Oil rents (% of GDP)"),
    "gas_rents_pct":                ("NY.GDP.NGAS.RT.ZS",    "Natural gas rents (% of GDP)"),
    "mineral_rents_pct":            ("NY.GDP.MINR.RT.ZS",    "Mineral rents (% of GDP)"),
    "coal_rents_pct":               ("NY.GDP.COAL.RT.ZS",    "Coal rents (% of GDP)"),
    "forest_rents_pct":             ("NY.GDP.FRST.RT.ZS",    "Forest rents (% of GDP)"),

    # Economic Structure
    "agriculture_pct_gdp":          ("NV.AGR.TOTL.ZS",       "Agriculture value added (% of GDP)"),
    "industry_pct_gdp":             ("NV.IND.TOTL.ZS",       "Industry value added (% of GDP)"),
    "services_pct_gdp":             ("NV.SRV.TOTL.ZS",       "Services value added (% of GDP)"),
    "arable_land_pct":              ("AG.LND.ARBL.ZS",       "Arable land (% of land area)"),

    # Transport
    "rail_freight_mtkm":            ("IS.RRS.GOOD.MT.K6",    "Rail freight (million ton-km)"),
    "rail_passengers_mkm":          ("IS.RRS.PASG.KM",       "Rail passengers (million passenger-km)"),
    "air_freight_mtkm":             ("IS.AIR.GOOD.MT.K1",    "Air freight (million ton-km)"),
    "air_passengers":               ("IS.AIR.PSGR",          "Air passengers carried"),
    "container_port_traffic":       ("IS.SHP.GOOD.TU",       "Container port traffic (TEU)"),

    # Misc
    "exchange_rate":                ("PA.NUS.FCRF",           "Official exchange rate (LCU per US$)"),
    "tariff_rate_weighted":         ("TM.TAX.MRCH.WM.AR.ZS", "Tariff rate, weighted mean (%)"),
    "tariff_rate_simple":           ("TM.TAX.MRCH.SM.AR.ZS", "Tariff rate, simple mean (%)"),
}


def fetch_indicator(indicator_code: str, year_range: str = "2020:2023", per_page: int = 20000) -> List[dict]:
    """Fetch a single indicator for all countries from World Bank API.
    Handles pagination automatically.
    """
    url = f"{WORLD_BANK_URL}/country/all/indicator/{indicator_code}"
    params = {"date": year_range, "format": "json", "per_page": per_page}
    all_records = []

    try:
        with httpx.Client(timeout=60.0) as client:
            page = 1
            while True:
                params["page"] = page
                response = client.get(url, params=params)
                response.raise_for_status()
                data = response.json()
                if isinstance(data, list) and len(data) > 1:
                    records = data[1]
                    all_records.extend(records)
                    total_pages = data[0].get("pages", 1)
                    if page >= total_pages:
                        break
                    page += 1
                    time.sleep(0.3)
                else:
                    break
    except Exception as e:
        logger.error(f"Error fetching {indicator_code}: {e}")

    return all_records


def build_country_data(year: int = 2023) -> Dict[str, dict]:
    """
    Fetch all indicators and assemble into country-level dict.
    Uses a 4-year window to maximize coverage, keeping most recent value.
    """
    country_data: Dict[str, dict] = {}
    year_range = f"{year - 3}:{year}"
    total = len(INDICATORS)

    for idx, (field_name, (indicator_code, description)) in enumerate(INDICATORS.items(), 1):
        logger.info(f"[{idx}/{total}] Fetching {field_name} ({indicator_code})...")
        records = fetch_indicator(indicator_code, year_range)

        # Keep most recent value per country
        best: Dict[str, tuple] = {}
        for record in records:
            iso = record.get("countryiso3code", "")
            value = record.get("value")
            rec_year = int(record.get("date", "0"))

            if not iso or len(iso) != 3 or value is None:
                continue

            if iso not in best or rec_year > best[iso][0]:
                best[iso] = (rec_year, value)

        for iso, (_, value) in best.items():
            if iso not in country_data:
                country_data[iso] = {}
            country_data[iso][field_name] = value

        logger.info(f"  -> {len(best)} countries with data")

        # Small delay every 10 requests to be polite
        if idx % 10 == 0:
            time.sleep(0.5)

    return country_data


def ingest_world_bank_data(year: int = 2023):
    """Ingest World Bank macroeconomic data into countries table."""
    db = SessionLocal()

    try:
        country_data = build_country_data(year)
        count = 0

        for iso_code, data in country_data.items():
            if len(iso_code) != 3:
                continue

            country = db.query(Country).filter(Country.iso_code == iso_code).first()
            if not country:
                continue

            # Compute derived trade_balance
            exports = data.get("export_value", 0) or 0
            imports = data.get("import_value", 0) or 0
            if exports or imports:
                data["trade_balance"] = exports - imports

            # Set all indicator fields
            for field_name, value in data.items():
                if hasattr(country, field_name):
                    setattr(country, field_name, value)

            count += 1

        db.commit()
        logger.info(f"World Bank ingestion complete. Updated {count} countries with {len(INDICATORS)} indicators.")

    finally:
        db.close()

    return count


def ingest_world_bank_historical(start_year: int = 1960, end_year: int = 2024):
    """Ingest World Bank data for ALL years into country_indicators table."""
    from app.core.database import engine
    from app.models.country_indicator import CountryIndicator
    CountryIndicator.__table__.create(engine, checkfirst=True)

    db = SessionLocal()
    year_range = f"{start_year}:{end_year}"

    try:
        # Get valid ISO codes from our DB
        valid_isos = {c.iso_code for c in db.query(Country.iso_code).all()}
        logger.info(f"Fetching {len(INDICATORS)} indicators for years {start_year}-{end_year} ({len(valid_isos)} countries)")

        total_rows = 0
        total_indicators = len(INDICATORS)

        for idx, (field_name, (indicator_code, description)) in enumerate(INDICATORS.items(), 1):
            logger.info(f"[{idx}/{total_indicators}] Fetching {field_name} ({indicator_code}) {year_range}...")
            records = fetch_indicator(indicator_code, year_range)

            batch = []
            for record in records:
                iso = record.get("countryiso3code", "")
                value = record.get("value")
                rec_year = record.get("date", "")

                if not iso or len(iso) != 3 or value is None or not rec_year:
                    continue
                if iso not in valid_isos:
                    continue

                try:
                    year_int = int(rec_year)
                except ValueError:
                    continue

                batch.append({
                    "iso_code": iso,
                    "year": year_int,
                    "indicator": field_name,
                    "value": float(value),
                })

            if batch:
                # Upsert in chunks
                for i in range(0, len(batch), 1000):
                    chunk = batch[i:i+1000]
                    stmt = pg_insert(CountryIndicator).values(chunk)
                    stmt = stmt.on_conflict_do_update(
                        constraint="uq_country_year_indicator",
                        set_={"value": stmt.excluded.value},
                    )
                    db.execute(stmt)
                db.commit()
                total_rows += len(batch)
                logger.info(f"  -> {len(batch)} data points stored")
            else:
                logger.info(f"  -> 0 data points")

            # Be polite
            if idx % 5 == 0:
                time.sleep(0.5)

        logger.info(f"Historical ingestion complete. {total_rows:,} total data points across {total_indicators} indicators.")

    finally:
        db.close()

    return total_rows


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description="Fetch World Bank indicators")
    parser.add_argument("--historical", action="store_true",
                        help="Fetch all years (1960-2024) into country_indicators table")
    parser.add_argument("--start-year", type=int, default=1960,
                        help="Start year for historical fetch (default: 1960)")
    parser.add_argument("--end-year", type=int, default=2024,
                        help="End year for historical fetch (default: 2024)")
    parser.add_argument("--year", type=int, default=2023,
                        help="Year for snapshot ingestion (default: 2023)")
    args = parser.parse_args()

    if args.historical:
        ingest_world_bank_historical(args.start_year, args.end_year)
    else:
        ingest_world_bank_data(args.year)

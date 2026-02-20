"""
World Bank API Data Ingestion Script
Fetches macroeconomic indicators for all countries.
Free API, no key required.
"""
import httpx
import logging
from typing import Optional, List, Dict
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.country import Country

logger = logging.getLogger(__name__)

WORLD_BANK_URL = "https://api.worldbank.org/v2"

# World Bank indicator codes
INDICATORS = {
    "gdp": "NY.GDP.MKTP.CD",             # GDP (current US$)
    "gdp_per_capita": "NY.GDP.PCAP.CD",  # GDP per capita (current US$)
    "exports": "NE.EXP.GNFS.CD",         # Exports of goods and services (current US$)
    "imports": "NE.IMP.GNFS.CD",          # Imports of goods and services (current US$)
    "current_account": "BN.CAB.XOKA.CD",  # Current account balance (BoP, current US$)
    "population": "SP.POP.TOTL",          # Population, total
    "trade_pct_gdp": "NE.TRD.GNFS.ZS",   # Trade (% of GDP)
}


def fetch_indicator(indicator_code: str, year: int, per_page: int = 300) -> List[dict]:
    """
    Fetch a single indicator for all countries from World Bank API.
    """
    url = f"{WORLD_BANK_URL}/country/all/indicator/{indicator_code}"
    params = {
        "date": str(year),
        "format": "json",
        "per_page": per_page,
    }

    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.get(url, params=params)
            response.raise_for_status()
            data = response.json()

            if isinstance(data, list) and len(data) > 1:
                records = data[1]
                logger.info(f"Fetched {len(records)} records for {indicator_code}/{year}")
                return records
            else:
                logger.warning(f"Unexpected response format for {indicator_code}")
                return []

    except Exception as e:
        logger.error(f"Error fetching {indicator_code}: {e}")
        return []


def build_country_data(year: int) -> Dict[str, dict]:
    """
    Fetch all indicators and assemble into country-level dict.
    Returns: {iso_code: {gdp: ..., exports: ..., ...}}
    """
    country_data: Dict[str, dict] = {}

    for field_name, indicator_code in INDICATORS.items():
        logger.info(f"Fetching {field_name} ({indicator_code}) for {year}...")
        records = fetch_indicator(indicator_code, year)

        for record in records:
            iso = record.get("countryiso3code", "")
            value = record.get("value")

            if not iso or value is None:
                continue

            if iso not in country_data:
                country_data[iso] = {"name": record.get("country", {}).get("value", "")}

            country_data[iso][field_name] = value

    return country_data


def ingest_world_bank_data(year: int = 2023):
    """
    Ingest World Bank macroeconomic data into countries table.
    """
    db = SessionLocal()

    try:
        country_data = build_country_data(year)
        count = 0

        for iso_code, data in country_data.items():
            if len(iso_code) != 3:
                continue

            # Check if country exists
            country = db.query(Country).filter(Country.iso_code == iso_code).first()

            exports = data.get("exports", 0) or 0
            imports = data.get("imports", 0) or 0
            trade_balance = exports - imports

            if country:
                # Update existing
                country.gdp = data.get("gdp")
                country.gdp_per_capita = data.get("gdp_per_capita")
                country.trade_balance = trade_balance if exports or imports else None
                country.current_account = data.get("current_account")
                country.export_value = exports or None
                country.import_value = imports or None
                country.population = data.get("population")
            else:
                # Create new
                country = Country(
                    iso_code=iso_code,
                    name=data.get("name", iso_code),
                    gdp=data.get("gdp"),
                    gdp_per_capita=data.get("gdp_per_capita"),
                    trade_balance=trade_balance if exports or imports else None,
                    current_account=data.get("current_account"),
                    export_value=exports or None,
                    import_value=imports or None,
                    population=data.get("population"),
                )
                db.add(country)

            count += 1

        db.commit()
        logger.info(f"World Bank ingestion complete. Updated {count} countries for {year}.")

    finally:
        db.close()

    return count


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    ingest_world_bank_data(2023)

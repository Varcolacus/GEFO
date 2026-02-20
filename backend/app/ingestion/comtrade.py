"""
UN Comtrade Data Ingestion Script
Fetches bilateral trade data from UN Comtrade API.
Free tier: 100 requests/hour, limited data range.
"""
import httpx
import logging
import time
from typing import Optional, List
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.trade_flow import TradeFlow

logger = logging.getLogger(__name__)

# UN Comtrade API v1 (public/free)
COMTRADE_BASE_URL = "https://comtradeapi.un.org/public/v1/preview/C/A/HS"


def fetch_comtrade_data(
    reporter_code: str,
    year: int,
    flow_code: str = "X",  # X=export, M=import
    partner_code: str = "0",  # 0 = World (all partners)
    max_records: int = 500,
) -> List[dict]:
    """
    Fetch trade data from UN Comtrade API.
    
    Args:
        reporter_code: UN M49 country code (e.g., "842" for USA)
        year: Year of data
        flow_code: "X" for exports, "M" for imports
        partner_code: Partner country code ("0" for all)
        max_records: Maximum records to return
    """
    params = {
        "reporterCode": reporter_code,
        "period": str(year),
        "flowCode": flow_code,
        "partnerCode": partner_code,
        "maxRecords": max_records,
    }

    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.get(COMTRADE_BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

            if "data" in data:
                logger.info(f"Fetched {len(data['data'])} records for {reporter_code}/{year}")
                return data["data"]
            else:
                logger.warning(f"No data key in response for {reporter_code}/{year}")
                return []

    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error fetching Comtrade data: {e}")
        return []
    except Exception as e:
        logger.error(f"Error fetching Comtrade data: {e}")
        return []


# Mapping of ISO3 to UN M49 codes (major economies)
ISO3_TO_M49 = {
    "USA": "842", "CHN": "156", "DEU": "276", "JPN": "392",
    "GBR": "826", "FRA": "250", "IND": "356", "ITA": "380",
    "BRA": "076", "CAN": "124", "KOR": "410", "RUS": "643",
    "AUS": "036", "ESP": "724", "MEX": "484", "IDN": "360",
    "NLD": "528", "SAU": "682", "TUR": "792", "CHE": "756",
    "SGP": "702", "ARE": "784", "NGA": "566", "ZAF": "710",
    "EGY": "818", "ARG": "032", "COL": "170", "THA": "764",
    "MYS": "458", "VNM": "704", "PHL": "608", "CHL": "152",
    "NOR": "578", "SWE": "752", "POL": "616", "BEL": "056",
}


def ingest_comtrade_for_country(iso_code: str, year: int, db: Session):
    """Ingest bilateral trade flows for a single country."""
    m49_code = ISO3_TO_M49.get(iso_code)
    if not m49_code:
        logger.warning(f"No M49 code for {iso_code}, skipping")
        return 0

    records = fetch_comtrade_data(
        reporter_code=m49_code,
        year=year,
        flow_code="X",
        max_records=500,
    )

    count = 0
    for record in records:
        try:
            partner_iso = record.get("partner2ISO", "")
            if not partner_iso or partner_iso == "W00":  # Skip "World" aggregate
                continue

            flow = TradeFlow(
                exporter_iso=iso_code,
                importer_iso=partner_iso,
                year=year,
                commodity_code=record.get("cmdCode", "TOTAL"),
                commodity_description=record.get("cmdDesc", ""),
                trade_value_usd=record.get("primaryValue", 0),
                weight_kg=record.get("netWgt", None),
                flow_type="export",
            )
            db.add(flow)
            count += 1
        except Exception as e:
            logger.error(f"Error processing record: {e}")

    db.commit()
    logger.info(f"Ingested {count} trade flows for {iso_code}/{year}")
    return count


def run_comtrade_ingestion(year: int = 2023):
    """
    Run full Comtrade ingestion for all mapped countries.
    Respects API rate limits (100 req/hour).
    """
    db = SessionLocal()
    total = 0

    try:
        for iso_code in ISO3_TO_M49:
            logger.info(f"Ingesting {iso_code} for {year}...")
            count = ingest_comtrade_for_country(iso_code, year, db)
            total += count
            time.sleep(40)  # Rate limit: ~100 req/hour = 1 every 36 sec

        logger.info(f"Comtrade ingestion complete. Total records: {total}")
    finally:
        db.close()

    return total


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_comtrade_ingestion(2023)

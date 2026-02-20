"""
UN Comtrade Data Ingestion Script
Fetches bilateral trade data from UN Comtrade API.

Supports both:
  - Public API (no key): 100 requests/hour, limited data
  - Subscription API (key): higher limits, more data

Usage:
  python -m app.ingestion.comtrade              # defaults: year=2023, public API
  python -m app.ingestion.comtrade --year 2022
  python -m app.ingestion.comtrade --year 2023 --countries USA,CHN,DEU
"""
import httpx
import logging
import time
import argparse
from typing import Optional, List, Dict
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.core.database import SessionLocal
from app.core.config import settings
from app.models.trade_flow import TradeFlow
from app.models.country import Country

logger = logging.getLogger("gefo.ingestion.comtrade")

# UN Comtrade API v1 (public/free)
COMTRADE_PUBLIC_URL = "https://comtradeapi.un.org/public/v1/preview/C/A/HS"
# Subscription API (requires key)
COMTRADE_SUB_URL = "https://comtradeapi.un.org/data/v1/get/C/A/HS"


def fetch_comtrade_data(
    reporter_code: str,
    year: int,
    flow_code: str = "X",  # X=export, M=import
    partner_code: str = "0",  # 0 = World (all partners)
    max_records: int = 500,
    api_key: Optional[str] = None,
) -> List[dict]:
    """
    Fetch trade data from UN Comtrade API.

    Args:
        reporter_code: UN M49 country code (e.g., "842" for USA)
        year: Year of data
        flow_code: "X" for exports, "M" for imports
        partner_code: Partner country code ("0" for all)
        max_records: Maximum records to return
        api_key: Optional subscription API key
    """
    if api_key:
        base_url = COMTRADE_SUB_URL
        headers = {"Ocp-Apim-Subscription-Key": api_key}
    else:
        base_url = COMTRADE_PUBLIC_URL
        headers = {}

    params = {
        "reporterCode": reporter_code,
        "period": str(year),
        "flowCode": flow_code,
        "partnerCode": partner_code,
        "maxRecords": max_records,
    }

    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.get(base_url, params=params, headers=headers)

            if response.status_code == 429:
                retry_after = int(response.headers.get("Retry-After", 60))
                logger.warning(f"Rate limited. Waiting {retry_after}s…")
                time.sleep(retry_after)
                response = client.get(base_url, params=params, headers=headers)

            response.raise_for_status()
            data = response.json()

            if "data" in data:
                logger.info(f"Fetched {len(data['data'])} records for M49={reporter_code} / {year}")
                return data["data"]
            else:
                logger.warning(f"No 'data' key in response for M49={reporter_code} / {year}")
                return []

    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP {e.response.status_code} fetching Comtrade data: {e}")
        return []
    except httpx.ConnectError:
        logger.error(f"Connection failed to Comtrade API — check internet")
        return []
    except Exception as e:
        logger.error(f"Unexpected error fetching Comtrade data: {e}")
        return []


# ─── ISO3 → UN M49 mapping (comprehensive — 60+ countries) ───

ISO3_TO_M49: Dict[str, str] = {
    # North America
    "USA": "842", "CAN": "124", "MEX": "484",
    # Europe
    "DEU": "276", "GBR": "826", "FRA": "250", "ITA": "380",
    "ESP": "724", "NLD": "528", "CHE": "756", "BEL": "056",
    "POL": "616", "SWE": "752", "NOR": "578", "AUT": "040",
    "IRL": "372", "DNK": "208", "FIN": "246", "PRT": "620",
    "CZE": "203", "ROU": "642", "GRC": "300", "HUN": "348",
    # Asia-Pacific
    "CHN": "156", "JPN": "392", "KOR": "410", "IND": "356",
    "IDN": "360", "SGP": "702", "THA": "764", "MYS": "458",
    "VNM": "704", "PHL": "608", "AUS": "036", "NZL": "554",
    "TWN": "158", "HKG": "344", "BGD": "050", "PAK": "586",
    # Middle East
    "SAU": "682", "ARE": "784", "TUR": "792", "ISR": "376",
    "QAT": "634", "KWT": "414", "OMN": "512", "IRQ": "368",
    "IRN": "364",
    # Africa
    "NGA": "566", "ZAF": "710", "EGY": "818", "KEN": "404",
    "ETH": "231", "GHA": "288", "TZA": "834", "MAR": "504",
    "DZA": "012", "AGO": "024",
    # South America
    "BRA": "076", "ARG": "032", "COL": "170", "CHL": "152",
    "PER": "604", "VEN": "862", "ECU": "218", "URY": "858",
    # Russia & CIS
    "RUS": "643", "KAZ": "398", "UKR": "804",
}


def upsert_trade_flow(db: Session, flow: TradeFlow):
    """Insert or update a trade flow record (avoid duplicates)."""
    existing = db.query(TradeFlow).filter(
        and_(
            TradeFlow.exporter_iso == flow.exporter_iso,
            TradeFlow.importer_iso == flow.importer_iso,
            TradeFlow.year == flow.year,
            TradeFlow.commodity_code == flow.commodity_code,
            TradeFlow.flow_type == flow.flow_type,
        )
    ).first()

    if existing:
        existing.trade_value_usd = flow.trade_value_usd
        existing.weight_kg = flow.weight_kg
    else:
        db.add(flow)


def ingest_comtrade_for_country(
    iso_code: str,
    year: int,
    db: Session,
    api_key: Optional[str] = None,
) -> int:
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
        api_key=api_key,
    )

    count = 0
    for record in records:
        try:
            partner_iso = record.get("partner2ISO", "")
            if not partner_iso or partner_iso == "W00":  # Skip "World" aggregate
                continue

            # Validate partner exists in our DB
            trade_value = record.get("primaryValue", 0)
            if not trade_value or trade_value <= 0:
                continue

            flow = TradeFlow(
                exporter_iso=iso_code,
                importer_iso=partner_iso,
                year=year,
                commodity_code=record.get("cmdCode", "TOTAL"),
                commodity_description=record.get("cmdDesc", ""),
                trade_value_usd=trade_value,
                weight_kg=record.get("netWgt", None),
                flow_type="export",
            )
            upsert_trade_flow(db, flow)
            count += 1
        except Exception as e:
            logger.error(f"Error processing record: {e}")

    db.commit()
    logger.info(f"Ingested {count} trade flows for {iso_code}/{year}")
    return count


def run_comtrade_ingestion(
    year: int = 2023,
    countries: Optional[List[str]] = None,
    api_key: Optional[str] = None,
) -> int:
    """
    Run full Comtrade ingestion for mapped countries.
    Respects API rate limits (100 req/hour for public, higher for subscription).

    Args:
        year: Data year to fetch
        countries: Optional list of ISO3 codes to fetch (default: all mapped)
        api_key: Optional subscription API key
    """
    db = SessionLocal()
    total = 0
    api_key = api_key or getattr(settings, "un_comtrade_api_key", "") or None

    target_countries = countries or list(ISO3_TO_M49.keys())
    delay = 10 if api_key else 40  # Rate limit: public ~100/hr, sub ~higher

    logger.info(f"Starting Comtrade ingestion: year={year}, countries={len(target_countries)}, "
                f"api={'subscription' if api_key else 'public'}")

    try:
        for i, iso_code in enumerate(target_countries):
            logger.info(f"[{i+1}/{len(target_countries)}] Ingesting {iso_code} for {year}…")
            try:
                count = ingest_comtrade_for_country(iso_code, year, db, api_key)
                total += count
            except Exception as e:
                logger.error(f"Failed ingesting {iso_code}: {e}")

            if i < len(target_countries) - 1:
                time.sleep(delay)

        logger.info(f"Comtrade ingestion complete. Total records: {total}")
    finally:
        db.close()

    return total


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(name)-25s | %(levelname)-7s | %(message)s",
    )

    parser = argparse.ArgumentParser(description="GEFO UN Comtrade Ingestion")
    parser.add_argument("--year", type=int, default=2023, help="Year to fetch (default: 2023)")
    parser.add_argument("--countries", type=str, default=None,
                        help="Comma-separated ISO3 codes (default: all mapped)")
    parser.add_argument("--api-key", type=str, default=None,
                        help="UN Comtrade subscription API key")
    args = parser.parse_args()

    country_list = args.countries.split(",") if args.countries else None
    run_comtrade_ingestion(year=args.year, countries=country_list, api_key=args.api_key)

"""
External data source connectors — Phase 9.

Provides fetch adapters for:
  1. UN Comtrade API (trade flows)
  2. World Bank API (country macro indicators)
  3. Generic REST API connector

Each connector returns (columns, rows) matching the import engine interface.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models.import_job import DataSource

logger = logging.getLogger("gefo.connectors")


# ═══════════════════════════════════════════════════════════════════
#  1. UN COMTRADE (Trade Flows)
# ═══════════════════════════════════════════════════════════════════

class ComtradeConnector:
    """
    UN Comtrade API v1 connector.

    Fetches bilateral trade data and maps to GEFO trade_flows schema.
    API docs: https://comtradeapi.un.org/
    """

    BASE_URL = "https://comtradeapi.un.org/data/v1/get/C/A"

    COLUMN_MAP = {
        "reporterISO": "exporter_iso",
        "partnerISO": "importer_iso",
        "period": "year",
        "cmdCode": "commodity_code",
        "cmdDesc": "commodity_description",
        "primaryValue": "trade_value_usd",
        "netWgt": "weight_kg",
        "flowDesc": "flow_type",
    }

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key

    def fetch(
        self,
        reporter_iso: str = "USA",
        partner_iso: str = "all",
        year: int = 2022,
        flow: str = "X",  # X=export, M=import
        commodity: str = "TOTAL",
    ) -> Tuple[List[str], List[Dict[str, Any]]]:
        """
        Fetch trade data from Comtrade.

        NOTE: This is a stub — full implementation requires a valid API key
        and proper rate limiting. Returns mock structure for testing.
        """
        try:
            import urllib.request
            import json

            params = {
                "reporterCode": reporter_iso,
                "partnerCode": partner_iso,
                "period": str(year),
                "flowCode": flow,
                "cmdCode": commodity,
            }
            query = "&".join(f"{k}={v}" for k, v in params.items())
            url = f"{self.BASE_URL}?{query}"

            if self.api_key:
                headers = {"Ocp-Apim-Subscription-Key": self.api_key}
                req = urllib.request.Request(url, headers=headers)
            else:
                req = urllib.request.Request(url)

            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())

            records = data.get("data", [])
            if not records:
                logger.warning("Comtrade returned no data for %s/%s/%d", reporter_iso, partner_iso, year)
                return [], []

            # Map columns
            columns = list(self.COLUMN_MAP.values())
            rows = []
            for rec in records:
                row = {}
                for api_col, db_col in self.COLUMN_MAP.items():
                    val = rec.get(api_col)
                    if db_col == "flow_type" and isinstance(val, str):
                        val = "export" if "export" in val.lower() else "import"
                    row[db_col] = val
                rows.append(row)

            return columns, rows

        except Exception as e:
            logger.error("Comtrade fetch error: %s", e)
            return [], []


# ═══════════════════════════════════════════════════════════════════
#  2. WORLD BANK (Country Indicators)
# ═══════════════════════════════════════════════════════════════════

class WorldBankConnector:
    """
    World Bank Open Data API connector.

    Fetches country-level indicators (GDP, population, trade balance).
    API docs: https://datahelpdesk.worldbank.org/knowledgebase/articles/889392
    """

    BASE_URL = "https://api.worldbank.org/v2"

    INDICATORS = {
        "NY.GDP.MKTP.CD": "gdp",
        "NY.GDP.PCAP.CD": "gdp_per_capita",
        "SP.POP.TOTL": "population",
        "NE.EXP.GNFS.CD": "export_value",
        "NE.IMP.GNFS.CD": "import_value",
        "BN.CAB.XOKA.CD": "current_account",
    }

    def fetch(
        self,
        indicator: str = "NY.GDP.MKTP.CD",
        year: int = 2022,
        per_page: int = 300,
    ) -> Tuple[List[str], List[Dict[str, Any]]]:
        """Fetch indicator data from World Bank API."""
        try:
            import urllib.request
            import json

            db_field = self.INDICATORS.get(indicator, indicator)
            url = (
                f"{self.BASE_URL}/country/all/indicator/{indicator}"
                f"?date={year}&format=json&per_page={per_page}"
            )

            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())

            if not data or len(data) < 2 or not data[1]:
                logger.warning("World Bank returned no data for %s/%d", indicator, year)
                return [], []

            records = data[1]
            columns = ["iso_code", db_field]
            rows = []
            for rec in records:
                iso = rec.get("countryiso3code", "")
                value = rec.get("value")
                if iso and len(iso) == 3 and value is not None:
                    rows.append({"iso_code": iso, db_field: float(value)})

            return columns, rows

        except Exception as e:
            logger.error("World Bank fetch error: %s", e)
            return [], []


# ═══════════════════════════════════════════════════════════════════
#  3. CONNECTOR REGISTRY
# ═══════════════════════════════════════════════════════════════════

CONNECTOR_REGISTRY = {
    "comtrade": ComtradeConnector,
    "worldbank": WorldBankConnector,
}


def get_available_connectors() -> List[Dict[str, Any]]:
    """Get list of available data connectors."""
    return [
        {
            "id": "comtrade",
            "name": "UN Comtrade",
            "description": "International trade data — bilateral flows by commodity",
            "target_table": "trade_flows",
            "requires_api_key": True,
            "indicators": None,
        },
        {
            "id": "worldbank",
            "name": "World Bank Open Data",
            "description": "Country macro indicators — GDP, population, trade balance",
            "target_table": "countries",
            "requires_api_key": False,
            "indicators": list(WorldBankConnector.INDICATORS.items()),
        },
    ]


def fetch_from_source(
    source: DataSource,
    year: Optional[int] = None,
) -> Tuple[List[str], List[Dict[str, Any]]]:
    """
    Fetch data from a registered DataSource.
    Returns (columns, rows).
    """
    connector_class = CONNECTOR_REGISTRY.get(source.source_type)
    if not connector_class:
        logger.error("Unknown connector type: %s", source.source_type)
        return [], []

    config = source.config or {}
    yr = year or config.get("year", 2022)

    if source.source_type == "comtrade":
        connector = connector_class(api_key=source.api_key)
        return connector.fetch(
            reporter_iso=config.get("reporter", "USA"),
            partner_iso=config.get("partner", "all"),
            year=yr,
            flow=config.get("flow", "X"),
            commodity=config.get("commodity", "TOTAL"),
        )
    elif source.source_type == "worldbank":
        connector = connector_class()
        return connector.fetch(
            indicator=config.get("indicator", "NY.GDP.MKTP.CD"),
            year=yr,
        )

    return [], []

"""
Fetch bilateral rail freight data from Eurostat.

Dataset: rail_go_intgoog — International railway goods transport
  (thousand tonnes, by country of loading / unloading)

Free API, no key required.
Uses Eurostat's JSON/SDMX-CSV bulk download endpoint.

Usage:
    python -m app.ingestion.eurostat_rail
"""
import os
import sys
import csv
import io
import logging
import time
import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.core.database import SessionLocal, engine
from app.models.country import Country
from app.models.rail_freight import RailFreight

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger(__name__)

# Eurostat SDMX-CSV bulk download — bilateral rail freight (goods loaded by country of unloading)
EUROSTAT_CSV_URL = "https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/rail_go_intunld"

# Eurostat country codes → ISO3 mapping (EU/EFTA + neighbours)
ESTAT_TO_ISO3 = {
    "AT": "AUT", "BE": "BEL", "BG": "BGR", "HR": "HRV", "CY": "CYP",
    "CZ": "CZE", "DK": "DNK", "EE": "EST", "FI": "FIN", "FR": "FRA",
    "DE": "DEU", "EL": "GRC", "GR": "GRC", "HU": "HUN", "IE": "IRL",
    "IT": "ITA", "LV": "LVA", "LT": "LTU", "LU": "LUX", "MT": "MLT",
    "NL": "NLD", "PL": "POL", "PT": "PRT", "RO": "ROU", "SK": "SVK",
    "SI": "SVN", "ES": "ESP", "SE": "SWE",
    # EFTA
    "NO": "NOR", "CH": "CHE", "IS": "ISL", "LI": "LIE",
    # Candidates & neighbours
    "TR": "TUR", "MK": "MKD", "ME": "MNE", "RS": "SRB", "AL": "ALB",
    "BA": "BIH", "XK": "XKX", "UA": "UKR", "MD": "MDA", "BY": "BLR",
    "RU": "RUS", "GE": "GEO",
    # UK
    "UK": "GBR",
}


def fetch_eurostat_rail_csv() -> str:
    """Download the full dataset as SDMX-CSV from Eurostat."""
    params = {
        "format": "SDMX-CSV",
        "compressed": "false",
    }
    log.info("Downloading Eurostat rail_go_intgoog dataset (SDMX-CSV)...")
    with httpx.Client(timeout=120.0, follow_redirects=True) as client:
        resp = client.get(EUROSTAT_CSV_URL, params=params)
        resp.raise_for_status()
        log.info(f"Downloaded {len(resp.text):,} bytes")
        return resp.text


def parse_and_ingest(csv_text: str):
    """Parse SDMX-CSV and ingest bilateral flows."""
    RailFreight.__table__.create(engine, checkfirst=True)
    db = SessionLocal()

    try:
        # Get valid ISO codes
        valid_isos = {c.iso_code for c in db.query(Country.iso_code).all()}

        reader = csv.DictReader(io.StringIO(csv_text))
        # Columns: DATAFLOW, LAST UPDATE, freq, unit, c_unload, geo, TIME_PERIOD, OBS_VALUE, OBS_FLAG, CONF_STATUS
        # geo = reporting country (origin/loader), c_unload = destination

        from collections import defaultdict
        agg: dict[tuple[str, str, int], float] = defaultdict(float)
        skipped = 0
        total = 0

        for row in reader:
            total += 1

            unit = row.get("unit", "")
            if "THS_T" not in unit:
                continue

            geo = row.get("geo", "")        # origin (loader)
            c_unload = row.get("c_unload", "")  # destination (unloader)
            time_period = row.get("TIME_PERIOD", "")
            obs_value = row.get("OBS_VALUE", "")

            if not geo or not c_unload or not time_period or not obs_value:
                skipped += 1
                continue

            # Convert country codes
            origin_iso = ESTAT_TO_ISO3.get(geo)
            dest_iso = ESTAT_TO_ISO3.get(c_unload)
            if not origin_iso or not dest_iso:
                skipped += 1
                continue
            if origin_iso not in valid_isos or dest_iso not in valid_isos:
                skipped += 1
                continue
            if origin_iso == dest_iso:
                continue  # skip domestic

            try:
                year = int(time_period[:4])
                tonnes = float(obs_value)
            except (ValueError, TypeError):
                skipped += 1
                continue

            if tonnes <= 0:
                continue

            # Aggregate: dataset may have multiple rows per OD-year (transport coverage etc.)
            # Keep the max value per OD-year to avoid double-counting
            key = (origin_iso, dest_iso, year)
            if tonnes > agg[key]:
                agg[key] = tonnes

        log.info(f"Parsed {total:,} rows, skipped {skipped:,}, aggregated to {len(agg):,} OD-year pairs")

        # Log TUR/RUS coverage
        tur_flows = {k: v for k, v in agg.items() if 'TUR' in k[:2]}
        rus_flows = {k: v for k, v in agg.items() if 'RUS' in k[:2]}
        log.info(f"  Turkey (TUR) flows: {len(tur_flows)}")
        log.info(f"  Russia (RUS) flows: {len(rus_flows)}")

        # Convert to records and batch upsert
        records = [
            {"origin_iso": o, "destination_iso": d, "year": y, "tonnes": round(t, 2)}
            for (o, d, y), t in agg.items()
            if t > 0
        ]

        batch_size = 500
        for i in range(0, len(records), batch_size):
            _upsert_batch(db, records[i : i + batch_size])

        # Count what we have
        count = db.query(RailFreight).count()
        log.info(f"Eurostat rail freight ingestion complete.")
        log.info(f"  Total rail_freight records in DB: {count:,}")

    finally:
        db.close()


def _upsert_batch(db, batch):
    stmt = pg_insert(RailFreight).values(batch)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_rail_freight_od_year",
        set_={
            "tonnes": stmt.excluded.tonnes,
        },
    )
    db.execute(stmt)
    db.commit()


def main():
    csv_text = fetch_eurostat_rail_csv()
    parse_and_ingest(csv_text)


if __name__ == "__main__":
    main()

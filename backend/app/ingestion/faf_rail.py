"""
Fetch US state-to-state rail freight data from FAF5 (Freight Analysis Framework).

Source: FHWA / BTS FAF5.7.1 State Database
  - State-to-state freight by mode, commodity, year
  - Tonnage in thousand tons, value in million $
  - Years: 2017-2024 + forecasts

Free download, no key required.

Usage:
    python -m app.ingestion.faf_rail
"""
import os
import sys
import csv
import io
import logging
import zipfile

import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.core.database import SessionLocal, engine
from app.models.rail_freight import RailFreight

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger(__name__)

FAF_STATE_URL = "https://faf.ornl.gov/faf5/data/download_files/FAF5.7.1_State.zip"

# FIPS state codes → US state abbreviations (used as origin_iso / dest_iso with "US-" prefix)
FIPS_TO_ABBR = {
    "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO",
    "09": "CT", "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI",
    "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY",
    "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN",
    "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
    "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH",
    "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD",
    "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA",
    "54": "WV", "55": "WI", "56": "WY",
}

# State centroids (lat, lon) for rendering
STATE_CENTROIDS: dict[str, tuple[float, float]] = {
    "AL": (32.81, -86.79), "AK": (63.35, -152.00), "AZ": (34.05, -111.09),
    "AR": (34.80, -92.20), "CA": (36.78, -119.42), "CO": (39.55, -105.78),
    "CT": (41.60, -72.76), "DE": (39.16, -75.52), "DC": (38.91, -77.02),
    "FL": (27.99, -81.76), "GA": (33.25, -83.44), "HI": (19.74, -155.84),
    "ID": (44.07, -114.74), "IL": (40.63, -89.40), "IN": (39.85, -86.26),
    "IA": (42.01, -93.21), "KS": (38.50, -98.43), "KY": (37.67, -84.67),
    "LA": (30.97, -91.87), "ME": (45.37, -69.24), "MD": (39.05, -76.64),
    "MA": (42.23, -71.53), "MI": (44.35, -85.41), "MN": (46.28, -94.31),
    "MS": (32.74, -89.68), "MO": (38.46, -92.29), "MT": (46.92, -110.45),
    "NE": (41.49, -99.90), "NV": (38.80, -116.42), "NH": (43.68, -71.58),
    "NJ": (40.19, -74.67), "NM": (34.52, -105.87), "NY": (42.17, -74.95),
    "NC": (35.63, -79.81), "ND": (47.53, -99.78), "OH": (40.39, -82.76),
    "OK": (35.57, -96.93), "OR": (43.80, -120.55), "PA": (41.20, -77.19),
    "RI": (41.58, -71.53), "SC": (33.86, -80.95), "SD": (44.30, -99.44),
    "TN": (35.75, -86.25), "TX": (31.97, -99.90), "UT": (39.32, -111.09),
    "VT": (44.07, -72.67), "VA": (37.77, -78.17), "WA": (47.75, -120.74),
    "WV": (38.60, -80.62), "WI": (44.50, -89.50), "WY": (43.08, -107.29),
}

# Years available in the FAF5 state CSV columns
FAF_YEARS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024]

RAIL_MODE = "2"      # FAF mode code for Rail
DOMESTIC_TRADE = "1"  # trade_type 1 = domestic
IMPORT_TRADE = "2"    # trade_type 2 = imports
EXPORT_TRADE = "3"    # trade_type 3 = exports
CANADA_ZONE = "801"   # FAF foreign zone for Canada
MEXICO_ZONE = "802"   # FAF foreign zone for Mexico


def fetch_and_ingest():
    """Download FAF5 state CSV, extract rail freight, and upsert into DB."""
    RailFreight.__table__.create(engine, checkfirst=True)

    # Use cached ZIP if available, otherwise download
    cache_path = os.path.join(os.path.dirname(__file__), "..", "..", "data", "raw", "FAF5.7.1_State.zip")
    cache_path = os.path.normpath(cache_path)
    if os.path.exists(cache_path):
        log.info("Using cached FAF5 ZIP: %s", cache_path)
        z = zipfile.ZipFile(cache_path)
    else:
        log.info("Downloading FAF5.7.1 State Database (%s)...", FAF_STATE_URL)
        os.makedirs(os.path.dirname(cache_path), exist_ok=True)
        with httpx.Client(timeout=httpx.Timeout(300, connect=30)) as client:
            with client.stream("GET", FAF_STATE_URL, follow_redirects=True) as resp:
                resp.raise_for_status()
                with open(cache_path, "wb") as f:
                    for chunk in resp.iter_bytes(chunk_size=65536):
                        f.write(chunk)
        log.info("Downloaded to %s", cache_path)
        z = zipfile.ZipFile(cache_path)
    csv_name = next(n for n in z.namelist() if n.endswith(".csv"))

    # Aggregate: for each (origin_state, dest_state, year), sum rail tonnage across commodities
    from collections import defaultdict
    agg: dict[tuple[str, str, int], float] = defaultdict(float)

    with z.open(csv_name) as f:
        reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8"))
        rows_domestic = 0
        rows_xborder = 0
        for row in reader:
            if row["dms_mode"] != RAIL_MODE:
                continue
            tt = row["trade_type"]

            if tt == DOMESTIC_TRADE:
                # Domestic US state-to-state
                orig_fips = row["dms_origst"]
                dest_fips = row["dms_destst"]
                orig_abbr = FIPS_TO_ABBR.get(orig_fips)
                dest_abbr = FIPS_TO_ABBR.get(dest_fips)
                if not orig_abbr or not dest_abbr:
                    continue
                for yr in FAF_YEARS:
                    val = row.get(f"tons_{yr}", "")
                    if not val:
                        continue
                    tons = float(val)
                    if tons > 0:
                        agg[(f"US-{orig_abbr}", f"US-{dest_abbr}", yr)] += tons
                rows_domestic += 1

            elif tt == IMPORT_TRADE and row["fr_orig"] == CANADA_ZONE:
                # Import from Canada → US state
                dest_fips = row["dms_destst"]
                dest_abbr = FIPS_TO_ABBR.get(dest_fips)
                if not dest_abbr:
                    continue
                for yr in FAF_YEARS:
                    val = row.get(f"tons_{yr}", "")
                    if not val:
                        continue
                    tons = float(val)
                    if tons > 0:
                        agg[("CA", f"US-{dest_abbr}", yr)] += tons
                rows_xborder += 1

            elif tt == EXPORT_TRADE and row["fr_dest"] == CANADA_ZONE:
                # Export from US state → Canada
                orig_fips = row["dms_origst"]
                orig_abbr = FIPS_TO_ABBR.get(orig_fips)
                if not orig_abbr:
                    continue
                for yr in FAF_YEARS:
                    val = row.get(f"tons_{yr}", "")
                    if not val:
                        continue
                    tons = float(val)
                    if tons > 0:
                        agg[(f"US-{orig_abbr}", "CA", yr)] += tons
                rows_xborder += 1

            elif tt == IMPORT_TRADE and row["fr_orig"] == MEXICO_ZONE:
                # Import from Mexico → US state
                dest_fips = row["dms_destst"]
                dest_abbr = FIPS_TO_ABBR.get(dest_fips)
                if not dest_abbr:
                    continue
                for yr in FAF_YEARS:
                    val = row.get(f"tons_{yr}", "")
                    if not val:
                        continue
                    tons = float(val)
                    if tons > 0:
                        agg[("MX", f"US-{dest_abbr}", yr)] += tons
                rows_xborder += 1

            elif tt == EXPORT_TRADE and row["fr_dest"] == MEXICO_ZONE:
                # Export from US state → Mexico
                orig_fips = row["dms_origst"]
                orig_abbr = FIPS_TO_ABBR.get(orig_fips)
                if not orig_abbr:
                    continue
                for yr in FAF_YEARS:
                    val = row.get(f"tons_{yr}", "")
                    if not val:
                        continue
                    tons = float(val)
                    if tons > 0:
                        agg[(f"US-{orig_abbr}", "MX", yr)] += tons
                rows_xborder += 1

    log.info("Parsed %d domestic + %d cross-border rail rows → %d aggregated OD-year pairs",
             rows_domestic, rows_xborder, len(agg))

    # Filter: only keep pairs with >= 10 thousand tons (skip noise)
    MIN_TONS = 10.0
    records = []
    for (orig, dest, yr), tons in agg.items():
        if tons < MIN_TONS:
            continue
        records.append({
            "origin_iso": orig,
            "destination_iso": dest,
            "year": yr,
            "tonnes": round(tons, 2),
            "tonne_km": None,
        })

    log.info("Filtered to %d records (>= %d K tons). Upserting...", len(records), int(MIN_TONS))

    db = SessionLocal()
    try:
        batch_size = 500
        for i in range(0, len(records), batch_size):
            batch = records[i : i + batch_size]
            _upsert_batch(batch)

        us_count = db.query(RailFreight).filter(RailFreight.origin_iso.like("US-%")).count()
        ca_count = db.query(RailFreight).filter(
            (RailFreight.origin_iso == "CA") | (RailFreight.destination_iso == "CA")
        ).count()
        log.info("FAF rail freight ingestion complete.")
        log.info("  US domestic records: %d", us_count)
        log.info("  US-Canada cross-border records: %d", ca_count)
    finally:
        db.close()


def _upsert_batch(batch: list[dict]):
    """Upsert a batch using PostgreSQL ON CONFLICT."""
    if not batch:
        return
    stmt = pg_insert(RailFreight).values(batch)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_rail_freight_od_year",
        set_={
            "tonnes": stmt.excluded.tonnes,
            "tonne_km": stmt.excluded.tonne_km,
        },
    )
    db = SessionLocal()
    try:
        db.execute(stmt)
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    fetch_and_ingest()

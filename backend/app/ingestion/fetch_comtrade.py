"""
Fetch real bilateral trade data from UN Comtrade API.

Uses the official comtradeapicall package.
- With subscription key (COMTRADE_KEY env): getFinalData — larger batches, faster
- Without key: previewFinalData — 500 records/call, free, no registration

Usage:
    # Without API key (free, takes ~15 min for all reporters):
    python -m app.ingestion.fetch_comtrade

    # With API key (faster, more reliable):
    $env:COMTRADE_KEY = "your-subscription-key"
    python -m app.ingestion.fetch_comtrade

    # Specific years only:
    python -m app.ingestion.fetch_comtrade --years 2022,2023

To get a free API key: register at https://comtradeplus.un.org/
"""
import os
import sys
import time
import argparse
import logging

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

import comtradeapicall as cc
from sqlalchemy import func, text
from app.core.database import SessionLocal
from app.models.country import Country
from app.models.trade_flow import TradeFlow

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger(__name__)

# M49 code → ISO3 mapping from Comtrade reference data
# We'll build this dynamically from the API + our DB


def fetch_reporter_exports(reporter_m49: int, year: int, subscription_key: str | None,
                           max_retries: int = 5):
    """Fetch all export flows from a single reporter for a year, with retry on rate limit."""
    import re as _re

    for attempt in range(max_retries):
        try:
            # Redirect stderr temporarily to detect 403 messages from the library
            import io, contextlib
            stderr_capture = io.StringIO()

            with contextlib.redirect_stderr(stderr_capture):
                if subscription_key:
                    df = cc.getFinalData(
                        subscription_key=subscription_key,
                        typeCode='C',
                        freqCode='A',
                        clCode='HS',
                        period=str(year),
                        reporterCode=str(reporter_m49),
                        cmdCode='TOTAL',
                        flowCode='X',
                        partnerCode=None,
                        partner2Code=None,
                        customsCode='C00',
                        motCode='0',
                        maxRecords=5000,
                        includeDesc=True
                    )
                else:
                    df = cc.previewFinalData(
                        typeCode='C',
                        freqCode='A',
                        clCode='HS',
                        period=str(year),
                        reporterCode=str(reporter_m49),
                        cmdCode='TOTAL',
                        flowCode='X',
                        partnerCode=None,
                        partner2Code=None,
                        customsCode='C00',
                        motCode='0',
                        maxRecords=500,
                        includeDesc=True
                    )

            # Check if the library printed rate limit messages to stdout
            # The comtradeapicall library prints JSON error to stdout
            if df is None or (hasattr(df, 'empty') and df.empty):
                # Could be rate limited or no data — check if we should retry
                if attempt < max_retries - 1:
                    # Parse wait time from "Quota will be replenished in HH:MM:SS"
                    wait = min(60 * (attempt + 1), 900)  # exponential up to 15 min
                    log.warning(f"  Empty response (attempt {attempt+1}), waiting {wait}s...")
                    time.sleep(wait)
                    continue
                return None

            return df
        except Exception as e:
            err_str = str(e)
            if "403" in err_str or "quota" in err_str.lower() or "rate" in err_str.lower():
                wait = min(60 * (attempt + 1), 900)
                log.warning(f"  Rate limited (attempt {attempt+1}), waiting {wait}s...")
                time.sleep(wait)
                continue
            log.warning(f"  Error fetching reporter {reporter_m49} year {year}: {e}")
            return None

    return None


def main():
    parser = argparse.ArgumentParser(description="Fetch UN Comtrade bilateral trade data")
    parser.add_argument("--years", default="2018,2019,2020,2021,2022,2023",
                        help="Comma-separated years to fetch")
    parser.add_argument("--keep-synthetic", action="store_true",
                        help="Keep existing synthetic data (add real data on top)")
    parser.add_argument("--skip-existing", action="store_true",
                        help="Skip years that already have data in the DB")
    args = parser.parse_args()

    years = [int(y.strip()) for y in args.years.split(",")]
    subscription_key = os.environ.get("COMTRADE_KEY") or os.environ.get("COMTRADE_SUBSCRIPTION_KEY")

    if subscription_key:
        log.info(f"Using subscription key: {subscription_key[:8]}...")
        rate_delay = 2.0  # seconds between requests
    else:
        log.info("No COMTRADE_KEY set — using free preview API (500 records/call)")
        log.info("For faster fetching, register at https://comtradeplus.un.org/ and set COMTRADE_KEY env var")
        rate_delay = 3.5  # be more polite with free tier to avoid rate limits

    db = SessionLocal()
    try:
        # Get our DB countries for ISO3 matching
        db_countries = {c.iso_code: c for c in db.query(Country).all()}
        log.info(f"Database has {len(db_countries)} countries")

        # Get Comtrade reporter reference (M49 → ISO3 mapping)
        log.info("Fetching Comtrade reporter reference data...")
        reporters_ref = cc.getReference('reporter')
        if reporters_ref is None or len(reporters_ref) == 0:
            log.error("Could not fetch reporter reference data")
            return

        # Build M49 → ISO3 mapping, only for reporters that exist in our DB
        reporter_list = []
        for _, row in reporters_ref.iterrows():
            m49 = row['id']
            iso3 = row.get('reporterCodeIsoAlpha3', '')
            name = row.get('text', '')
            if iso3 and iso3 in db_countries and len(iso3) == 3:
                reporter_list.append((m49, iso3, name))

        log.info(f"Matched {len(reporter_list)} Comtrade reporters to our DB countries")

        if not args.keep_synthetic:
            # Clear existing synthetic trade flows (commodity_code IS NULL = aggregate flows)
            deleted = db.query(TradeFlow).filter(TradeFlow.commodity_code.is_(None)).delete()
            db.commit()
            log.info(f"Cleared {deleted} existing aggregate trade flows")

        grand_total = 0
        total_skipped = 0

        for year in years:
            log.info(f"\n{'='*60}")
            log.info(f"YEAR {year}")
            log.info(f"{'='*60}")

            # Skip years that already have data
            if args.skip_existing:
                existing = db.query(func.count(TradeFlow.id)).filter(
                    TradeFlow.year == year,
                    TradeFlow.commodity_code.is_(None),
                ).scalar()
                if existing and existing > 1000:
                    log.info(f"  Skipping — already has {existing:,} flows")
                    continue

            year_total = 0
            year_skipped = 0

            for idx, (m49, iso3, name) in enumerate(reporter_list):
                # Fetch exports from this reporter
                df = fetch_reporter_exports(m49, year, subscription_key)

                if df is None or len(df) == 0:
                    log.debug(f"  [{idx+1}/{len(reporter_list)}] {iso3} ({name}): no data")
                    continue

                batch = []
                for _, row in df.iterrows():
                    partner_iso = row.get('partnerISO', '')
                    value = row.get('primaryValue', 0)

                    # Skip invalid entries
                    if not partner_iso or len(partner_iso) != 3:
                        continue
                    if partner_iso not in db_countries:
                        continue
                    if partner_iso == iso3:  # no self-trade
                        continue
                    if not value or value <= 0:
                        continue

                    # Skip "World" aggregate partner (code 0 / W00)
                    partner_code = row.get('partnerCode', 0)
                    if partner_code == 0 or partner_iso in ('W00', 'WLD'):
                        continue

                    batch.append(TradeFlow(
                        exporter_iso=iso3,
                        importer_iso=partner_iso,
                        year=year,
                        trade_value_usd=float(value),
                        flow_type="export",
                    ))

                # Deduplicate batch: keep highest value per (exporter, importer)
                seen = {}
                for tf in batch:
                    key = (tf.exporter_iso, tf.importer_iso)
                    if key not in seen or tf.trade_value_usd > seen[key].trade_value_usd:
                        seen[key] = tf
                batch = list(seen.values())

                if batch:
                    db.bulk_save_objects(batch)
                    db.flush()
                    year_total += len(batch)
                    log.info(f"  [{idx+1}/{len(reporter_list)}] {iso3} ({name}): {len(batch)} trade flows")
                else:
                    year_skipped += 1

                # Rate limiting
                time.sleep(rate_delay)

            db.commit()
            grand_total += year_total
            total_skipped += year_skipped
            log.info(f"  ✅ {year}: {year_total} bilateral trade flows imported "
                     f"({year_skipped} reporters had no data)")

        # Summary
        log.info(f"\n{'='*60}")
        log.info(f"IMPORT COMPLETE")
        log.info(f"{'='*60}")
        log.info(f"Total flows imported: {grand_total:,}")
        log.info(f"Years covered: {years}")

        # Stats
        for year in years:
            pair_count = db.query(func.count(TradeFlow.id)).filter(
                TradeFlow.year == year,
                TradeFlow.commodity_code.is_(None),
            ).scalar()
            unique_exporters = db.query(func.count(func.distinct(TradeFlow.exporter_iso))).filter(
                TradeFlow.year == year,
                TradeFlow.commodity_code.is_(None),
            ).scalar()
            log.info(f"  {year}: {pair_count:,} flows, {unique_exporters} exporter countries")

    except KeyboardInterrupt:
        log.info("\nInterrupted! Committing partial data...")
        db.commit()
        log.info("Partial data saved.")
    except Exception as e:
        log.error(f"Fatal error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()

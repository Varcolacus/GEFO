"""
Generate comprehensive bilateral trade flows for all countries with GDP data.

Uses a gravity model approach: trade between countries A and B is proportional
to the product of their GDPs and inversely proportional to distance.
This creates ~5000-8000 realistic bilateral pairs for each year.
"""
import os
import sys
import math
import random

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from sqlalchemy import func
from app.core.database import SessionLocal
from app.models.country import Country
from app.models.trade_flow import TradeFlow


def haversine(lat1, lon1, lat2, lon2):
    """Distance in km between two lat/lon points."""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def seed_comprehensive_trade():
    db = SessionLocal()
    try:
        # Get all countries with GDP and coordinates
        countries = db.query(Country).filter(
            Country.gdp.isnot(None),
            Country.centroid_lat.isnot(None),
            Country.centroid_lon.isnot(None),
        ).all()

        print(f"Found {len(countries)} countries with GDP and coordinates")

        # Delete old synthetic seed data (keep any real imported data with commodity_code)
        deleted = db.query(TradeFlow).filter(TradeFlow.commodity_code.is_(None)).delete()
        db.commit()
        print(f"Cleared {deleted} old aggregate trade flows")

        # Sort by GDP descending
        countries.sort(key=lambda c: c.gdp or 0, reverse=True)

        # Precompute distances
        iso_to_country = {c.iso_code: c for c in countries}
        n = len(countries)

        # GDP tiers for trade probability
        # Top 30 countries trade with almost everyone
        # Medium countries (30-100) trade with top + neighbors + random
        # Small countries (100+) trade with top + neighbors
        top_tier = set(c.iso_code for c in countries[:30])
        mid_tier = set(c.iso_code for c in countries[30:100])

        # Regional proximity groups (continent-based)
        regions = {}
        for c in countries:
            lat, lon = c.centroid_lat, c.centroid_lon
            if lat > 15 and -30 < lon < 60:
                region = "europe"
            elif lat > -35 and lon > 60:
                region = "asia_pacific"
            elif lat > -60 and -120 < lon < -30:
                region = "americas"
            elif lat > -40 and -30 < lon < 60 and lat < 15:
                region = "africa"
            elif 10 < lat < 45 and 25 < lon < 65:
                region = "middle_east"
            else:
                region = "other"
            regions.setdefault(region, []).append(c.iso_code)

        iso_to_region = {}
        for region, isos in regions.items():
            for iso in isos:
                iso_to_region[iso] = region

        years = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]
        total_flows = 0

        # Year-over-year growth factors (real-ish)
        year_factors = {
            2018: 0.85, 2019: 0.88, 2020: 0.72,  # COVID dip
            2021: 0.90, 2022: 0.95, 2023: 1.00,
            2024: 1.03, 2025: 1.06,
        }

        random.seed(42)  # Reproducible

        for year in years:
            yf = year_factors[year]
            year_flows = 0
            batch = []

            for i, exporter in enumerate(countries):
                exp_gdp = exporter.gdp or 0
                if exp_gdp < 1e9:  # Skip countries with < $1B GDP
                    continue

                for j, importer in enumerate(countries):
                    if i == j:
                        continue

                    imp_gdp = importer.gdp or 0
                    if imp_gdp < 1e9:
                        continue

                    e_iso = exporter.iso_code
                    i_iso = importer.iso_code

                    # Probability of trade relationship existing
                    both_top = e_iso in top_tier and i_iso in top_tier
                    one_top = e_iso in top_tier or i_iso in top_tier
                    same_region = iso_to_region.get(e_iso) == iso_to_region.get(i_iso)

                    dist = haversine(
                        exporter.centroid_lat, exporter.centroid_lon,
                        importer.centroid_lat, importer.centroid_lon,
                    )
                    dist = max(dist, 100)  # min 100km

                    # Decide if this pair trades
                    if both_top:
                        prob = 1.0
                    elif one_top and same_region:
                        prob = 0.95
                    elif one_top:
                        prob = 0.85
                    elif same_region:
                        prob = 0.75
                    elif e_iso in mid_tier or i_iso in mid_tier:
                        prob = 0.45
                    else:
                        prob = 0.18

                    if random.random() > prob:
                        continue

                    # Gravity model: trade ~ GDP_a * GDP_b / distance^0.9
                    gravity = (exp_gdp * imp_gdp) / (dist ** 0.9)

                    # Scale to realistic USD values
                    trade_usd = gravity * 3.5e-14  # scaling factor

                    # Add noise ±40%
                    noise = 0.6 + random.random() * 0.8
                    trade_usd *= noise * yf

                    # Minimum trade: $100K
                    if trade_usd < 100_000:
                        continue

                    # Cap at realistic bilateral max (~$700B for US-China)
                    trade_usd = min(trade_usd, 700_000_000_000)

                    batch.append(TradeFlow(
                        exporter_iso=e_iso,
                        importer_iso=i_iso,
                        year=year,
                        trade_value_usd=round(trade_usd, 2),
                        flow_type="export",
                    ))
                    year_flows += 1

                    # Batch insert every 5000 rows
                    if len(batch) >= 5000:
                        db.bulk_save_objects(batch)
                        db.flush()
                        batch = []

            if batch:
                db.bulk_save_objects(batch)
            db.commit()
            total_flows += year_flows
            print(f"  📊 {year}: {year_flows} bilateral trade flows generated")

        print(f"\n✅ Total: {total_flows} trade flows across {len(years)} years")

        # Summary stats
        pair_count = db.query(
            func.count(func.distinct(
                func.concat(TradeFlow.exporter_iso, '-', TradeFlow.importer_iso)
            ))
        ).filter(TradeFlow.year == 2023).scalar()
        print(f"  Unique pairs in 2023: {pair_count}")

    finally:
        db.close()


if __name__ == "__main__":
    seed_comprehensive_trade()

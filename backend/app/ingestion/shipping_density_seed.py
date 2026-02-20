"""
Shipping Density Seed Script
Seeds realistic shipping lane density data for major global waterways.
Based on AIS vessel tracking patterns from major shipping corridors.
"""
import logging
from geoalchemy2.shape import from_shape
from shapely.geometry import box
from app.core.database import SessionLocal
from app.models.shipping_density import ShippingDensity

logger = logging.getLogger(__name__)

# Grid cell size in degrees (roughly 55km at equator)
CELL_SIZE = 0.5

# Shipping density points: (region_name, lat, lon, density_value, vessel_type)
# density_value: 0-100 scale (100 = busiest lanes in the world)
SHIPPING_LANES = [
    # === Strait of Malacca (busiest shipping lane globally) ===
    ("Strait of Malacca", 1.3, 103.8, 100, "all"),
    ("Strait of Malacca", 1.5, 103.5, 95, "all"),
    ("Strait of Malacca", 1.8, 102.8, 92, "all"),
    ("Strait of Malacca", 2.2, 102.0, 88, "all"),
    ("Strait of Malacca", 2.5, 101.5, 85, "all"),
    ("Strait of Malacca", 3.0, 100.5, 82, "all"),
    ("Strait of Malacca", 3.8, 99.5, 78, "all"),
    ("Strait of Malacca", 4.5, 98.5, 72, "all"),
    ("Strait of Malacca", 5.5, 97.0, 65, "all"),

    # === Suez Canal & approaches ===
    ("Suez Canal", 30.0, 32.5, 90, "all"),
    ("Suez Canal", 30.5, 32.5, 88, "all"),
    ("Suez Canal", 31.0, 32.3, 85, "all"),
    ("Red Sea - North", 28.0, 33.5, 82, "all"),
    ("Red Sea - Central", 22.0, 38.0, 78, "all"),
    ("Bab el-Mandeb", 12.6, 43.3, 85, "all"),
    ("Red Sea - South", 15.0, 42.0, 75, "all"),
    ("Gulf of Aden", 12.0, 45.0, 72, "all"),
    ("Gulf of Aden", 12.5, 48.0, 68, "all"),

    # === Panama Canal & approaches ===
    ("Panama Canal", 9.0, -79.5, 85, "all"),
    ("Panama Canal", 9.3, -79.9, 82, "all"),
    ("Caribbean - Panama approach", 9.5, -80.5, 70, "all"),
    ("Pacific - Panama approach", 8.5, -79.5, 68, "all"),

    # === English Channel / Dover Strait ===
    ("English Channel", 51.0, 1.5, 88, "all"),
    ("English Channel", 50.5, 0.5, 82, "all"),
    ("English Channel", 50.0, -0.5, 78, "all"),
    ("English Channel", 49.5, -2.0, 72, "all"),
    ("English Channel", 49.0, -3.5, 65, "all"),

    # === South China Sea ===
    ("South China Sea - North", 22.0, 114.0, 90, "all"),
    ("South China Sea - Central", 18.0, 115.0, 75, "all"),
    ("South China Sea - South", 10.0, 110.0, 70, "all"),
    ("South China Sea - Vietnam coast", 15.0, 110.0, 65, "all"),
    ("Taiwan Strait", 24.5, 119.5, 80, "all"),
    ("Taiwan Strait", 25.5, 120.0, 78, "all"),

    # === East China Sea / Yellow Sea ===
    ("East China Sea", 30.0, 122.5, 85, "all"),
    ("East China Sea", 31.5, 122.0, 88, "cargo"),
    ("Yellow Sea", 35.0, 124.0, 72, "all"),
    ("Korea Strait", 34.0, 129.0, 78, "all"),

    # === Strait of Hormuz (oil tanker highway) ===
    ("Strait of Hormuz", 26.5, 56.5, 88, "tanker"),
    ("Strait of Hormuz", 26.0, 56.0, 85, "tanker"),
    ("Persian Gulf", 27.0, 51.0, 75, "tanker"),
    ("Persian Gulf", 28.5, 49.5, 70, "tanker"),
    ("Arabian Sea - West", 22.0, 60.0, 65, "tanker"),
    ("Arabian Sea - Oman", 23.5, 58.0, 68, "all"),

    # === Mediterranean ===
    ("Mediterranean - Gibraltar", 36.0, -5.5, 82, "all"),
    ("Mediterranean - Algerian coast", 37.0, 0.0, 60, "all"),
    ("Mediterranean - Central", 36.5, 10.0, 55, "all"),
    ("Mediterranean - Sicily", 37.5, 12.0, 62, "all"),
    ("Mediterranean - East", 34.0, 30.0, 58, "all"),
    ("Mediterranean - Greece", 37.0, 24.0, 55, "all"),
    ("Adriatic - North", 45.0, 13.5, 50, "cargo"),

    # === North Sea / Baltic ===
    ("North Sea - Rotterdam", 52.0, 4.0, 90, "cargo"),
    ("North Sea - Hamburg approach", 54.0, 8.5, 82, "cargo"),
    ("North Sea - Central", 55.0, 3.0, 72, "all"),
    ("Baltic - Denmark Strait", 55.5, 11.0, 68, "all"),
    ("Baltic - Central", 57.0, 18.0, 55, "all"),
    ("Skagerrak", 57.5, 9.5, 62, "all"),

    # === US Atlantic Coast ===
    ("US East - New York approach", 40.5, -73.5, 80, "cargo"),
    ("US East - Norfolk approach", 37.0, -75.5, 72, "cargo"),
    ("US East - Savannah approach", 32.0, -80.0, 65, "cargo"),
    ("Gulf of Mexico - Houston", 29.0, -94.5, 75, "tanker"),
    ("Gulf of Mexico - New Orleans", 29.0, -89.0, 68, "cargo"),
    ("Florida Strait", 25.0, -80.0, 70, "all"),

    # === US West Coast / Pacific ===
    ("US West - LA/Long Beach", 33.7, -118.3, 85, "cargo"),
    ("US West - San Francisco", 37.8, -122.5, 55, "cargo"),
    ("US West - Seattle/Tacoma", 47.5, -122.5, 60, "cargo"),

    # === East Africa / Indian Ocean ===
    ("Mozambique Channel", -18.0, 40.0, 45, "all"),
    ("East Africa - Horn", 5.0, 50.0, 55, "all"),
    ("Cape of Good Hope", -34.5, 18.5, 62, "all"),
    ("Indian Ocean - Central", -5.0, 70.0, 40, "all"),
    ("Indian Ocean - Mumbai", 19.0, 72.0, 65, "cargo"),
    ("Bay of Bengal", 12.0, 82.0, 50, "all"),

    # === Japan / Korea seas ===
    ("Tokyo Bay approach", 35.0, 139.5, 82, "cargo"),
    ("Inland Sea - Japan", 34.0, 133.0, 70, "cargo"),
    ("Busan approach", 35.0, 129.0, 80, "cargo"),

    # === Southeast Asia ===
    ("Strait of Lombok", -8.5, 115.5, 55, "all"),
    ("Sunda Strait", -6.5, 105.5, 52, "all"),
    ("Singapore Strait", 1.2, 104.0, 98, "all"),
    ("Makassar Strait", -2.0, 117.5, 48, "tanker"),
    ("Philippines - Manila", 14.5, 120.5, 55, "cargo"),

    # === South America ===
    ("Strait of Magellan", -53.0, -70.5, 25, "all"),
    ("Santos - Brazil", -24.0, -46.0, 60, "cargo"),
    ("Caribbean - Colombia", 11.0, -75.0, 50, "all"),
    ("Amazon mouth", -1.0, -48.0, 35, "bulk"),

    # === Arctic / Northern routes ===
    ("Northern Sea Route - Barents", 72.0, 35.0, 18, "all"),
    ("Northern Sea Route - Kara", 73.0, 70.0, 10, "all"),
    ("Northwest Passage", 74.0, -95.0, 5, "all"),

    # === West Africa ===
    ("West Africa - Lagos", 6.4, 3.4, 48, "tanker"),
    ("West Africa - Tema", 5.6, 0.0, 40, "cargo"),
    ("West Africa - Abidjan", 5.3, -3.9, 38, "cargo"),
]

# Year multipliers for shipping density evolution
DENSITY_YEAR_FACTORS = {
    2018: 0.92,
    2019: 0.90,
    2020: 0.75,  # COVID
    2021: 0.93,
    2022: 1.02,
    2023: 1.00,
}


def seed_shipping_density():
    """Seed shipping lane density data for years 2018-2023."""
    db = SessionLocal()

    try:
        existing = db.query(ShippingDensity).count()
        if existing > 0:
            logger.info(f"Shipping density table has {existing} records. Clearing...")
            db.query(ShippingDensity).delete()
            db.commit()

        count = 0
        for year, factor in DENSITY_YEAR_FACTORS.items():
            for month in [1, 4, 7, 10]:  # Quarterly snapshots
                for (region, lat, lon, density, vessel_type) in SHIPPING_LANES:
                    # Slight seasonal variation
                    seasonal = 1.0
                    if month == 1:
                        seasonal = 0.95  # winter slowdown (NH)
                    elif month == 7:
                        seasonal = 1.03  # peak season prep

                    adj_density = min(100.0, density * factor * seasonal)

                    # Create grid cell polygon
                    half = CELL_SIZE / 2
                    cell = box(lon - half, lat - half, lon + half, lat + half)

                    entry = ShippingDensity(
                        region_name=region,
                        lat=lat,
                        lon=lon,
                        year=year,
                        month=month,
                        density_value=round(adj_density, 1),
                        vessel_type=vessel_type,
                        grid_cell=from_shape(cell, srid=4326),
                    )
                    db.add(entry)
                    count += 1

        db.commit()
        logger.info(
            f"Seeded {count} shipping density records "
            f"({len(SHIPPING_LANES)} points x {len(DENSITY_YEAR_FACTORS)} years x 4 quarters)"
        )

    finally:
        db.close()

    return count


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    seed_shipping_density()

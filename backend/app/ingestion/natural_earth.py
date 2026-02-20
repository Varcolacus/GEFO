"""
Natural Earth Shapefile Ingestion
Downloads and imports Natural Earth country boundaries into PostGIS.
Free data: https://www.naturalearthdata.com/
"""
import logging
import os
import zipfile
import httpx
import geopandas as gpd
from sqlalchemy.orm import Session
from geoalchemy2.shape import from_shape

from app.core.database import SessionLocal
from app.models.country import Country

logger = logging.getLogger(__name__)

NATURAL_EARTH_URL = (
    "https://naciscdn.org/naturalearth/110m/cultural/"
    "ne_110m_admin_0_countries.zip"
)

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "shapefiles")


def download_natural_earth(output_dir: str = DATA_DIR) -> str:
    """Download Natural Earth country boundaries shapefile."""
    os.makedirs(output_dir, exist_ok=True)
    zip_path = os.path.join(output_dir, "ne_110m_admin_0_countries.zip")
    shp_dir = os.path.join(output_dir, "ne_110m_admin_0_countries")

    # Skip if already downloaded
    if os.path.exists(shp_dir):
        logger.info("Natural Earth data already downloaded")
        return shp_dir

    logger.info("Downloading Natural Earth shapefile...")
    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        response = client.get(NATURAL_EARTH_URL)
        response.raise_for_status()

        with open(zip_path, "wb") as f:
            f.write(response.content)

    # Extract
    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(shp_dir)

    logger.info(f"Extracted to {shp_dir}")
    return shp_dir


def ingest_natural_earth():
    """
    Import Natural Earth country geometries and centroids into the database.
    """
    db = SessionLocal()

    try:
        shp_dir = download_natural_earth()

        # Find .shp file
        shp_file = None
        for f in os.listdir(shp_dir):
            if f.endswith(".shp"):
                shp_file = os.path.join(shp_dir, f)
                break

        if not shp_file:
            logger.error("No .shp file found in extracted directory")
            return 0

        logger.info(f"Reading shapefile: {shp_file}")
        gdf = gpd.read_file(shp_file)

        count = 0
        for _, row in gdf.iterrows():
            iso_code = row.get("ISO_A3", row.get("ADM0_A3", ""))
            name = row.get("NAME", row.get("ADMIN", ""))

            if not iso_code or iso_code == "-99" or len(iso_code) != 3:
                continue

            geom = row.geometry
            centroid = geom.centroid

            # Check if country exists
            country = db.query(Country).filter(Country.iso_code == iso_code).first()

            if country:
                country.geometry = from_shape(geom, srid=4326)
                country.centroid_lat = centroid.y
                country.centroid_lon = centroid.x
                if not country.name or country.name == iso_code:
                    country.name = name
                country.region = row.get("REGION_WB", row.get("CONTINENT", None))
                country.sub_region = row.get("SUBREGION", None)
            else:
                country = Country(
                    iso_code=iso_code,
                    name=name,
                    region=row.get("REGION_WB", row.get("CONTINENT", None)),
                    sub_region=row.get("SUBREGION", None),
                    geometry=from_shape(geom, srid=4326),
                    centroid_lat=centroid.y,
                    centroid_lon=centroid.x,
                )
                db.add(country)

            count += 1

        db.commit()
        logger.info(f"Natural Earth ingestion complete. {count} countries processed.")

    finally:
        db.close()

    return count


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    ingest_natural_earth()

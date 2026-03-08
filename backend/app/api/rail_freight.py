from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional, List
from pydantic import BaseModel

from app.core.database import get_db
from app.models.rail_freight import RailFreight
from app.models.country import Country

router = APIRouter(prefix="/api/rail_freight", tags=["Rail Freight"])

# US state centroids for coordinate lookup
US_STATE_INFO: dict[str, tuple[str, float, float]] = {
    "US-AL": ("Alabama", 32.81, -86.79), "US-AK": ("Alaska", 63.35, -152.00),
    "US-AZ": ("Arizona", 34.05, -111.09), "US-AR": ("Arkansas", 34.80, -92.20),
    "US-CA": ("California", 36.78, -119.42), "US-CO": ("Colorado", 39.55, -105.78),
    "US-CT": ("Connecticut", 41.60, -72.76), "US-DE": ("Delaware", 39.16, -75.52),
    "US-DC": ("D.C.", 38.91, -77.02), "US-FL": ("Florida", 27.99, -81.76),
    "US-GA": ("Georgia", 33.25, -83.44), "US-HI": ("Hawaii", 19.74, -155.84),
    "US-ID": ("Idaho", 44.07, -114.74), "US-IL": ("Illinois", 40.63, -89.40),
    "US-IN": ("Indiana", 39.85, -86.26), "US-IA": ("Iowa", 42.01, -93.21),
    "US-KS": ("Kansas", 38.50, -98.43), "US-KY": ("Kentucky", 37.67, -84.67),
    "US-LA": ("Louisiana", 30.97, -91.87), "US-ME": ("Maine", 45.37, -69.24),
    "US-MD": ("Maryland", 39.05, -76.64), "US-MA": ("Massachusetts", 42.23, -71.53),
    "US-MI": ("Michigan", 44.35, -85.41), "US-MN": ("Minnesota", 46.28, -94.31),
    "US-MS": ("Mississippi", 32.74, -89.68), "US-MO": ("Missouri", 38.46, -92.29),
    "US-MT": ("Montana", 46.92, -110.45), "US-NE": ("Nebraska", 41.49, -99.90),
    "US-NV": ("Nevada", 38.80, -116.42), "US-NH": ("New Hampshire", 43.68, -71.58),
    "US-NJ": ("New Jersey", 40.19, -74.67), "US-NM": ("New Mexico", 34.52, -105.87),
    "US-NY": ("New York", 42.17, -74.95), "US-NC": ("North Carolina", 35.63, -79.81),
    "US-ND": ("North Dakota", 47.53, -99.78), "US-OH": ("Ohio", 40.39, -82.76),
    "US-OK": ("Oklahoma", 35.57, -96.93), "US-OR": ("Oregon", 43.80, -120.55),
    "US-PA": ("Pennsylvania", 41.20, -77.19), "US-RI": ("Rhode Island", 41.58, -71.53),
    "US-SC": ("South Carolina", 33.86, -80.95), "US-SD": ("South Dakota", 44.30, -99.44),
    "US-TN": ("Tennessee", 35.75, -86.25), "US-TX": ("Texas", 31.97, -99.90),
    "US-UT": ("Utah", 39.32, -111.09), "US-VT": ("Vermont", 44.07, -72.67),
    "US-VA": ("Virginia", 37.77, -78.17), "US-WA": ("Washington", 47.75, -120.74),
    "US-WV": ("West Virginia", 38.60, -80.62), "US-WI": ("Wisconsin", 44.50, -89.50),
    "US-WY": ("Wyoming", 43.08, -107.29),
    # Canada (single entity for cross-border flows)
    "CA": ("Canada", 56.13, -106.35),
    # Mexico (single entity for cross-border flows)
    "MX": ("Mexico", 23.63, -102.55),
}


class RailFreightFlow(BaseModel):
    origin_iso: str
    destination_iso: str
    origin_name: str = ""
    destination_name: str = ""
    origin_lat: Optional[float] = None
    origin_lon: Optional[float] = None
    dest_lat: Optional[float] = None
    dest_lon: Optional[float] = None
    year: int
    tonnes: float
    estimated: bool = False


@router.get("/", response_model=List[RailFreightFlow])
def get_rail_freight(
    year: int = Query(2022, description="Year"),
    min_tonnes: float = Query(5, description="Minimum thousand tonnes to include"),
    region: Optional[str] = Query(None, description="Region filter: 'eu', 'us', or None for all"),
    db: Session = Depends(get_db),
):
    """Get bilateral rail freight flows for a given year.
    
    When fetching all regions (region=None), each region falls back to its
    latest available year if no data exists for the requested year.
    Regions: 'us' (US+Canada+Mexico), 'eu' (European), 'asia' (China/Central Asia/Caucasus).
    """
    # ISO codes that belong to the Asia/global corridors region
    ASIA_ISOS = {
        # Central Asia / Silk Road
        "CHN", "KAZ", "MNG", "AZE", "GEO", "UZB", "TKM", "KGZ", "TJK", "RUS", "BLR",
        # South Asia
        "IND", "PAK", "BGD", "NPL", "LKA",
        # Middle East / Iran corridors
        "IRN", "IRQ", "AFG", "SAU", "ARE",
        # Southeast Asia
        "LAO", "VNM", "THA", "MMR", "MYS", "SGP",
    }

    def _region_filter(region_key: str):
        """Return a SQLAlchemy filter for the given region key.
        
        Asia region includes any flow where EITHER origin or destination is
        an Asia ISO, so CHN→DEU and DEU→CHN both belong to 'asia'.
        """
        if region_key == "us":
            return (
                RailFreight.origin_iso.like("US-%")
                | (RailFreight.origin_iso == "CA")
                | (RailFreight.origin_iso == "MX")
            )
        elif region_key == "asia":
            return (
                RailFreight.origin_iso.in_(ASIA_ISOS)
                | RailFreight.destination_iso.in_(ASIA_ISOS)
            )
        else:  # eu — exclude US/CA/MX and exclude any flow touching Asia
            return (
                ~RailFreight.origin_iso.like("US-%")
                & (RailFreight.origin_iso != "CA")
                & (RailFreight.origin_iso != "MX")
                & ~RailFreight.origin_iso.in_(ASIA_ISOS)
                & ~RailFreight.destination_iso.in_(ASIA_ISOS)
            )

    def _query_region(region_key: str, yr: int):
        q = db.query(RailFreight).filter(
            RailFreight.year == yr,
            RailFreight.tonnes >= min_tonnes,
            _region_filter(region_key),
        )
        return q.order_by(RailFreight.tonnes.desc()).all()

    def _latest_year(region_key: str) -> Optional[int]:
        """Find the best fallback year — the one with the most flows."""
        row = (
            db.query(RailFreight.year, func.count(RailFreight.id).label("cnt"))
            .filter(_region_filter(region_key), RailFreight.tonnes >= min_tonnes)
            .group_by(RailFreight.year)
            .order_by(func.count(RailFreight.id).desc())
            .first()
        )
        return row[0] if row else None

    # Determine which regions to fetch
    regions_to_fetch: list[str] = []
    if region == "us":
        regions_to_fetch = ["us"]
    elif region == "eu":
        regions_to_fetch = ["eu"]
    elif region == "asia":
        regions_to_fetch = ["asia"]
    else:
        regions_to_fetch = ["eu", "asia", "us"]

    flows = []
    for rkey in regions_to_fetch:
        region_flows = _query_region(rkey, year)
        if not region_flows:
            # Fallback to latest available year for this region
            latest = _latest_year(rkey)
            if latest and latest != year:
                region_flows = _query_region(rkey, latest)
        flows.extend(region_flows)

    # Build country lookup for EU/Asia flows
    countries = {c.iso_code: c for c in db.query(Country).all()}

    results = []
    for f in flows:
        if f.origin_iso.startswith("US-") or f.origin_iso in ("CA", "MX"):
            # US state or US-Canada cross-border flow
            oi = US_STATE_INFO.get(f.origin_iso)
            di = US_STATE_INFO.get(f.destination_iso)
            if not oi or not di:
                continue
            results.append(RailFreightFlow(
                origin_iso=f.origin_iso,
                destination_iso=f.destination_iso,
                origin_name=oi[0],
                destination_name=di[0],
                origin_lat=oi[1],
                origin_lon=oi[2],
                dest_lat=di[1],
                dest_lon=di[2],
                year=f.year,
                tonnes=f.tonnes,
                estimated=f.estimated,
            ))
        else:
            # EU country flow
            oc = countries.get(f.origin_iso)
            dc = countries.get(f.destination_iso)
            if not oc or not dc:
                continue
            results.append(RailFreightFlow(
                origin_iso=f.origin_iso,
                destination_iso=f.destination_iso,
                origin_name=oc.name,
                destination_name=dc.name,
                origin_lat=oc.centroid_lat,
                origin_lon=oc.centroid_lon,
                dest_lat=dc.centroid_lat,
                dest_lon=dc.centroid_lon,
                year=f.year,
                tonnes=f.tonnes,
                estimated=f.estimated,
            ))

    return results


@router.get("/years")
def get_rail_freight_years(db: Session = Depends(get_db)):
    """Get available years for rail freight data."""
    rows = (
        db.query(RailFreight.year)
        .distinct()
        .order_by(RailFreight.year)
        .all()
    )
    return [r.year for r in rows]

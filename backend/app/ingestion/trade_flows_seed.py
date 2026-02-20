"""
Trade Flows Seed Script
Seeds realistic bilateral trade data based on real-world trade patterns.
Sources: approximated from WTO/Comtrade published statistics.
Covers years 2018-2023 for top 40+ bilateral trade corridors.
"""
import logging
from app.core.database import SessionLocal
from app.models.country import Country  # noqa: F401 — registers FK target
from app.models.trade_flow import TradeFlow

logger = logging.getLogger(__name__)

# Realistic bilateral trade data (values in USD billions, approximated)
# Each entry: (exporter, importer, annual_value_billions, commodity_code, commodity_desc, weight_mt)
# weight_mt = approximate weight in metric tons (millions)
BILATERAL_FLOWS = [
    # US trade corridors
    ("CHN", "USA", 536.0, "TOTAL", "All commodities", 120.0),
    ("USA", "CHN", 154.0, "TOTAL", "All commodities", 45.0),
    ("MEX", "USA", 455.0, "TOTAL", "All commodities", 95.0),
    ("USA", "MEX", 324.0, "TOTAL", "All commodities", 72.0),
    ("CAN", "USA", 412.0, "TOTAL", "All commodities", 160.0),
    ("USA", "CAN", 352.0, "TOTAL", "All commodities", 85.0),
    ("DEU", "USA", 160.0, "TOTAL", "All commodities", 12.0),
    ("USA", "DEU", 90.0, "TOTAL", "All commodities", 18.0),
    ("JPN", "USA", 143.0, "TOTAL", "All commodities", 15.0),
    ("USA", "JPN", 80.0, "TOTAL", "All commodities", 30.0),
    ("KOR", "USA", 115.0, "TOTAL", "All commodities", 10.0),
    ("USA", "KOR", 65.0, "TOTAL", "All commodities", 22.0),
    ("IND", "USA", 87.0, "TOTAL", "All commodities", 12.0),
    ("USA", "IND", 42.0, "TOTAL", "All commodities", 8.0),
    ("GBR", "USA", 68.0, "TOTAL", "All commodities", 5.0),
    ("USA", "GBR", 76.0, "TOTAL", "All commodities", 9.0),
    ("VNM", "USA", 114.0, "TOTAL", "All commodities", 18.0),
    ("USA", "VNM", 12.0, "TOTAL", "All commodities", 3.0),
    ("TWN", "USA", 82.0, "TOTAL", "All commodities", 5.0),
    ("USA", "TWN", 38.0, "TOTAL", "All commodities", 8.0),

    # EU-China corridor
    ("CHN", "DEU", 195.0, "TOTAL", "All commodities", 30.0),
    ("DEU", "CHN", 107.0, "TOTAL", "All commodities", 12.0),
    ("CHN", "NLD", 120.0, "TOTAL", "All commodities", 25.0),
    ("NLD", "CHN", 28.0, "TOTAL", "All commodities", 5.0),
    ("CHN", "GBR", 78.0, "TOTAL", "All commodities", 15.0),
    ("GBR", "CHN", 32.0, "TOTAL", "All commodities", 4.0),
    ("CHN", "FRA", 68.0, "TOTAL", "All commodities", 12.0),
    ("FRA", "CHN", 38.0, "TOTAL", "All commodities", 5.0),
    ("CHN", "ITA", 58.0, "TOTAL", "All commodities", 10.0),
    ("ITA", "CHN", 22.0, "TOTAL", "All commodities", 3.0),

    # Intra-EU major flows
    ("DEU", "FRA", 125.0, "TOTAL", "All commodities", 22.0),
    ("FRA", "DEU", 88.0, "TOTAL", "All commodities", 18.0),
    ("DEU", "NLD", 118.0, "TOTAL", "All commodities", 25.0),
    ("NLD", "DEU", 130.0, "TOTAL", "All commodities", 60.0),
    ("DEU", "ITA", 85.0, "TOTAL", "All commodities", 14.0),
    ("ITA", "DEU", 78.0, "TOTAL", "All commodities", 12.0),
    ("DEU", "POL", 90.0, "TOTAL", "All commodities", 18.0),
    ("POL", "DEU", 92.0, "TOTAL", "All commodities", 20.0),
    ("DEU", "AUT", 78.0, "TOTAL", "All commodities", 12.0),
    ("AUT", "DEU", 62.0, "TOTAL", "All commodities", 10.0),
    ("FRA", "ESP", 55.0, "TOTAL", "All commodities", 10.0),
    ("ESP", "FRA", 48.0, "TOTAL", "All commodities", 12.0),
    ("NLD", "GBR", 62.0, "TOTAL", "All commodities", 15.0),
    ("GBR", "NLD", 38.0, "TOTAL", "All commodities", 8.0),
    ("BEL", "DEU", 68.0, "TOTAL", "All commodities", 20.0),
    ("DEU", "BEL", 58.0, "TOTAL", "All commodities", 15.0),

    # Asia intra-regional
    ("CHN", "JPN", 172.0, "TOTAL", "All commodities", 35.0),
    ("JPN", "CHN", 148.0, "TOTAL", "All commodities", 20.0),
    ("CHN", "KOR", 162.0, "TOTAL", "All commodities", 30.0),
    ("KOR", "CHN", 195.0, "TOTAL", "All commodities", 25.0),
    ("CHN", "VNM", 147.0, "TOTAL", "All commodities", 28.0),
    ("VNM", "CHN", 58.0, "TOTAL", "All commodities", 20.0),
    ("CHN", "IND", 118.0, "TOTAL", "All commodities", 25.0),
    ("IND", "CHN", 18.0, "TOTAL", "All commodities", 15.0),
    ("CHN", "AUS", 82.0, "TOTAL", "All commodities", 10.0),
    ("AUS", "CHN", 145.0, "TOTAL", "All commodities", 850.0),
    ("JPN", "KOR", 52.0, "TOTAL", "All commodities", 8.0),
    ("KOR", "JPN", 30.0, "TOTAL", "All commodities", 5.0),
    ("CHN", "SGP", 68.0, "TOTAL", "All commodities", 8.0),
    ("SGP", "CHN", 55.0, "TOTAL", "All commodities", 6.0),
    ("CHN", "MYS", 78.0, "TOTAL", "All commodities", 12.0),
    ("MYS", "CHN", 52.0, "TOTAL", "All commodities", 15.0),
    ("CHN", "THA", 62.0, "TOTAL", "All commodities", 10.0),
    ("THA", "CHN", 40.0, "TOTAL", "All commodities", 12.0),
    ("CHN", "IDN", 65.0, "TOTAL", "All commodities", 12.0),
    ("IDN", "CHN", 55.0, "TOTAL", "All commodities", 80.0),
    ("TWN", "CHN", 120.0, "TOTAL", "All commodities", 8.0),
    ("CHN", "TWN", 65.0, "TOTAL", "All commodities", 5.0),

    # Energy corridors
    ("SAU", "CHN", 65.0, "2709", "Crude petroleum", 120.0),
    ("SAU", "JPN", 32.0, "2709", "Crude petroleum", 55.0),
    ("SAU", "KOR", 28.0, "2709", "Crude petroleum", 48.0),
    ("SAU", "IND", 42.0, "2709", "Crude petroleum", 75.0),
    ("SAU", "USA", 15.0, "2709", "Crude petroleum", 22.0),
    ("RUS", "CHN", 110.0, "2709", "Crude petroleum & gas", 95.0),
    ("RUS", "IND", 55.0, "2709", "Crude petroleum", 80.0),
    ("RUS", "TUR", 42.0, "2711", "Natural gas", 25.0),
    ("ARE", "IND", 48.0, "2709", "Crude petroleum", 65.0),
    ("ARE", "JPN", 28.0, "2709", "Crude petroleum", 40.0),
    ("IRQ", "CHN", 35.0, "2709", "Crude petroleum", 60.0),
    ("IRQ", "IND", 32.0, "2709", "Crude petroleum", 52.0),
    ("NOR", "DEU", 38.0, "2711", "Natural gas", 20.0),
    ("NOR", "GBR", 32.0, "2709", "Crude petroleum & gas", 25.0),
    ("QAT", "KOR", 18.0, "2711", "LNG", 15.0),
    ("QAT", "JPN", 15.0, "2711", "LNG", 12.0),
    ("AUS", "JPN", 52.0, "2701", "Coal & LNG", 90.0),
    ("AUS", "KOR", 28.0, "2701", "Coal & LNG", 45.0),
    ("AUS", "IND", 22.0, "2701", "Coal", 55.0),
    ("CAN", "USA", 120.0, "2709", "Crude petroleum", 180.0),

    # Commodities / Agriculture
    ("BRA", "CHN", 105.0, "1201", "Soybeans/Iron ore/Oil", 250.0),
    ("BRA", "USA", 38.0, "TOTAL", "All commodities", 25.0),
    ("BRA", "NLD", 18.0, "TOTAL", "All commodities", 15.0),
    ("ARG", "BRA", 15.0, "TOTAL", "All commodities", 12.0),
    ("ARG", "CHN", 8.0, "1201", "Soybeans", 18.0),
    ("CHL", "CHN", 28.0, "2603", "Copper ore", 15.0),
    ("PER", "CHN", 18.0, "2603", "Copper ore", 12.0),
    ("ZAF", "CHN", 18.0, "TOTAL", "All commodities", 25.0),
    ("NGA", "IND", 12.0, "2709", "Crude petroleum", 18.0),
    ("NGA", "ESP", 8.0, "2709", "Crude petroleum", 12.0),
    ("COL", "USA", 15.0, "2709", "Crude petroleum & coal", 25.0),

    # Technology corridors
    ("TWN", "KOR", 22.0, "8542", "Semiconductors", 0.5),
    ("KOR", "VNM", 55.0, "8542", "Semiconductors & electronics", 2.0),
    ("JPN", "TWN", 42.0, "8486", "Semiconductor equipment", 1.0),
    ("NLD", "KOR", 18.0, "8486", "Lithography machines (ASML)", 0.2),
    ("NLD", "TWN", 12.0, "8486", "Lithography machines (ASML)", 0.1),
    ("DEU", "CHN", 28.0, "8703", "Vehicles", 2.5),
    ("JPN", "USA", 52.0, "8703", "Vehicles", 4.0),
    ("KOR", "USA", 32.0, "8703", "Vehicles", 2.5),
    ("DEU", "USA", 35.0, "8703", "Vehicles", 3.0),
    ("MEX", "USA", 85.0, "8703", "Vehicles & parts", 8.0),

    # Middle East / Africa
    ("TUR", "DEU", 22.0, "TOTAL", "All commodities", 6.0),
    ("DEU", "TUR", 28.0, "TOTAL", "All commodities", 5.0),
    ("TUR", "GBR", 14.0, "TOTAL", "All commodities", 4.0),
    ("EGY", "ITA", 8.0, "TOTAL", "All commodities", 5.0),
    ("ITA", "EGY", 5.0, "TOTAL", "All commodities", 3.0),
    ("CHN", "EGY", 15.0, "TOTAL", "All commodities", 8.0),
    ("CHN", "NGA", 22.0, "TOTAL", "All commodities", 10.0),
    ("CHN", "ZAF", 18.0, "TOTAL", "All commodities", 8.0),
    ("IND", "ARE", 35.0, "TOTAL", "All commodities", 15.0),
    ("ARE", "IND", 48.0, "TOTAL", "All commodities", 30.0),
]

# Year multipliers to simulate growth/decline patterns
YEAR_MULTIPLIERS = {
    2018: 0.88,
    2019: 0.85,
    2020: 0.72,  # COVID dip
    2021: 0.95,
    2022: 1.05,  # recovery + inflation
    2023: 1.00,  # baseline
}


def seed_trade_flows():
    """Seed trade flow data for years 2018-2023."""
    db = SessionLocal()

    try:
        # Check if data exists
        existing = db.query(TradeFlow).count()
        if existing > 0:
            logger.info(f"Trade flows table already has {existing} records. Clearing...")
            db.query(TradeFlow).delete()
            db.commit()

        count = 0
        for year, multiplier in YEAR_MULTIPLIERS.items():
            for (exp, imp, value_bn, commodity, desc, weight_mt) in BILATERAL_FLOWS:
                value_usd = value_bn * 1e9 * multiplier
                weight_kg = weight_mt * 1e9 if weight_mt else None  # MT to kg

                flow = TradeFlow(
                    exporter_iso=exp,
                    importer_iso=imp,
                    year=year,
                    month=None,
                    commodity_code=commodity,
                    commodity_description=desc,
                    trade_value_usd=value_usd,
                    weight_kg=weight_kg,
                    flow_type="export",
                )
                db.add(flow)
                count += 1

        db.commit()
        logger.info(f"Seeded {count} trade flow records ({len(BILATERAL_FLOWS)} corridors x {len(YEAR_MULTIPLIERS)} years)")

    finally:
        db.close()

    return count


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    seed_trade_flows()

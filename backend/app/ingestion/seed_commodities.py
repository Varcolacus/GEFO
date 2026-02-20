"""
Seed commodities, historical prices, and supply dependencies.
Uses realistic World Bank / IMF price data patterns.
"""

import logging
from app.core.database import SessionLocal
from app.models.commodity import Commodity, CommodityPrice, SupplyDependency
from app.models.country import Country  # needed for FK resolution

logger = logging.getLogger(__name__)

# ─── Commodity Master Data ────────────────────────────────────────

COMMODITIES = [
    # Energy
    {"hs_code": "2709", "name": "Crude Petroleum", "category": "energy", "sub_category": "crude_oil", "unit": "USD/bbl", "is_strategic": True, "icon": "🛢️"},
    {"hs_code": "2711", "name": "Natural Gas & LNG", "category": "energy", "sub_category": "natural_gas", "unit": "USD/MMBtu", "is_strategic": True, "icon": "🔥"},
    {"hs_code": "2701", "name": "Coal", "category": "energy", "sub_category": "coal", "unit": "USD/MT", "is_strategic": False, "icon": "⚫"},
    {"hs_code": "2716", "name": "Electrical Energy", "category": "energy", "sub_category": "electricity", "unit": "USD/MWh", "is_strategic": False, "icon": "⚡"},
    # Metals & Minerals
    {"hs_code": "2603", "name": "Copper Ore", "category": "metals", "sub_category": "copper", "unit": "USD/MT", "is_strategic": True, "icon": "🔶"},
    {"hs_code": "7108", "name": "Gold", "category": "metals", "sub_category": "gold", "unit": "USD/oz", "is_strategic": True, "icon": "🥇"},
    {"hs_code": "7601", "name": "Aluminum", "category": "metals", "sub_category": "aluminum", "unit": "USD/MT", "is_strategic": False, "icon": "🪨"},
    {"hs_code": "7202", "name": "Iron & Steel Alloys", "category": "metals", "sub_category": "iron_steel", "unit": "USD/MT", "is_strategic": False, "icon": "🔩"},
    {"hs_code": "2612", "name": "Rare Earth Elements", "category": "metals", "sub_category": "rare_earths", "unit": "USD/kg", "is_strategic": True, "icon": "💎"},
    {"hs_code": "2844", "name": "Uranium", "category": "metals", "sub_category": "uranium", "unit": "USD/lb", "is_strategic": True, "icon": "☢️"},
    {"hs_code": "8112", "name": "Lithium", "category": "metals", "sub_category": "lithium", "unit": "USD/MT", "is_strategic": True, "icon": "🔋"},
    {"hs_code": "2605", "name": "Cobalt Ore", "category": "metals", "sub_category": "cobalt", "unit": "USD/MT", "is_strategic": True, "icon": "🔵"},
    # Agriculture
    {"hs_code": "1001", "name": "Wheat", "category": "agriculture", "sub_category": "grain", "unit": "USD/bushel", "is_strategic": True, "icon": "🌾"},
    {"hs_code": "1005", "name": "Corn / Maize", "category": "agriculture", "sub_category": "grain", "unit": "USD/bushel", "is_strategic": False, "icon": "🌽"},
    {"hs_code": "1201", "name": "Soybeans", "category": "agriculture", "sub_category": "oilseeds", "unit": "USD/bushel", "is_strategic": False, "icon": "🫘"},
    {"hs_code": "1701", "name": "Sugar", "category": "agriculture", "sub_category": "sugar", "unit": "USD/lb", "is_strategic": False, "icon": "🍬"},
    {"hs_code": "0901", "name": "Coffee", "category": "agriculture", "sub_category": "beverages", "unit": "USD/lb", "is_strategic": False, "icon": "☕"},
    {"hs_code": "1511", "name": "Palm Oil", "category": "agriculture", "sub_category": "oils", "unit": "USD/MT", "is_strategic": False, "icon": "🌴"},
    # Technology
    {"hs_code": "8542", "name": "Semiconductors", "category": "technology", "sub_category": "chips", "unit": "index", "is_strategic": True, "icon": "🔌"},
    {"hs_code": "8486", "name": "Semiconductor Equipment", "category": "technology", "sub_category": "chipmaking", "unit": "index", "is_strategic": True, "icon": "🏭"},
]

# ─── Realistic Monthly Prices (2018–2023) ─────────────────────────
# Base prices and annual patterns (index: year-2018)

PRICE_PROFILES = {
    "2709": {  # Crude oil (USD/bbl)
        "base": [71, 64, 42, 71, 100, 82],
        "monthly_var": 0.06,
    },
    "2711": {  # Natural Gas (USD/MMBtu)
        "base": [3.2, 2.6, 2.0, 3.7, 6.4, 2.7],
        "monthly_var": 0.12,
    },
    "2701": {  # Coal (USD/MT)
        "base": [107, 77, 60, 140, 350, 175],
        "monthly_var": 0.08,
    },
    "2716": {  # Electricity (USD/MWh)
        "base": [45, 40, 35, 55, 90, 60],
        "monthly_var": 0.10,
    },
    "2603": {  # Copper (USD/MT)
        "base": [6530, 6010, 6174, 9317, 8822, 8477],
        "monthly_var": 0.04,
    },
    "7108": {  # Gold (USD/oz)
        "base": [1268, 1393, 1770, 1799, 1800, 1940],
        "monthly_var": 0.03,
    },
    "7601": {  # Aluminum (USD/MT)
        "base": [2110, 1794, 1704, 2480, 2710, 2255],
        "monthly_var": 0.05,
    },
    "7202": {  # Iron/Steel (USD/MT)
        "base": [69, 94, 109, 160, 121, 111],
        "monthly_var": 0.07,
    },
    "2612": {  # Rare Earths (USD/kg)
        "base": [180, 155, 200, 450, 320, 250],
        "monthly_var": 0.10,
    },
    "2844": {  # Uranium (USD/lb)
        "base": [24, 26, 30, 42, 49, 56],
        "monthly_var": 0.05,
    },
    "8112": {  # Lithium (USD/MT)
        "base": [16000, 11000, 8500, 26000, 72000, 22000],
        "monthly_var": 0.15,
    },
    "2605": {  # Cobalt (USD/MT)
        "base": [69000, 35000, 33000, 52000, 55000, 34000],
        "monthly_var": 0.08,
    },
    "1001": {  # Wheat (USD/bushel)
        "base": [5.3, 4.6, 5.5, 7.7, 9.0, 6.2],
        "monthly_var": 0.06,
    },
    "1005": {  # Corn (USD/bushel)
        "base": [3.6, 3.9, 3.6, 5.6, 6.8, 4.8],
        "monthly_var": 0.06,
    },
    "1201": {  # Soybeans (USD/bushel)
        "base": [9.3, 8.7, 10.8, 14.4, 14.9, 12.8],
        "monthly_var": 0.05,
    },
    "1701": {  # Sugar (USD/lb)
        "base": [0.12, 0.13, 0.13, 0.18, 0.19, 0.23],
        "monthly_var": 0.07,
    },
    "0901": {  # Coffee (USD/lb)
        "base": [1.12, 1.02, 1.10, 1.80, 2.15, 1.75],
        "monthly_var": 0.08,
    },
    "1511": {  # Palm Oil (USD/MT)
        "base": [588, 524, 722, 1130, 1120, 850],
        "monthly_var": 0.07,
    },
    "8542": {  # Semiconductors (index)
        "base": [100, 98, 112, 150, 140, 130],
        "monthly_var": 0.04,
    },
    "8486": {  # Semiconductor Equipment (index)
        "base": [100, 105, 120, 165, 170, 155],
        "monthly_var": 0.05,
    },
}

# Monthly seasonal factors (normalized around 1.0)
SEASONAL = [0.96, 0.97, 1.01, 1.02, 1.03, 1.02, 1.01, 1.00, 0.99, 1.00, 0.99, 1.00]

# ─── Supply Dependencies ─────────────────────────────────────────

DEPENDENCIES = [
    # (country_iso, hs_code, direction, value_usd, share_pct, world_share_pct, top_partner, hhi, risk)
    # Oil importers
    ("CHN", "2709", "import", 234e9, 18.5, 22.0, "SAU", 1200, 55),
    ("USA", "2709", "import", 132e9, 6.5, 12.4, "CAN", 2800, 25),
    ("IND", "2709", "import", 120e9, 24.0, 11.3, "IRQ", 1400, 62),
    ("JPN", "2709", "import", 78e9, 10.3, 7.3, "SAU", 1800, 48),
    ("KOR", "2709", "import", 72e9, 13.0, 6.8, "SAU", 1600, 52),
    ("DEU", "2709", "import", 45e9, 3.1, 4.2, "RUS", 2200, 40),
    # Gas importers
    ("CHN", "2711", "import", 56e9, 4.4, 16.0, "AUS", 1500, 45),
    ("JPN", "2711", "import", 52e9, 6.9, 14.9, "AUS", 1900, 42),
    ("DEU", "2711", "import", 38e9, 2.6, 10.9, "NOR", 2500, 38),
    ("KOR", "2711", "import", 35e9, 6.3, 10.0, "QAT", 1700, 50),
    # Semiconductor importers 
    ("CHN", "8542", "import", 380e9, 30.0, 40.0, "TWN", 3500, 72),
    ("USA", "8542", "import", 85e9, 4.2, 9.0, "TWN", 3200, 35),
    ("DEU", "8542", "import", 32e9, 2.2, 3.4, "NLD", 2000, 30),
    ("JPN", "8542", "import", 28e9, 3.7, 3.0, "TWN", 2800, 38),
    # Rare earths importers
    ("USA", "2612", "import", 0.7e9, 0.03, 8.0, "CHN", 7500, 85),
    ("JPN", "2612", "import", 0.5e9, 0.07, 5.7, "CHN", 6000, 80),
    ("DEU", "2612", "import", 0.3e9, 0.02, 3.4, "CHN", 5500, 78),
    # Copper importers
    ("CHN", "2603", "import", 46e9, 3.6, 42.0, "CHL", 2000, 48),
    ("JPN", "2603", "import", 12e9, 1.6, 10.9, "CHL", 2200, 40),
    ("DEU", "2603", "import", 8e9, 0.5, 7.3, "CHL", 1800, 35),
    # Wheat importers
    ("EGY", "1001", "import", 4.2e9, 6.0, 6.5, "RUS", 3800, 72),
    ("IDN", "1001", "import", 3.5e9, 1.5, 5.4, "AUS", 2500, 55),
    ("TUR", "1001", "import", 2.8e9, 1.1, 4.3, "RUS", 3200, 60),
    # Lithium importers
    ("CHN", "8112", "import", 6.5e9, 0.5, 55.0, "AUS", 3000, 65),
    ("KOR", "8112", "import", 2.8e9, 0.5, 23.7, "AUS", 3500, 60),
    ("JPN", "8112", "import", 1.5e9, 0.2, 12.7, "AUS", 3800, 58),
    # Oil exporters
    ("SAU", "2709", "export", 210e9, 70.0, 19.8, "CHN", 1500, 20),
    ("RUS", "2709", "export", 142e9, 30.0, 13.4, "CHN", 1200, 35),
    ("USA", "2709", "export", 98e9, 4.7, 9.2, "KOR", 1800, 10),
    # Gas exporters
    ("QAT", "2711", "export", 85e9, 55.0, 24.3, "KOR", 2000, 15),
    ("AUS", "2711", "export", 65e9, 15.0, 18.6, "JPN", 1800, 12),
    ("USA", "2711", "export", 45e9, 2.2, 12.9, "GBR", 1500, 8),
    # Semiconductor exporters
    ("TWN", "8542", "export", 165e9, 35.0, 17.4, "CHN", 2500, 25),
    ("KOR", "8542", "export", 130e9, 20.0, 13.7, "CHN", 2200, 22),
    ("USA", "8542", "export", 55e9, 2.7, 5.8, "CHN", 1800, 12),
]


def _generate_prices(hs_code: str, commodity_id: int) -> list:
    """Generate monthly price records for a commodity."""
    profile = PRICE_PROFILES.get(hs_code)
    if not profile:
        return []

    import math
    import random
    random.seed(hash(hs_code) % 100000)  # Deterministic per commodity

    records = []
    prev_price = None
    prev_year_prices = {}

    for year_idx, year in enumerate(range(2018, 2024)):
        base = profile["base"][year_idx]
        var = profile["monthly_var"]

        for month in range(1, 13):
            seasonal = SEASONAL[month - 1]
            noise = 1.0 + random.uniform(-var, var)
            price = round(base * seasonal * noise, 2)

            # MoM change
            mom = None
            if prev_price and prev_price > 0:
                mom = round(((price - prev_price) / prev_price) * 100, 1)

            # YoY change
            yoy = None
            key = (year - 1, month)
            if key in prev_year_prices and prev_year_prices[key] > 0:
                yoy = round(((price - prev_year_prices[key]) / prev_year_prices[key]) * 100, 1)

            high = round(price * (1 + random.uniform(0.01, var * 0.7)), 2)
            low = round(price * (1 - random.uniform(0.01, var * 0.7)), 2)

            records.append(CommodityPrice(
                commodity_id=commodity_id,
                year=year,
                month=month,
                price=price,
                price_change_pct=mom,
                yoy_change_pct=yoy,
                high=high,
                low=low,
                source="world_bank",
            ))

            prev_year_prices[(year, month)] = price
            prev_price = price

    return records


def seed_commodities():
    """Seed commodity master data, prices, and supply dependencies."""
    db = SessionLocal()
    try:
        # Clear existing
        db.query(SupplyDependency).delete()
        db.query(CommodityPrice).delete()
        db.query(Commodity).delete()
        db.commit()

        # Insert commodities
        id_map = {}  # hs_code -> id
        for data in COMMODITIES:
            c = Commodity(**data)
            db.add(c)
            db.flush()
            id_map[data["hs_code"]] = c.id
        db.commit()
        logger.info("Seeded %d commodities", len(COMMODITIES))

        # Generate and insert prices
        total_prices = 0
        for hs_code, cid in id_map.items():
            prices = _generate_prices(hs_code, cid)
            db.add_all(prices)
            total_prices += len(prices)
        db.commit()
        logger.info("Seeded %d price records", total_prices)

        # Insert supply dependencies
        dep_count = 0
        for dep in DEPENDENCIES:
            iso, hs_code, direction, value, share, world_share, partner, hhi, risk = dep
            cid = id_map.get(hs_code)
            if not cid:
                continue
            db.add(SupplyDependency(
                country_iso=iso,
                commodity_id=cid,
                year=2023,
                direction=direction,
                value_usd=value,
                share_pct=share,
                world_share_pct=world_share,
                top_partner_iso=partner,
                concentration_hhi=hhi,
                risk_score=risk,
            ))
            dep_count += 1
        db.commit()
        logger.info("Seeded %d supply dependencies", dep_count)

    finally:
        db.close()


if __name__ == "__main__":
    seed_commodities()

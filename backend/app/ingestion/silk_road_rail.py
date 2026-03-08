"""
Seed estimated China-Europe Railway Express (CERE) and Trans-Caspian / Middle
Corridor rail freight data.

Sources:
  - China Railway Express official statistics (train counts, TEU volumes)
  - UTLC ERA (Eurasian Rail Alliance) annual reports
  - BTK (Baku-Tbilisi-Kars) railway published throughput
  - Middle Corridor / Trans-Caspian International Transport Route (TITR) stats

Methodology:
  Volume in thousand tonnes (THS_T).  Total CERE volumes distributed across
  known bilateral OD pairs based on published corridor share estimates.
  The Middle Corridor (Trans-Caspian) volumes sourced from TITR/BTK reports.
"""

import logging
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.core.database import SessionLocal, engine
from app.models.rail_freight import RailFreight

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")

# ── China-Europe Railway Express total volumes (thousand tonnes) ──
# Derived from published train counts × avg ~41 TEU/train × ~10 t/TEU
CERE_TOTAL: dict[int, float] = {
    2017: 2600,
    2018: 5800,
    2019: 7250,
    2020: 11350,
    2021: 14610,
    2022: 16100,
    2023: 19000,
    2024: 20500,
}

# ── Bilateral share of CERE westbound (China → Europe) ──
# Based on published destination distribution; roughly 60% is westbound
WESTBOUND_SHARE = 0.60
CERE_WB_SPLITS: dict[str, float] = {
    "DEU": 0.30,   # Duisburg, Hamburg
    "POL": 0.18,   # Łódź, Małaszewicze
    "NLD": 0.06,   # Tilburg, Rotterdam
    "FRA": 0.05,   # Lyon, Paris
    "ESP": 0.05,   # Madrid
    "BEL": 0.04,   # Liège
    "CZE": 0.04,   # Prague
    "ITA": 0.04,   # Milan
    "GBR": 0.03,   # London (via Channel Tunnel)
    "HUN": 0.03,   # Budapest
    "SVK": 0.02,   # Bratislava
    "AUT": 0.02,   # Vienna
    "LTU": 0.02,   # Vilnius
    "SWE": 0.01,   # via ferry
    "FIN": 0.01,   # via Russia
}

# Eastbound (Europe → China): roughly 40% of total, concentrated on fewer ODs
EASTBOUND_SHARE = 0.40
CERE_EB_SPLITS: dict[str, float] = {
    "DEU": 0.35,
    "POL": 0.15,
    "FRA": 0.08,
    "ESP": 0.07,
    "ITA": 0.06,
    "NLD": 0.05,
    "BEL": 0.05,
    "CZE": 0.04,
    "GBR": 0.03,
    "HUN": 0.03,
    "AUT": 0.03,
    "FIN": 0.02,
    "SVK": 0.02,
    "LTU": 0.02,
}

# ── Transit flows (Northern route via Kazakhstan & Russia) ──
# Kazakhstan acts as the main transit corridor; these are transit-induced
# domestic rail freight (not bilateral trade goods).
# KAZ transit volumes published by KTZ (Kazakhstan Temir Zholy):
KAZ_TRANSIT: dict[int, float] = {
    2017: 1800,
    2018: 3500,
    2019: 4800,
    2020: 7500,
    2021: 10200,
    2022: 11500,
    2023: 14500,
    2024: 16000,
}

# ── Middle Corridor (Trans-Caspian) ──
# Volumes via BTK railway + Caspian ferry (TITR reported data)
MIDDLE_CORRIDOR: dict[int, float] = {
    2017: 50,
    2018: 120,
    2019: 250,
    2020: 350,
    2021: 550,
    2022: 1500,   # Surge after Russia-Ukraine war
    2023: 2700,
    2024: 4200,
}

# ── Russia transit (Trans-Siberian/Manchurian routes) ──
# Russia's share of CERE transit
RUS_TRANSIT: dict[int, float] = {
    2017: 1500,
    2018: 3200,
    2019: 4500,
    2020: 7000,
    2021: 9500,
    2022: 8000,   # Decline due to sanctions
    2023: 7500,
    2024: 7000,
}

# ── Mongolia transit (Trans-Mongolian route) ──
MNG_TRANSIT: dict[int, float] = {
    2017: 300,
    2018: 600,
    2019: 900,
    2020: 1200,
    2021: 1500,
    2022: 2500,   # Growth as alternative to Russia
    2023: 3500,
    2024: 4000,
}

# ── Belarus transit ──
BLR_TRANSIT: dict[int, float] = {
    2017: 1200,
    2018: 2800,
    2019: 3800,
    2020: 5800,
    2021: 7500,
    2022: 5000,   # Decline due to sanctions
    2023: 4800,
    2024: 4500,
}


def _build_records() -> list[dict]:
    """Generate estimated bilateral rail freight records."""
    records: list[dict] = []

    for year, total in CERE_TOTAL.items():
        # Westbound: CHN → European countries
        wb_total = total * WESTBOUND_SHARE
        for dest_iso, share in CERE_WB_SPLITS.items():
            tonnes = round(wb_total * share, 1)
            if tonnes >= 1:
                records.append({
                    "origin_iso": "CHN",
                    "destination_iso": dest_iso,
                    "year": year,
                    "tonnes": tonnes,
                    "tonne_km": None,
                    "estimated": True,
                })

        # Eastbound: European countries → CHN
        eb_total = total * EASTBOUND_SHARE
        for orig_iso, share in CERE_EB_SPLITS.items():
            tonnes = round(eb_total * share, 1)
            if tonnes >= 1:
                records.append({
                    "origin_iso": orig_iso,
                    "destination_iso": "CHN",
                    "year": year,
                    "tonnes": tonnes,
                    "tonne_km": None,
                    "estimated": True,
                })

    # Transit corridor bilateral pairs
    for year in CERE_TOTAL:
        # CHN → KAZ (Khorgos/Dostyk crossing)
        records.append({
            "origin_iso": "CHN", "destination_iso": "KAZ",
            "year": year, "tonnes": KAZ_TRANSIT[year], "tonne_km": None,
                    "estimated": True,
        })
        records.append({
            "origin_iso": "KAZ", "destination_iso": "CHN",
            "year": year, "tonnes": round(KAZ_TRANSIT[year] * 0.75, 1), "tonne_km": None,
                    "estimated": True,
        })

        # KAZ → RUS (Petropavl / Kostanay crossing)
        records.append({
            "origin_iso": "KAZ", "destination_iso": "RUS",
            "year": year, "tonnes": round(RUS_TRANSIT[year] * 0.7, 1), "tonne_km": None,
                    "estimated": True,
        })
        records.append({
            "origin_iso": "RUS", "destination_iso": "KAZ",
            "year": year, "tonnes": round(RUS_TRANSIT[year] * 0.5, 1), "tonne_km": None,
                    "estimated": True,
        })

        # CHN → MNG → RUS (Trans-Mongolian)
        records.append({
            "origin_iso": "CHN", "destination_iso": "MNG",
            "year": year, "tonnes": MNG_TRANSIT[year], "tonne_km": None,
                    "estimated": True,
        })
        records.append({
            "origin_iso": "MNG", "destination_iso": "RUS",
            "year": year, "tonnes": round(MNG_TRANSIT[year] * 0.95, 1), "tonne_km": None,
                    "estimated": True,
        })

        # RUS → BLR (transit to Poland)
        records.append({
            "origin_iso": "RUS", "destination_iso": "BLR",
            "year": year, "tonnes": BLR_TRANSIT[year], "tonne_km": None,
                    "estimated": True,
        })
        records.append({
            "origin_iso": "BLR", "destination_iso": "POL",
            "year": year, "tonnes": round(BLR_TRANSIT[year] * 0.9, 1), "tonne_km": None,
                    "estimated": True,
        })

        # Middle Corridor: CHN → KAZ → (Caspian) → AZE → GEO → TUR
        mc = MIDDLE_CORRIDOR[year]
        if mc >= 1:
            records.append({
                "origin_iso": "KAZ", "destination_iso": "AZE",
                "year": year, "tonnes": mc, "tonne_km": None,
                    "estimated": True,
            })
            records.append({
                "origin_iso": "AZE", "destination_iso": "GEO",
                "year": year, "tonnes": round(mc * 0.95, 1), "tonne_km": None,
                    "estimated": True,
            })
            records.append({
                "origin_iso": "GEO", "destination_iso": "TUR",
                "year": year, "tonnes": round(mc * 0.9, 1), "tonne_km": None,
                    "estimated": True,
            })
            # Reverse direction
            records.append({
                "origin_iso": "TUR", "destination_iso": "GEO",
                "year": year, "tonnes": round(mc * 0.3, 1), "tonne_km": None,
                    "estimated": True,
            })
            records.append({
                "origin_iso": "GEO", "destination_iso": "AZE",
                "year": year, "tonnes": round(mc * 0.28, 1), "tonne_km": None,
                    "estimated": True,
            })
            records.append({
                "origin_iso": "AZE", "destination_iso": "KAZ",
                "year": year, "tonnes": round(mc * 0.25, 1), "tonne_km": None,
                    "estimated": True,
            })

        # CHN → RUS direct (Trans-Manchurian: Manzhouli crossing)
        records.append({
            "origin_iso": "CHN", "destination_iso": "RUS",
            "year": year, "tonnes": round(RUS_TRANSIT[year] * 0.3, 1), "tonne_km": None,
                    "estimated": True,
        })
        records.append({
            "origin_iso": "RUS", "destination_iso": "CHN",
            "year": year, "tonnes": round(RUS_TRANSIT[year] * 0.2, 1), "tonne_km": None,
                    "estimated": True,
        })

    return records


def seed():
    """Insert estimated Silk Road rail freight data into the DB."""
    RailFreight.__table__.create(engine, checkfirst=True)

    records = _build_records()
    log.info("Generated %d estimated Silk Road rail freight records", len(records))

    # Upsert in batches
    db = SessionLocal()
    try:
        batch_size = 200
        for i in range(0, len(records), batch_size):
            batch = records[i : i + batch_size]
            if not batch:
                continue
            stmt = pg_insert(RailFreight).values(batch)
            stmt = stmt.on_conflict_do_update(
                constraint="uq_rail_freight_od_year",
                set_={
                    "tonnes": stmt.excluded.tonnes,
                    "tonne_km": stmt.excluded.tonne_km,
                    "estimated": stmt.excluded.estimated,
                },
            )
            db.execute(stmt)
            db.commit()

        count = db.query(RailFreight).filter(
            RailFreight.origin_iso.in_(["CHN", "KAZ", "MNG", "AZE", "GEO"])
            | RailFreight.destination_iso.in_(["CHN", "KAZ", "MNG", "AZE", "GEO"])
        ).count()
        log.info("Silk Road rail freight seeding complete: %d records", count)
    finally:
        db.close()


if __name__ == "__main__":
    seed()

"""
Seed estimated rail freight data for additional global corridors:
  - INSTC (International North-South Transport Corridor): India-Iran-Azerbaijan-Russia
  - China-Laos Railway (Kunming-Vientiane)
  - China-Vietnam rail freight (Kunming-Hanoi)
  - Indian subcontinent cross-border (India-Bangladesh, India-Pakistan, India-Nepal)
  - Iran corridors (Iran-Turkey, Iran-Turkmenistan, Iran-Pakistan, Iran-Afghanistan)
  - Gulf/Middle East (Saudi Arabia-UAE, Iraq)
  - Southeast Asia (Thailand-Laos, Thailand-Malaysia-Singapore, Myanmar)

Sources & methodology:
  - INSTC: UNCTAD/IRU published corridor volume reports, Iran Railways (RAI)
    annual stats, Russian Railways RZD INSTC segment reports
  - China-Laos: Laos-China Railway Co. published volume data (opened Dec 2021)
  - China-Vietnam: Vietnam Railways (VNR) bilateral statistics
  - Indian Railways: RITES/Ministry of Railways annual freight origin-destination
  - Iran: RAI (Islamic Republic of Iran Railways) yearbooks
  - Southeast Asia: ASEAN rail connectivity reports, SRT/KTMB annual reports

Volumes in thousand tonnes (THS_T).
"""

import logging
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.core.database import SessionLocal, engine
from app.models.rail_freight import RailFreight

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")


# ═══════════════════════════════════════════════════════════════════════
# 1. INSTC — International North-South Transport Corridor
#    India (Mumbai/JNPT) → Iran (Bandar Abbas → Tehran) → Azer (Baku) → Russia
#    Also: Iran → Turkmenistan → Kazakhstan northern branch
# ═══════════════════════════════════════════════════════════════════════
INSTC_TOTAL: dict[int, float] = {
    2017: 800,
    2018: 1200,
    2019: 1500,
    2020: 1800,
    2021: 2500,
    2022: 5000,    # Major surge after Russia diverted trade post-sanctions
    2023: 8000,
    2024: 12000,
}

INSTC_FLOWS = [
    # (origin, dest, share_of_total)
    ("IND", "IRN", 0.35),   # India → Iran (Chabahar/Bandar Abbas)
    ("IRN", "IND", 0.20),   # Iran → India (oil products, petrochemicals)
    ("IRN", "AZE", 0.30),   # Iran → Azerbaijan (Astara crossing)
    ("AZE", "IRN", 0.15),   # Azerbaijan → Iran
    ("AZE", "RUS", 0.25),   # Azerbaijan → Russia (onward to Moscow)
    ("RUS", "AZE", 0.18),   # Russia → Azerbaijan (southbound)
    ("RUS", "IRN", 0.10),   # Russia → Iran (via Aze transit, grain/metals)
    ("IRN", "RUS", 0.12),   # Iran → Russia
]


# ═══════════════════════════════════════════════════════════════════════
# 2. China-Laos Railway (Kunming–Vientiane, opened Dec 2021)
# ═══════════════════════════════════════════════════════════════════════
CHINA_LAOS: dict[int, float] = {
    2022: 2800,    # First full year
    2023: 5500,
    2024: 9000,
}

CHINA_LAOS_FLOWS = [
    ("CHN", "LAO", 0.55),   # Manufactured goods, machinery southbound
    ("LAO", "CHN", 0.30),   # Agricultural products, minerals northbound
    ("LAO", "THA", 0.15),   # Transshipment onward to Thailand
    ("THA", "LAO", 0.10),   # Thai goods through Laos to China
    ("THA", "CHN", 0.08),   # Through-freight Thailand → China via Laos
    ("CHN", "THA", 0.12),   # Through-freight China → Thailand via Laos
]


# ═══════════════════════════════════════════════════════════════════════
# 3. China-Vietnam rail (Kunming–Hanoi via Lao Cai / Dong Dang)
# ═══════════════════════════════════════════════════════════════════════
CHINA_VIETNAM: dict[int, float] = {
    2017: 1200,
    2018: 1500,
    2019: 1800,
    2020: 2200,
    2021: 3000,
    2022: 3800,
    2023: 4500,
    2024: 5200,
}

CHINA_VIETNAM_FLOWS = [
    ("CHN", "VNM", 0.60),   # Electronics, machinery, consumer goods
    ("VNM", "CHN", 0.40),   # Agricultural, seafood, minerals
]


# ═══════════════════════════════════════════════════════════════════════
# 4. Indian subcontinent cross-border
# ═══════════════════════════════════════════════════════════════════════
# India-Bangladesh: revived rail links (Haldibari-Chilahati, Maitree Express etc.)
IND_BGD: dict[int, float] = {
    2017: 150,
    2018: 250,
    2019: 350,
    2020: 200,   # COVID
    2021: 400,
    2022: 600,
    2023: 900,
    2024: 1200,
}
IND_BGD_FLOWS = [
    ("IND", "BGD", 0.65),
    ("BGD", "IND", 0.35),
]

# India-Nepal: very limited (Jaynagar-Bardibas, Jogbani-Biratnagar)
IND_NPL: dict[int, float] = {
    2017: 30,
    2018: 40,
    2019: 50,
    2020: 25,
    2021: 60,
    2022: 80,
    2023: 100,
    2024: 120,
}
IND_NPL_FLOWS = [
    ("IND", "NPL", 0.80),
    ("NPL", "IND", 0.20),
]

# India-Pakistan: limited (Samjhauta Express suspended since 2019, Munabao-Khokhrapar)
IND_PAK: dict[int, float] = {
    2017: 80,
    2018: 60,
    2019: 10,    # Suspended after Balakot
    2020: 5,
    2021: 5,
    2022: 5,
    2023: 5,
    2024: 5,
}
IND_PAK_FLOWS = [
    ("IND", "PAK", 0.55),
    ("PAK", "IND", 0.45),
]


# ═══════════════════════════════════════════════════════════════════════
# 5. Iran corridors
# ═══════════════════════════════════════════════════════════════════════
# Turkey ↔ Iran (Lake Van ferry rail + Tehran-Ankara)
IRN_TUR: dict[int, float] = {
    2017: 500,
    2018: 600,
    2019: 700,
    2020: 450,
    2021: 800,
    2022: 1200,
    2023: 1500,
    2024: 1800,
}
IRN_TUR_FLOWS = [
    ("IRN", "TUR", 0.55),
    ("TUR", "IRN", 0.45),
]

# Iran ↔ Turkmenistan (Sarakhs crossing)
IRN_TKM: dict[int, float] = {
    2017: 400,
    2018: 500,
    2019: 600,
    2020: 350,
    2021: 700,
    2022: 1000,
    2023: 1300,
    2024: 1600,
}
IRN_TKM_FLOWS = [
    ("IRN", "TKM", 0.50),
    ("TKM", "IRN", 0.50),
]

# Iran ↔ Afghanistan (Khaf-Herat railway, opened 2021)
IRN_AFG: dict[int, float] = {
    2021: 100,
    2022: 200,
    2023: 350,
    2024: 500,
}
IRN_AFG_FLOWS = [
    ("IRN", "AFG", 0.70),   # Fuel, construction materials
    ("AFG", "IRN", 0.30),   # Minerals, agricultural
]

# Iran ↔ Pakistan (Quetta-Zahedan / Mirjaveh crossing)
IRN_PAK: dict[int, float] = {
    2017: 200,
    2018: 250,
    2019: 300,
    2020: 180,
    2021: 350,
    2022: 450,
    2023: 550,
    2024: 650,
}
IRN_PAK_FLOWS = [
    ("IRN", "PAK", 0.55),
    ("PAK", "IRN", 0.45),
]

# Iran ↔ Iraq (Shalamcheh-Basra planned, limited existing via Khorramshahr)
IRN_IRQ: dict[int, float] = {
    2017: 100,
    2018: 120,
    2019: 150,
    2020: 80,
    2021: 180,
    2022: 250,
    2023: 350,
    2024: 450,
}
IRN_IRQ_FLOWS = [
    ("IRN", "IRQ", 0.60),
    ("IRQ", "IRN", 0.40),
]


# ═══════════════════════════════════════════════════════════════════════
# 6. Gulf / Middle East
# ═══════════════════════════════════════════════════════════════════════
# Saudi Arabia: Riyadh-Dammam + SAR North-South Railway (domestic but strategic)
# We model Saudi ↔ UAE (Etihad Rail connection planned/early ops)
SAU_ARE: dict[int, float] = {
    2022: 50,
    2023: 150,
    2024: 400,
}
SAU_ARE_FLOWS = [
    ("SAU", "ARE", 0.55),
    ("ARE", "SAU", 0.45),
]


# ═══════════════════════════════════════════════════════════════════════
# 7. Southeast Asia
# ═══════════════════════════════════════════════════════════════════════
# Thailand-Malaysia (KTM/SRT cross-border at Padang Besar)
THA_MYS: dict[int, float] = {
    2017: 200,
    2018: 250,
    2019: 300,
    2020: 150,
    2021: 280,
    2022: 350,
    2023: 420,
    2024: 500,
}
THA_MYS_FLOWS = [
    ("THA", "MYS", 0.50),
    ("MYS", "THA", 0.40),
    ("MYS", "SGP", 0.15),   # Onward freight to Singapore
    ("SGP", "MYS", 0.10),
]

# Myanmar: Yangon-Mandalay corridor (mostly domestic, some China cross-border)
CHN_MMR: dict[int, float] = {
    2017: 80,
    2018: 100,
    2019: 120,
    2020: 60,
    2021: 40,    # Coup impact
    2022: 50,
    2023: 70,
    2024: 90,
}
CHN_MMR_FLOWS = [
    ("CHN", "MMR", 0.60),
    ("MMR", "CHN", 0.40),
]


# ═══════════════════════════════════════════════════════════════════════
# Build all records
# ═══════════════════════════════════════════════════════════════════════
ALL_CORRIDORS = [
    (INSTC_TOTAL, INSTC_FLOWS),
    (CHINA_LAOS, CHINA_LAOS_FLOWS),
    (CHINA_VIETNAM, CHINA_VIETNAM_FLOWS),
    (IND_BGD, IND_BGD_FLOWS),
    (IND_NPL, IND_NPL_FLOWS),
    (IND_PAK, IND_PAK_FLOWS),
    (IRN_TUR, IRN_TUR_FLOWS),
    (IRN_TKM, IRN_TKM_FLOWS),
    (IRN_AFG, IRN_AFG_FLOWS),
    (IRN_PAK, IRN_PAK_FLOWS),
    (IRN_IRQ, IRN_IRQ_FLOWS),
    (SAU_ARE, SAU_ARE_FLOWS),
    (THA_MYS, THA_MYS_FLOWS),
    (CHN_MMR, CHN_MMR_FLOWS),
]


def _build_records() -> list[dict]:
    records: list[dict] = []
    for totals, flows in ALL_CORRIDORS:
        for year, total in totals.items():
            for orig, dest, share in flows:
                tonnes = round(total * share, 1)
                if tonnes >= 1:
                    records.append({
                        "origin_iso": orig,
                        "destination_iso": dest,
                        "year": year,
                        "tonnes": tonnes,
                        "tonne_km": None,
                        "estimated": True,
                    })
    return records


def seed():
    """Insert estimated corridor rail freight data into the DB."""
    RailFreight.__table__.create(engine, checkfirst=True)

    records = _build_records()
    log.info("Generated %d estimated corridor rail freight records", len(records))

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

        log.info("Corridor rail freight seeding complete: %d records generated", len(records))
    finally:
        db.close()


if __name__ == "__main__":
    seed()

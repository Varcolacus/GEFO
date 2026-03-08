"""
Seed estimated rail freight data for additional global corridors:
  - INSTC (International North-South Transport Corridor): India-Iran-Azerbaijan-Russia
  - China-Laos Railway (Kunming-Vientiane)
  - China-Vietnam rail freight (Kunming-Hanoi)
  - Indian subcontinent cross-border (India-Bangladesh, India-Pakistan, India-Nepal)
  - Iran corridors (Iran-Turkey, Iran-Turkmenistan, Iran-Pakistan, Iran-Afghanistan)
  - Gulf/Middle East (Saudi Arabia-UAE, Iraq)
  - Southeast Asia (Thailand-Laos, Thailand-Malaysia-Singapore, Myanmar)
  - African cross-border (ZAF-MOZ, ZAF-ZWE, ZAF-BWA, ZWE-ZMB, ZMB-COD, ZMB-TZA,
    ETH-DJI, MOZ-MWI, KEN-UGA)
  - Australian interstate (NSW-VIC, NSW-QLD, SA-WA, SA-VIC, SA-NSW, SA-NT, QLD-VIC)

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
# 8. AFRICAN CROSS-BORDER CORRIDORS
# ═══════════════════════════════════════════════════════════════════════

# South Africa ↔ Mozambique  (Maputo corridor — coal, chrome, magnetite)
# Source: Transnet Freight Rail annual results, Grindrod/MPDC Maputo corridor stats
ZAF_MOZ: dict[int, float] = {
    2017: 12000,
    2018: 13000,
    2019: 14000,
    2020: 11000,
    2021: 13500,
    2022: 15000,
    2023: 16000,
    2024: 17000,
}
ZAF_MOZ_FLOWS = [
    ("ZAF", "MOZ", 0.75),   # Coal/chrome to Maputo port
    ("MOZ", "ZAF", 0.25),   # Return flows
]

# South Africa ↔ Zimbabwe  (Beitbridge corridor — general cargo, chrome)
ZAF_ZWE: dict[int, float] = {
    2017: 2500,
    2018: 2800,
    2019: 3000,
    2020: 2000,
    2021: 2600,
    2022: 3000,
    2023: 3200,
    2024: 3500,
}
ZAF_ZWE_FLOWS = [
    ("ZAF", "ZWE", 0.60),   # Fuel, manufactured goods northbound
    ("ZWE", "ZAF", 0.40),   # Chrome, nickel, ferrochrome
]

# South Africa ↔ Botswana  (soda ash, coal)
ZAF_BWA: dict[int, float] = {
    2017: 1500,
    2018: 1700,
    2019: 1800,
    2020: 1400,
    2021: 1800,
    2022: 2000,
    2023: 2200,
    2024: 2400,
}
ZAF_BWA_FLOWS = [
    ("ZAF", "BWA", 0.55),
    ("BWA", "ZAF", 0.45),   # Soda ash, coal exports via SA ports
]

# Zimbabwe ↔ Zambia  (Victoria Falls / Livingstone bridge — copper, general)
ZWE_ZMB: dict[int, float] = {
    2017: 800,
    2018: 900,
    2019: 1000,
    2020: 600,
    2021: 900,
    2022: 1100,
    2023: 1200,
    2024: 1300,
}
ZWE_ZMB_FLOWS = [
    ("ZMB", "ZWE", 0.55),   # Copper southbound
    ("ZWE", "ZMB", 0.45),   # Fuel, general cargo
]

# Zambia ↔ DRC (Copperbelt — copper/cobalt)
ZMB_COD: dict[int, float] = {
    2017: 1500,
    2018: 1800,
    2019: 2000,
    2020: 1600,
    2021: 2200,
    2022: 2500,
    2023: 2800,
    2024: 3000,
}
ZMB_COD_FLOWS = [
    ("COD", "ZMB", 0.65),   # Copper/cobalt from Katanga to Zambia rail
    ("ZMB", "COD", 0.35),   # Fuel, supplies northbound
]

# Zambia ↔ Tanzania (TAZARA railway)
ZMB_TZA: dict[int, float] = {
    2017: 500,
    2018: 600,
    2019: 700,
    2020: 400,
    2021: 650,
    2022: 800,
    2023: 900,
    2024: 1000,
}
ZMB_TZA_FLOWS = [
    ("ZMB", "TZA", 0.55),   # Copper to Dar port
    ("TZA", "ZMB", 0.45),   # Imports from Dar
]

# Ethiopia ↔ Djibouti (Addis Ababa–Djibouti SGR, opened Jan 2018)
ETH_DJI: dict[int, float] = {
    2018: 500,
    2019: 1200,
    2020: 1500,
    2021: 2000,
    2022: 2500,
    2023: 3000,
    2024: 3500,
}
ETH_DJI_FLOWS = [
    ("DJI", "ETH", 0.70),   # Imports via Djibouti port to landlocked Ethiopia
    ("ETH", "DJI", 0.30),   # Ethiopian exports (coffee, oilseeds)
]

# Mozambique ↔ Malawi (Nacala corridor — coal, general)
MOZ_MWI: dict[int, float] = {
    2017: 2000,
    2018: 3000,
    2019: 4000,
    2020: 3500,
    2021: 4500,
    2022: 5000,
    2023: 5500,
    2024: 6000,
}
MOZ_MWI_FLOWS = [
    ("MWI", "MOZ", 0.60),   # Coal + general cargo to Nacala port
    ("MOZ", "MWI", 0.40),   # Imports from Nacala port to Malawi
]

# Kenya ↔ Uganda (old metre gauge, Mombasa-Nairobi-Malaba-Kampala)
KEN_UGA: dict[int, float] = {
    2017: 400,
    2018: 350,
    2019: 300,
    2020: 200,
    2021: 250,
    2022: 300,
    2023: 350,
    2024: 400,
}
KEN_UGA_FLOWS = [
    ("KEN", "UGA", 0.55),   # Mombasa port → Uganda imports
    ("UGA", "KEN", 0.45),   # Ugandan exports to Mombasa
]


# ═══════════════════════════════════════════════════════════════════════
# 9. AUSTRALIAN INTERSTATE RAIL FREIGHT
#    Source: BITRE (Bureau of Infrastructure and Transport Research
#    Economics) "Trainline" annual statistical reports, ARTC annual reports
#    Volumes in thousand tonnes (THS_T) — interstate intermodal + bulk
# ═══════════════════════════════════════════════════════════════════════

# NSW ↔ Victoria (Sydney–Melbourne corridor, busiest intermodal)
AU_NSW_VIC: dict[int, float] = {
    2017: 12000,
    2018: 12500,
    2019: 13000,
    2020: 11000,
    2021: 13500,
    2022: 14000,
    2023: 14500,
    2024: 15000,
}
AU_NSW_VIC_FLOWS = [
    ("AU-NSW", "AU-VIC", 0.55),
    ("AU-VIC", "AU-NSW", 0.45),
]

# NSW ↔ Queensland (Sydney–Brisbane)
AU_NSW_QLD: dict[int, float] = {
    2017: 7000,
    2018: 7500,
    2019: 8000,
    2020: 6500,
    2021: 7800,
    2022: 8500,
    2023: 9000,
    2024: 9500,
}
AU_NSW_QLD_FLOWS = [
    ("AU-NSW", "AU-QLD", 0.50),
    ("AU-QLD", "AU-NSW", 0.50),
]

# SA ↔ WA (Adelaide–Perth transcontinental, Indian Pacific corridor)
AU_SA_WA: dict[int, float] = {
    2017: 4000,
    2018: 4200,
    2019: 4500,
    2020: 3800,
    2021: 4600,
    2022: 5000,
    2023: 5300,
    2024: 5500,
}
AU_SA_WA_FLOWS = [
    ("AU-SA", "AU-WA", 0.50),
    ("AU-WA", "AU-SA", 0.50),
]

# SA ↔ Victoria (Adelaide–Melbourne)
AU_SA_VIC: dict[int, float] = {
    2017: 2500,
    2018: 2700,
    2019: 2800,
    2020: 2200,
    2021: 2700,
    2022: 3000,
    2023: 3200,
    2024: 3400,
}
AU_SA_VIC_FLOWS = [
    ("AU-SA", "AU-VIC", 0.50),
    ("AU-VIC", "AU-SA", 0.50),
]

# SA ↔ NSW (Adelaide–Sydney via Broken Hill)
AU_SA_NSW: dict[int, float] = {
    2017: 2000,
    2018: 2100,
    2019: 2200,
    2020: 1800,
    2021: 2200,
    2022: 2500,
    2023: 2600,
    2024: 2800,
}
AU_SA_NSW_FLOWS = [
    ("AU-SA", "AU-NSW", 0.50),
    ("AU-NSW", "AU-SA", 0.50),
]

# SA ↔ NT (Adelaide–Darwin, The Ghan corridor)
AU_SA_NT: dict[int, float] = {
    2017: 600,
    2018: 650,
    2019: 700,
    2020: 550,
    2021: 700,
    2022: 800,
    2023: 850,
    2024: 900,
}
AU_SA_NT_FLOWS = [
    ("AU-SA", "AU-NT", 0.60),   # More freight northbound (supplies)
    ("AU-NT", "AU-SA", 0.40),   # Minerals, livestock southbound
]

# QLD ↔ Victoria (Brisbane–Melbourne inland rail, limited before inland rail)
AU_QLD_VIC: dict[int, float] = {
    2017: 1500,
    2018: 1600,
    2019: 1700,
    2020: 1300,
    2021: 1700,
    2022: 1800,
    2023: 1900,
    2024: 2000,
}
AU_QLD_VIC_FLOWS = [
    ("AU-QLD", "AU-VIC", 0.50),
    ("AU-VIC", "AU-QLD", 0.50),
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
    # African cross-border
    (ZAF_MOZ, ZAF_MOZ_FLOWS),
    (ZAF_ZWE, ZAF_ZWE_FLOWS),
    (ZAF_BWA, ZAF_BWA_FLOWS),
    (ZWE_ZMB, ZWE_ZMB_FLOWS),
    (ZMB_COD, ZMB_COD_FLOWS),
    (ZMB_TZA, ZMB_TZA_FLOWS),
    (ETH_DJI, ETH_DJI_FLOWS),
    (MOZ_MWI, MOZ_MWI_FLOWS),
    (KEN_UGA, KEN_UGA_FLOWS),
    # Australian interstate
    (AU_NSW_VIC, AU_NSW_VIC_FLOWS),
    (AU_NSW_QLD, AU_NSW_QLD_FLOWS),
    (AU_SA_WA, AU_SA_WA_FLOWS),
    (AU_SA_VIC, AU_SA_VIC_FLOWS),
    (AU_SA_NSW, AU_SA_NSW_FLOWS),
    (AU_SA_NT, AU_SA_NT_FLOWS),
    (AU_QLD_VIC, AU_QLD_VIC_FLOWS),
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

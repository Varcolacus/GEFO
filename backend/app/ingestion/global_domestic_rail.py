"""
Global domestic & small cross-border rail freight corridors.
All data is ESTIMATED from public sources:
  - UIC World Rail Statistics 2024
  - National railway annual reports (China Railway, Indian Railways,
    RZD, CN Rail, CP Rail, KTZ, Ukrzaliznytsia, etc.)
  - OECD/ITF Transport Statistics
  - World Bank Transport & Logistics data
  - Industry reports (mining companies, port authorities)

Volumes in thousand tonnes (THS_T).
All records are marked estimated = True.
"""
from __future__ import annotations
import logging
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.core.database import engine
from app.models.rail_freight import RailFreight

log = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════
# CHINA DOMESTIC  (Source: China Railway Corp, NBS)
# Total rail freight ~4.9 billion tonnes. Sub-national: province codes
# ═══════════════════════════════════════════════════════════════════════

# Datong–Qinhuangdao coal line (Shanxi → Hebei coast)
CN_DAQIN: dict[int, float] = {
    2017: 420000, 2018: 450000, 2019: 440000, 2020: 400000,
    2021: 420000, 2022: 410000, 2023: 405000, 2024: 400000,
}
CN_DAQIN_FLOWS = [("CN-SX", "CN-HE", 0.95), ("CN-HE", "CN-SX", 0.05)]

# Shenhua (Shenshuo–Huanghua coal line, Inner Mongolia → Hebei)
CN_SHENHUA: dict[int, float] = {
    2017: 200000, 2018: 220000, 2019: 250000, 2020: 280000,
    2021: 300000, 2022: 310000, 2023: 320000, 2024: 330000,
}
CN_SHENHUA_FLOWS = [("CN-NM", "CN-HE", 0.95), ("CN-HE", "CN-NM", 0.05)]

# Menghua Railway (Inner Mongolia → Jiangxi, coal)
CN_MENGHUA: dict[int, float] = {
    2017: 0, 2018: 0, 2019: 0, 2020: 50000,
    2021: 120000, 2022: 180000, 2023: 220000, 2024: 260000,
}
CN_MENGHUA_FLOWS = [("CN-NM", "CN-JX", 0.90), ("CN-JX", "CN-NM", 0.10)]

# Beijing–Guangzhou corridor (general freight, north→south)
CN_JINGGUANG: dict[int, float] = {
    2017: 180000, 2018: 185000, 2019: 182000, 2020: 170000,
    2021: 178000, 2022: 175000, 2023: 180000, 2024: 182000,
}
CN_JINGGUANG_FLOWS = [
    ("CN-HE", "CN-GD", 0.30), ("CN-GD", "CN-HE", 0.15),
    ("CN-HN", "CN-GD", 0.20), ("CN-GD", "CN-HN", 0.10),
    ("CN-HE", "CN-HN", 0.15), ("CN-HN", "CN-HE", 0.10),
]

# Lanzhou–Xinjiang (western trunk: Gansu → Xinjiang)
CN_LANXIN: dict[int, float] = {
    2017: 80000, 2018: 85000, 2019: 90000, 2020: 85000,
    2021: 95000, 2022: 100000, 2023: 110000, 2024: 120000,
}
CN_LANXIN_FLOWS = [
    ("CN-GS", "CN-XJ", 0.40), ("CN-XJ", "CN-GS", 0.30),
    ("CN-XJ", "CN-SC", 0.15), ("CN-SC", "CN-XJ", 0.15),
]

# Longhai–Lanxin trunk (Jiangsu → Shaanxi → Gansu, containers+general)
CN_LONGHAI: dict[int, float] = {
    2017: 120000, 2018: 125000, 2019: 128000, 2020: 115000,
    2021: 122000, 2022: 130000, 2023: 135000, 2024: 140000,
}
CN_LONGHAI_FLOWS = [
    ("CN-JS", "CN-SN", 0.30), ("CN-SN", "CN-JS", 0.20),
    ("CN-SN", "CN-GS", 0.25), ("CN-GS", "CN-SN", 0.25),
]

# Northeast China (Heilongjiang → Liaoning, grain + heavy industry)
CN_NORTHEAST: dict[int, float] = {
    2017: 200000, 2018: 205000, 2019: 195000, 2020: 180000,
    2021: 190000, 2022: 185000, 2023: 190000, 2024: 195000,
}
CN_NORTHEAST_FLOWS = [
    ("CN-HL", "CN-LN", 0.35), ("CN-LN", "CN-HL", 0.10),
    ("CN-JL", "CN-LN", 0.25), ("CN-LN", "CN-JL", 0.10),
    ("CN-HL", "CN-JL", 0.10), ("CN-JL", "CN-HL", 0.10),
]

# Yangtze corridor rail (Shanghai → Hubei/Sichuan)
CN_YANGTZE: dict[int, float] = {
    2017: 150000, 2018: 160000, 2019: 165000, 2020: 150000,
    2021: 160000, 2022: 170000, 2023: 175000, 2024: 180000,
}
CN_YANGTZE_FLOWS = [
    ("CN-SH", "CN-HB", 0.20), ("CN-HB", "CN-SH", 0.15),
    ("CN-HB", "CN-SC", 0.20), ("CN-SC", "CN-HB", 0.15),
    ("CN-JS", "CN-AH", 0.15), ("CN-AH", "CN-JS", 0.15),
]

# Sichuan–Guizhou–Yunnan (southwest, minerals + general)
CN_SOUTHWEST: dict[int, float] = {
    2017: 80000, 2018: 85000, 2019: 88000, 2020: 80000,
    2021: 85000, 2022: 90000, 2023: 95000, 2024: 100000,
}
CN_SOUTHWEST_FLOWS = [
    ("CN-SC", "CN-YN", 0.30), ("CN-YN", "CN-SC", 0.20),
    ("CN-SC", "CN-GZ", 0.20), ("CN-GZ", "CN-SC", 0.15),
    ("CN-GZ", "CN-YN", 0.10), ("CN-YN", "CN-GZ", 0.05),
]

# Shanxi → Shandong (coal to ports, via Shijiazhuang)
CN_SX_SD: dict[int, float] = {
    2017: 100000, 2018: 110000, 2019: 105000, 2020: 95000,
    2021: 100000, 2022: 98000, 2023: 100000, 2024: 102000,
}
CN_SX_SD_FLOWS = [
    ("CN-SX", "CN-SD", 0.70), ("CN-SD", "CN-SX", 0.15),
    ("CN-SX", "CN-HE", 0.10), ("CN-HE", "CN-SX", 0.05),
]

# Zhejiang–Fujian coastal (containers, manufacturing)
CN_COASTAL_SE: dict[int, float] = {
    2017: 50000, 2018: 55000, 2019: 58000, 2020: 52000,
    2021: 60000, 2022: 65000, 2023: 70000, 2024: 75000,
}
CN_COASTAL_SE_FLOWS = [
    ("CN-ZJ", "CN-FJ", 0.40), ("CN-FJ", "CN-ZJ", 0.30),
    ("CN-ZJ", "CN-GD", 0.15), ("CN-GD", "CN-ZJ", 0.15),
]

# ═══════════════════════════════════════════════════════════════════════
# INDIA DOMESTIC  (Source: Indian Railways Yearbook, DFCCIL)
# Total ~1.4 billion tonnes
# ═══════════════════════════════════════════════════════════════════════

# Eastern Dedicated Freight Corridor (coal: Jharkhand/Odisha → UP/Punjab)
IN_EDFC: dict[int, float] = {
    2017: 350000, 2018: 360000, 2019: 370000, 2020: 330000,
    2021: 350000, 2022: 380000, 2023: 400000, 2024: 420000,
}
IN_EDFC_FLOWS = [
    ("IN-JH", "IN-UP", 0.30), ("IN-OR", "IN-UP", 0.25),
    ("IN-JH", "IN-HR", 0.15), ("IN-OR", "IN-HR", 0.10),
    ("IN-UP", "IN-JH", 0.10), ("IN-HR", "IN-JH", 0.05),
    ("IN-UP", "IN-OR", 0.05),
]

# Western DFC (containers+general: Maharashtra → Delhi/Haryana)
IN_WDFC: dict[int, float] = {
    2017: 120000, 2018: 130000, 2019: 135000, 2020: 110000,
    2021: 125000, 2022: 140000, 2023: 155000, 2024: 170000,
}
IN_WDFC_FLOWS = [
    ("IN-MH", "IN-HR", 0.30), ("IN-GJ", "IN-HR", 0.20),
    ("IN-HR", "IN-MH", 0.15), ("IN-HR", "IN-GJ", 0.10),
    ("IN-MH", "IN-RJ", 0.15), ("IN-RJ", "IN-MH", 0.10),
]

# Coal belt (Chhattisgarh/Jharkhand → power plants all over)
IN_COAL: dict[int, float] = {
    2017: 400000, 2018: 420000, 2019: 430000, 2020: 380000,
    2021: 410000, 2022: 450000, 2023: 470000, 2024: 490000,
}
IN_COAL_FLOWS = [
    ("IN-CT", "IN-MH", 0.20), ("IN-CT", "IN-TN", 0.10),
    ("IN-CT", "IN-KA", 0.10), ("IN-CT", "IN-AP", 0.10),
    ("IN-JH", "IN-WB", 0.15), ("IN-JH", "IN-BR", 0.10),
    ("IN-OR", "IN-AP", 0.10), ("IN-OR", "IN-TN", 0.05),
    ("IN-WB", "IN-JH", 0.05), ("IN-MP", "IN-MH", 0.05),
]

# Iron ore (Odisha/Jharkhand → ports: Vizag, Paradip)
IN_IRON: dict[int, float] = {
    2017: 80000, 2018: 90000, 2019: 95000, 2020: 85000,
    2021: 90000, 2022: 100000, 2023: 105000, 2024: 110000,
}
IN_IRON_FLOWS = [
    ("IN-OR", "IN-AP", 0.40), ("IN-JH", "IN-OR", 0.30),
    ("IN-KA", "IN-GA", 0.15), ("IN-GA", "IN-KA", 0.05),
    ("IN-OR", "IN-WB", 0.10),
]

# Cement (Rajasthan/AP → all India)
IN_CEMENT: dict[int, float] = {
    2017: 100000, 2018: 110000, 2019: 115000, 2020: 95000,
    2021: 105000, 2022: 120000, 2023: 130000, 2024: 140000,
}
IN_CEMENT_FLOWS = [
    ("IN-RJ", "IN-DL", 0.20), ("IN-AP", "IN-TN", 0.20),
    ("IN-RJ", "IN-MH", 0.15), ("IN-MP", "IN-UP", 0.15),
    ("IN-AP", "IN-KA", 0.15), ("IN-RJ", "IN-GJ", 0.15),
]

# Grain (Punjab/Haryana → south and east)
IN_GRAIN: dict[int, float] = {
    2017: 50000, 2018: 52000, 2019: 55000, 2020: 48000,
    2021: 53000, 2022: 56000, 2023: 58000, 2024: 60000,
}
IN_GRAIN_FLOWS = [
    ("IN-PB", "IN-KL", 0.25), ("IN-PB", "IN-TN", 0.20),
    ("IN-HR", "IN-WB", 0.20), ("IN-HR", "IN-BR", 0.15),
    ("IN-PB", "IN-MH", 0.10), ("IN-UP", "IN-WB", 0.10),
]

# ═══════════════════════════════════════════════════════════════════════
# RUSSIA DOMESTIC  (Source: RZD annual reports)
# Total ~1.3 billion tonnes
# ═══════════════════════════════════════════════════════════════════════

# Kuzbass coal (Kemerovo → ports: east & west)
RU_KUZBASS: dict[int, float] = {
    2017: 350000, 2018: 360000, 2019: 370000, 2020: 320000,
    2021: 340000, 2022: 300000, 2023: 310000, 2024: 305000,
}
RU_KUZBASS_FLOWS = [
    ("RU-KEM", "RU-PRI", 0.30),  # To Vladivostok Pacific ports
    ("RU-KEM", "RU-LEN", 0.20),  # To St Petersburg/Baltic
    ("RU-KEM", "RU-MUR", 0.15),  # To Murmansk
    ("RU-KEM", "RU-KDA", 0.15),  # To Novorossiysk (Black Sea)
    ("RU-KEM", "RU-NVS", 0.10),  # To Novosibirsk transit
    ("RU-NVS", "RU-KEM", 0.10),
]

# Trans-Siberian general freight (Moscow → Vladivostok)
RU_TRANSSIB: dict[int, float] = {
    2017: 200000, 2018: 210000, 2019: 215000, 2020: 190000,
    2021: 200000, 2022: 220000, 2023: 230000, 2024: 240000,
}
RU_TRANSSIB_FLOWS = [
    ("RU-MOW", "RU-SVE", 0.20), ("RU-SVE", "RU-MOW", 0.15),
    ("RU-SVE", "RU-NVS", 0.15), ("RU-NVS", "RU-SVE", 0.10),
    ("RU-NVS", "RU-PRI", 0.15), ("RU-PRI", "RU-NVS", 0.10),
    ("RU-MOW", "RU-PRI", 0.10), ("RU-PRI", "RU-MOW", 0.05),
]

# BAM (Baikal–Amur, timber + minerals)
RU_BAM: dict[int, float] = {
    2017: 25000, 2018: 28000, 2019: 30000, 2020: 28000,
    2021: 32000, 2022: 35000, 2023: 38000, 2024: 40000,
}
RU_BAM_FLOWS = [
    ("RU-IRK", "RU-KHA", 0.45), ("RU-KHA", "RU-IRK", 0.15),
    ("RU-AMU", "RU-KHA", 0.25), ("RU-KHA", "RU-AMU", 0.15),
]

# Oil/petroleum (Tyumen/KMAO → refineries)
RU_OIL: dict[int, float] = {
    2017: 180000, 2018: 175000, 2019: 170000, 2020: 150000,
    2021: 160000, 2022: 155000, 2023: 160000, 2024: 165000,
}
RU_OIL_FLOWS = [
    ("RU-TYU", "RU-MOW", 0.25), ("RU-TYU", "RU-LEN", 0.20),
    ("RU-TYU", "RU-SVE", 0.20), ("RU-TYU", "RU-BA", 0.15),
    ("RU-BA", "RU-MOW", 0.10), ("RU-BA", "RU-LEN", 0.10),
]

# Ural metals (Chelyabinsk/Sverdlovsk → Moscow/ports)
RU_URALS: dict[int, float] = {
    2017: 120000, 2018: 125000, 2019: 128000, 2020: 110000,
    2021: 120000, 2022: 115000, 2023: 118000, 2024: 120000,
}
RU_URALS_FLOWS = [
    ("RU-CHE", "RU-MOW", 0.25), ("RU-SVE", "RU-MOW", 0.20),
    ("RU-CHE", "RU-LEN", 0.20), ("RU-SVE", "RU-LEN", 0.15),
    ("RU-MOW", "RU-CHE", 0.10), ("RU-MOW", "RU-SVE", 0.10),
]

# Moscow–St Petersburg corridor (general, containers)
RU_MOW_LED: dict[int, float] = {
    2017: 60000, 2018: 62000, 2019: 65000, 2020: 55000,
    2021: 60000, 2022: 58000, 2023: 62000, 2024: 65000,
}
RU_MOW_LED_FLOWS = [
    ("RU-MOW", "RU-LEN", 0.45), ("RU-LEN", "RU-MOW", 0.40),
    ("RU-MOW", "RU-NVG", 0.10), ("RU-NVG", "RU-MOW", 0.05),
]

# ═══════════════════════════════════════════════════════════════════════
# CANADA DOMESTIC  (Source: Statistics Canada, CN/CP annual reports)
# Total ~350,000 THS_T
# ═══════════════════════════════════════════════════════════════════════

# Prairie grain (SK/AB → Vancouver/Thunder Bay)
CA_GRAIN: dict[int, float] = {
    2017: 65000, 2018: 60000, 2019: 55000, 2020: 62000,
    2021: 50000, 2022: 58000, 2023: 65000, 2024: 68000,
}
CA_GRAIN_FLOWS = [
    ("CA-SK", "CA-BC", 0.35), ("CA-AB", "CA-BC", 0.25),
    ("CA-SK", "CA-ON", 0.15), ("CA-MB", "CA-ON", 0.15),
    ("CA-AB", "CA-SK", 0.05), ("CA-SK", "CA-MB", 0.05),
]

# Potash (Saskatchewan → Vancouver/Thunder Bay)
CA_POTASH: dict[int, float] = {
    2017: 35000, 2018: 30000, 2019: 32000, 2020: 28000,
    2021: 35000, 2022: 38000, 2023: 40000, 2024: 42000,
}
CA_POTASH_FLOWS = [
    ("CA-SK", "CA-BC", 0.60), ("CA-SK", "CA-ON", 0.20),
    ("CA-SK", "CA-QC", 0.15), ("CA-SK", "CA-MB", 0.05),
]

# Intermodal containers (ON/QC ↔ BC)
CA_INTERMODAL: dict[int, float] = {
    2017: 50000, 2018: 55000, 2019: 58000, 2020: 52000,
    2021: 55000, 2022: 60000, 2023: 62000, 2024: 65000,
}
CA_INTERMODAL_FLOWS = [
    ("CA-ON", "CA-BC", 0.25), ("CA-BC", "CA-ON", 0.25),
    ("CA-QC", "CA-BC", 0.10), ("CA-BC", "CA-QC", 0.10),
    ("CA-ON", "CA-AB", 0.10), ("CA-AB", "CA-ON", 0.10),
    ("CA-QC", "CA-ON", 0.05), ("CA-ON", "CA-QC", 0.05),
]

# Alberta oil sands (crude by rail, AB → BC/US)
CA_CRUDE: dict[int, float] = {
    2017: 15000, 2018: 22000, 2019: 25000, 2020: 12000,
    2021: 8000, 2022: 10000, 2023: 8000, 2024: 7000,
}
CA_CRUDE_FLOWS = [
    ("CA-AB", "CA-BC", 0.40), ("CA-AB", "CA-NB", 0.30),
    ("CA-AB", "CA-ON", 0.20), ("CA-BC", "CA-AB", 0.10),
]

# Coal (BC → ports)
CA_COAL: dict[int, float] = {
    2017: 30000, 2018: 32000, 2019: 30000, 2020: 25000,
    2021: 28000, 2022: 35000, 2023: 30000, 2024: 28000,
}
CA_COAL_FLOWS = [
    ("CA-BC", "CA-BC", 0.60),  # Elk Valley to Vancouver/Prince Rupert
    ("CA-AB", "CA-BC", 0.35),
    ("CA-BC", "CA-AB", 0.05),
]

# Lumber/forestry (BC → east)
CA_LUMBER: dict[int, float] = {
    2017: 25000, 2018: 22000, 2019: 20000, 2020: 22000,
    2021: 25000, 2022: 20000, 2023: 18000, 2024: 18000,
}
CA_LUMBER_FLOWS = [
    ("CA-BC", "CA-AB", 0.30), ("CA-BC", "CA-ON", 0.25),
    ("CA-BC", "CA-QC", 0.15), ("CA-QC", "CA-ON", 0.15),
    ("CA-ON", "CA-QC", 0.10), ("CA-AB", "CA-BC", 0.05),
]

# ═══════════════════════════════════════════════════════════════════════
# KAZAKHSTAN DOMESTIC  (Source: KTZ annual reports)
# Total ~400,000 THS_T
# ═══════════════════════════════════════════════════════════════════════

# Coal (Karaganda → power plants + export)
KZ_COAL: dict[int, float] = {
    2017: 120000, 2018: 125000, 2019: 130000, 2020: 115000,
    2021: 120000, 2022: 125000, 2023: 128000, 2024: 130000,
}
KZ_COAL_FLOWS = [
    ("KZ-KAR", "KZ-PAV", 0.25), ("KZ-KAR", "KZ-AKM", 0.25),
    ("KZ-KAR", "KZ-ALA", 0.20), ("KZ-KAR", "KZ-KUS", 0.15),
    ("KZ-PAV", "KZ-KAR", 0.10), ("KZ-AKM", "KZ-KAR", 0.05),
]

# Iron ore & metals (Kostanay/Karaganda → Aktau/border)
KZ_METALS: dict[int, float] = {
    2017: 60000, 2018: 65000, 2019: 68000, 2020: 55000,
    2021: 60000, 2022: 63000, 2023: 65000, 2024: 68000,
}
KZ_METALS_FLOWS = [
    ("KZ-KUS", "KZ-MAN", 0.30), ("KZ-KAR", "KZ-MAN", 0.25),
    ("KZ-KUS", "KZ-AKM", 0.20), ("KZ-KAR", "KZ-ALA", 0.15),
    ("KZ-MAN", "KZ-KUS", 0.10),
]

# Grain (Akmola/Kostanay → borders + Aktau)
KZ_GRAIN: dict[int, float] = {
    2017: 35000, 2018: 30000, 2019: 32000, 2020: 38000,
    2021: 40000, 2022: 35000, 2023: 38000, 2024: 40000,
}
KZ_GRAIN_FLOWS = [
    ("KZ-AKM", "KZ-MAN", 0.30), ("KZ-KUS", "KZ-MAN", 0.20),
    ("KZ-AKM", "KZ-ALA", 0.20), ("KZ-AKM", "KZ-PAV", 0.15),
    ("KZ-KUS", "KZ-AKM", 0.15),
]

# Oil (Mangystau → refineries)
KZ_OIL: dict[int, float] = {
    2017: 20000, 2018: 22000, 2019: 24000, 2020: 18000,
    2021: 20000, 2022: 22000, 2023: 23000, 2024: 24000,
}
KZ_OIL_FLOWS = [
    ("KZ-MAN", "KZ-ALA", 0.40), ("KZ-MAN", "KZ-KAR", 0.30),
    ("KZ-MAN", "KZ-AKM", 0.20), ("KZ-ALA", "KZ-MAN", 0.10),
]

# ═══════════════════════════════════════════════════════════════════════
# UKRAINE DOMESTIC  (Source: Ukrzaliznytsia reports)
# Total ~300,000 THS_T (pre-2022); post-2022 severely reduced
# ═══════════════════════════════════════════════════════════════════════

# Iron ore (Dnipropetrovsk/Zaporizhzhia → ports + steel plants)
UA_IRON: dict[int, float] = {
    2017: 80000, 2018: 82000, 2019: 78000, 2020: 70000,
    2021: 75000, 2022: 30000, 2023: 25000, 2024: 22000,
}
UA_IRON_FLOWS = [
    ("UA-12", "UA-65", 0.30),  # Dnipropetrovsk → Odesa
    ("UA-12", "UA-23", 0.25),  # Dnipropetrovsk → Zaporizhzhia
    ("UA-23", "UA-65", 0.20),  # Zaporizhzhia → Odesa
    ("UA-12", "UA-30", 0.15),  # → Kyiv
    ("UA-65", "UA-12", 0.10),
]

# Coal (Donetsk/Luhansk → west; disrupted post-2014)
UA_COAL: dict[int, float] = {
    2017: 50000, 2018: 45000, 2019: 40000, 2020: 35000,
    2021: 38000, 2022: 5000, 2023: 3000, 2024: 2000,
}
UA_COAL_FLOWS = [
    ("UA-14", "UA-12", 0.40),  # Donetsk → Dnipropetrovsk
    ("UA-14", "UA-30", 0.25),  # → Kyiv
    ("UA-44", "UA-12", 0.20),  # Luhansk → Dnipropetrovsk
    ("UA-14", "UA-65", 0.15),  # → Odesa
]

# Grain (central/west → ports)
UA_GRAIN: dict[int, float] = {
    2017: 40000, 2018: 45000, 2019: 50000, 2020: 48000,
    2021: 52000, 2022: 15000, 2023: 18000, 2024: 20000,
}
UA_GRAIN_FLOWS = [
    ("UA-53", "UA-65", 0.30),  # Poltava → Odesa
    ("UA-71", "UA-65", 0.25),  # Cherkasy → Odesa
    ("UA-30", "UA-65", 0.20),  # Kyiv → Odesa
    ("UA-18", "UA-46", 0.15),  # Zhytomyr → Lviv (west export)
    ("UA-46", "UA-18", 0.10),
]

# General freight (Kyiv ↔ Lviv corridor)
UA_GENERAL: dict[int, float] = {
    2017: 30000, 2018: 32000, 2019: 33000, 2020: 28000,
    2021: 30000, 2022: 35000, 2023: 38000, 2024: 40000,
}
UA_GENERAL_FLOWS = [
    ("UA-30", "UA-46", 0.35), ("UA-46", "UA-30", 0.30),
    ("UA-30", "UA-63", 0.15), ("UA-63", "UA-30", 0.10),
    ("UA-46", "UA-63", 0.10),  # Lviv → Kharkiv
]

# ═══════════════════════════════════════════════════════════════════════
# MEXICO DOMESTIC  (Source: SCT/ARTF, FerroMex/KCSM reports)
# Total ~80,000 THS_T
# ═══════════════════════════════════════════════════════════════════════

# Automotive/manufacturing (Querétaro–Monterrey–Guadalajara)
MX_MANUFACTURING: dict[int, float] = {
    2017: 25000, 2018: 27000, 2019: 28000, 2020: 22000,
    2021: 26000, 2022: 30000, 2023: 32000, 2024: 35000,
}
MX_MANUFACTURING_FLOWS = [
    ("MX-QUE", "MX-NLE", 0.25), ("MX-NLE", "MX-QUE", 0.15),
    ("MX-JAL", "MX-NLE", 0.15), ("MX-NLE", "MX-JAL", 0.10),
    ("MX-AGU", "MX-NLE", 0.10), ("MX-QUE", "MX-JAL", 0.10),
    ("MX-AGU", "MX-QUE", 0.10), ("MX-JAL", "MX-AGU", 0.05),
]

# Cement & construction (across)
MX_CEMENT: dict[int, float] = {
    2017: 12000, 2018: 13000, 2019: 14000, 2020: 11000,
    2021: 13000, 2022: 14000, 2023: 15000, 2024: 16000,
}
MX_CEMENT_FLOWS = [
    ("MX-MEX", "MX-NLE", 0.25), ("MX-NLE", "MX-MEX", 0.15),
    ("MX-HID", "MX-MEX", 0.20), ("MX-MEX", "MX-JAL", 0.15),
    ("MX-JAL", "MX-MEX", 0.15), ("MX-HID", "MX-NLE", 0.10),
]

# Grain (Sinaloa → central/south)
MX_GRAIN: dict[int, float] = {
    2017: 10000, 2018: 11000, 2019: 12000, 2020: 10000,
    2021: 11000, 2022: 12000, 2023: 13000, 2024: 14000,
}
MX_GRAIN_FLOWS = [
    ("MX-SIN", "MX-MEX", 0.30), ("MX-SIN", "MX-JAL", 0.25),
    ("MX-SON", "MX-MEX", 0.20), ("MX-SIN", "MX-NLE", 0.15),
    ("MX-MEX", "MX-SIN", 0.10),
]

# Mining (Sonora/Chihuahua → ports/border)
MX_MINING: dict[int, float] = {
    2017: 15000, 2018: 16000, 2019: 17000, 2020: 14000,
    2021: 16000, 2022: 18000, 2023: 19000, 2024: 20000,
}
MX_MINING_FLOWS = [
    ("MX-SON", "MX-SIN", 0.25), ("MX-CHH", "MX-SON", 0.20),
    ("MX-SON", "MX-NLE", 0.20), ("MX-CHH", "MX-NLE", 0.15),
    ("MX-SON", "MX-CHH", 0.10), ("MX-CHH", "MX-SIN", 0.10),
]

# ═══════════════════════════════════════════════════════════════════════
# TURKEY DOMESTIC  (Source: TCDD annual statistics)
# Total ~35,000 THS_T
# ═══════════════════════════════════════════════════════════════════════

TR_DOMESTIC: dict[int, float] = {
    2017: 28000, 2018: 30000, 2019: 32000, 2020: 28000,
    2021: 30000, 2022: 33000, 2023: 35000, 2024: 37000,
}
TR_DOMESTIC_FLOWS = [
    ("TR-34", "TR-06", 0.20),  # Istanbul → Ankara
    ("TR-06", "TR-34", 0.15),  # Ankara → Istanbul
    ("TR-34", "TR-42", 0.10),  # Istanbul → Kocaeli (industry)
    ("TR-42", "TR-34", 0.10),
    ("TR-06", "TR-35", 0.10),  # Ankara → Izmir
    ("TR-35", "TR-06", 0.08),
    ("TR-06", "TR-38", 0.07),  # Ankara → Kayseri
    ("TR-38", "TR-06", 0.05),
    ("TR-42", "TR-06", 0.08),
    ("TR-25", "TR-06", 0.07),  # Erzurum → Ankara
]

# ═══════════════════════════════════════════════════════════════════════
# IRAN DOMESTIC  (Source: RAI — Islamic Republic of Iran Railways)
# Total ~45,000 THS_T (rail share is low)
# ═══════════════════════════════════════════════════════════════════════

IR_DOMESTIC: dict[int, float] = {
    2017: 38000, 2018: 35000, 2019: 30000, 2020: 28000,
    2021: 32000, 2022: 35000, 2023: 40000, 2024: 45000,
}
IR_DOMESTIC_FLOWS = [
    ("IR-23", "IR-08", 0.20),  # Isfahan → Tehran
    ("IR-08", "IR-23", 0.10),
    ("IR-08", "IR-10", 0.12),  # Tehran → Khorasan (Mashhad)
    ("IR-10", "IR-08", 0.08),
    ("IR-08", "IR-07", 0.10),  # Tehran → Hormozgan (Bandar Abbas port)
    ("IR-07", "IR-08", 0.05),
    ("IR-23", "IR-07", 0.10),  # Isfahan → Bandar Abbas
    ("IR-04", "IR-08", 0.08),  # East Azerbaijan (Tabriz) → Tehran
    ("IR-08", "IR-04", 0.07),
    ("IR-06", "IR-08", 0.05),  # Khuzestan → Tehran
    ("IR-08", "IR-06", 0.05),
]

# ═══════════════════════════════════════════════════════════════════════
# INDONESIA (Java coal railways)  Source: PT KAI, BUMN reports
# ═══════════════════════════════════════════════════════════════════════

ID_DOMESTIC: dict[int, float] = {
    2017: 30000, 2018: 32000, 2019: 35000, 2020: 30000,
    2021: 33000, 2022: 38000, 2023: 40000, 2024: 42000,
}
ID_DOMESTIC_FLOWS = [
    ("ID-SS", "ID-LA", 0.50),  # South Sumatra → Lampung (coal to port)
    ("ID-LA", "ID-SS", 0.05),
    ("ID-JK", "ID-JB", 0.15),  # Jakarta → West Java
    ("ID-JB", "ID-JK", 0.10),
    ("ID-JT", "ID-JI", 0.10),  # Central Java → East Java
    ("ID-JI", "ID-JT", 0.10),
]

# ═══════════════════════════════════════════════════════════════════════
# SOUTH KOREA  (Source: KORAIL Logistics)
# ═══════════════════════════════════════════════════════════════════════

KR_DOMESTIC: dict[int, float] = {
    2017: 35000, 2018: 34000, 2019: 33000, 2020: 30000,
    2021: 32000, 2022: 33000, 2023: 34000, 2024: 35000,
}
KR_DOMESTIC_FLOWS = [
    ("KR-11", "KR-26", 0.25),  # Seoul → Busan
    ("KR-26", "KR-11", 0.20),
    ("KR-11", "KR-28", 0.12),  # Seoul → Incheon
    ("KR-28", "KR-11", 0.08),
    ("KR-26", "KR-27", 0.10),  # Busan → Ulsan
    ("KR-27", "KR-26", 0.08),
    ("KR-11", "KR-30", 0.10),  # Seoul → Daejeon
    ("KR-30", "KR-11", 0.07),
]

# ═══════════════════════════════════════════════════════════════════════
# JAPAN  (Source: JR Freight annual report)
# ═══════════════════════════════════════════════════════════════════════

JP_DOMESTIC: dict[int, float] = {
    2017: 30000, 2018: 29000, 2019: 28000, 2020: 25000,
    2021: 27000, 2022: 28000, 2023: 29000, 2024: 30000,
}
JP_DOMESTIC_FLOWS = [
    ("JP-13", "JP-01", 0.20),  # Tokyo → Hokkaido
    ("JP-01", "JP-13", 0.15),
    ("JP-13", "JP-27", 0.15),  # Tokyo → Osaka
    ("JP-27", "JP-13", 0.12),
    ("JP-27", "JP-40", 0.10),  # Osaka → Fukuoka
    ("JP-40", "JP-27", 0.08),
    ("JP-13", "JP-23", 0.10),  # Tokyo → Nagoya (Aichi)
    ("JP-23", "JP-13", 0.10),
]

# ═══════════════════════════════════════════════════════════════════════
# ARGENTINA  (Source: CNRT, Trenes Argentinos Cargas)
# ═══════════════════════════════════════════════════════════════════════

AR_DOMESTIC: dict[int, float] = {
    2017: 20000, 2018: 18000, 2019: 16000, 2020: 12000,
    2021: 14000, 2022: 18000, 2023: 22000, 2024: 25000,
}
AR_DOMESTIC_FLOWS = [
    ("AR-B", "AR-C", 0.25),   # Buenos Aires Prov → Buenos Aires City
    ("AR-C", "AR-B", 0.10),
    ("AR-X", "AR-S", 0.20),   # Córdoba → Santa Fe (grain)
    ("AR-S", "AR-B", 0.15),   # Santa Fe → Buenos Aires
    ("AR-T", "AR-S", 0.10),   # Tucumán → Santa Fe
    ("AR-B", "AR-E", 0.10),   # → Entre Ríos
    ("AR-E", "AR-B", 0.10),
]

# ═══════════════════════════════════════════════════════════════════════
# CHILE  (Source: EFE, mining company reports)
# ═══════════════════════════════════════════════════════════════════════

CL_DOMESTIC: dict[int, float] = {
    2017: 12000, 2018: 13000, 2019: 14000, 2020: 12000,
    2021: 13000, 2022: 14000, 2023: 15000, 2024: 16000,
}
CL_DOMESTIC_FLOWS = [
    ("CL-AN", "CL-AN", 0.50),  # Antofagasta mining (internal)
    ("CL-AT", "CL-TA", 0.20),  # Atacama → Tarapacá
    ("CL-RM", "CL-VS", 0.15),  # Santiago (RM) → Valparaíso
    ("CL-VS", "CL-RM", 0.15),
]

# ═══════════════════════════════════════════════════════════════════════
# EGYPT  (Source: ENR — Egyptian National Railways)
# ═══════════════════════════════════════════════════════════════════════

EG_DOMESTIC: dict[int, float] = {
    2017: 10000, 2018: 11000, 2019: 12000, 2020: 9000,
    2021: 10000, 2022: 11000, 2023: 12000, 2024: 13000,
}
EG_DOMESTIC_FLOWS = [
    ("EG-C", "EG-ALX", 0.30),  # Cairo → Alexandria
    ("EG-ALX", "EG-C", 0.20),
    ("EG-C", "EG-SUZ", 0.15),  # Cairo → Suez
    ("EG-SUZ", "EG-C", 0.10),
    ("EG-C", "EG-ASN", 0.15),  # Cairo → Aswan (Upper Egypt)
    ("EG-ASN", "EG-C", 0.10),
]

# ═══════════════════════════════════════════════════════════════════════
# UZBEKISTAN DOMESTIC  (Source: UTY — Uzbekistan Railways)
# ═══════════════════════════════════════════════════════════════════════

UZ_DOMESTIC: dict[int, float] = {
    2017: 50000, 2018: 52000, 2019: 55000, 2020: 48000,
    2021: 52000, 2022: 56000, 2023: 58000, 2024: 60000,
}
UZ_DOMESTIC_FLOWS = [
    ("UZ-TK", "UZ-AN", 0.20),  # Tashkent → Andijan (Fergana)
    ("UZ-AN", "UZ-TK", 0.10),
    ("UZ-TK", "UZ-BU", 0.15),  # Tashkent → Bukhara
    ("UZ-BU", "UZ-TK", 0.10),
    ("UZ-TK", "UZ-SA", 0.12),  # Tashkent → Samarkand
    ("UZ-SA", "UZ-TK", 0.08),
    ("UZ-NW", "UZ-TK", 0.10),  # Navoi (mining) → Tashkent
    ("UZ-TK", "UZ-NW", 0.05),
    ("UZ-SA", "UZ-BU", 0.05),
    ("UZ-BU", "UZ-SA", 0.05),
]

# ═══════════════════════════════════════════════════════════════════════
# PERU  (Source: FCCA, Southern Peru Copper)
# ═══════════════════════════════════════════════════════════════════════

PE_DOMESTIC: dict[int, float] = {
    2017: 4000, 2018: 4200, 2019: 4500, 2020: 3800,
    2021: 4200, 2022: 4800, 2023: 5000, 2024: 5200,
}
PE_DOMESTIC_FLOWS = [
    ("PE-JUN", "PE-LIM", 0.40),  # Junín (mines) → Lima/Callao
    ("PE-LIM", "PE-JUN", 0.10),
    ("PE-TAC", "PE-TAC", 0.30),  # Tacna copper (internal)
    ("PE-ARE", "PE-LIM", 0.10),  # Arequipa → Lima
    ("PE-LIM", "PE-ARE", 0.10),
]

# ═══════════════════════════════════════════════════════════════════════
# NIGERIA  (Source: NRC)
# ═══════════════════════════════════════════════════════════════════════

NG_DOMESTIC: dict[int, float] = {
    2017: 500, 2018: 800, 2019: 1200, 2020: 1000,
    2021: 1500, 2022: 2000, 2023: 2500, 2024: 3000,
}
NG_DOMESTIC_FLOWS = [
    ("NG-LA", "NG-OG", 0.25),  # Lagos → Ogun
    ("NG-OG", "NG-LA", 0.15),
    ("NG-LA", "NG-KW", 0.15),  # Lagos → Kwara (north corridor)
    ("NG-KW", "NG-FC", 0.15),  # → Abuja
    ("NG-FC", "NG-KN", 0.15),  # Abuja → Kano
    ("NG-KN", "NG-FC", 0.10),
    ("NG-FC", "NG-LA", 0.05),
]

# ═══════════════════════════════════════════════════════════════════════
# TUNISIA  (Source: SNCFT)
# ═══════════════════════════════════════════════════════════════════════

TN_DOMESTIC: dict[int, float] = {
    2017: 3000, 2018: 3100, 2019: 3200, 2020: 2500,
    2021: 2800, 2022: 3000, 2023: 3200, 2024: 3300,
}
TN_DOMESTIC_FLOWS = [
    ("TN-12", "TN-23", 0.50),  # Gafsa (phosphate) → Sfax (port)
    ("TN-23", "TN-12", 0.05),
    ("TN-11", "TN-23", 0.15),  # Tunis → Sfax
    ("TN-23", "TN-11", 0.10),
    ("TN-11", "TN-51", 0.10),  # Tunis → Sousse
    ("TN-51", "TN-11", 0.10),
]

# ═══════════════════════════════════════════════════════════════════════
# MONGOLIA DOMESTIC  (Source: UBTZ reports)
# ═══════════════════════════════════════════════════════════════════════

MN_DOMESTIC: dict[int, float] = {
    2017: 22000, 2018: 25000, 2019: 28000, 2020: 30000,
    2021: 35000, 2022: 38000, 2023: 40000, 2024: 42000,
}
MN_DOMESTIC_FLOWS = [
    ("MN-1", "MN-UB", 0.40),   # Darkhan (industrial) → Ulaanbaatar
    ("MN-UB", "MN-1", 0.15),
    ("MN-UB", "MN-UB", 0.15),  # UB internal transit
    ("MN-047", "MN-UB", 0.15), # Erdenet (copper mine) → UB
    ("MN-UB", "MN-047", 0.10),
    ("MN-1", "MN-047", 0.05),
]

# ═══════════════════════════════════════════════════════════════════════
# SMALL COUNTRIES (Tier 5)
# ═══════════════════════════════════════════════════════════════════════

# NAMIBIA (TransNamib: mining railways)
NA_DOMESTIC: dict[int, float] = {
    2017: 600, 2018: 650, 2019: 700, 2020: 500,
    2021: 550, 2022: 600, 2023: 700, 2024: 800,
}
NA_DOMESTIC_FLOWS = [
    ("NA-KU", "NA-ER", 0.50),  # Kunene (Tsumeb) → Erongo (Walvis Bay)
    ("NA-ER", "NA-KU", 0.10),
    ("NA-KH", "NA-ER", 0.25),  # Khomas (Windhoek) → Walvis Bay
    ("NA-ER", "NA-KH", 0.15),
]

# GHANA (manganese + bauxite railways)
GH_DOMESTIC: dict[int, float] = {
    2017: 400, 2018: 450, 2019: 500, 2020: 350,
    2021: 400, 2022: 450, 2023: 500, 2024: 550,
}
GH_DOMESTIC_FLOWS = [
    ("GH-WP", "GH-CP", 0.50),  # Western → Central (Takoradi port)
    ("GH-CP", "GH-WP", 0.10),
    ("GH-AA", "GH-CP", 0.25),  # Greater Accra → Central
    ("GH-CP", "GH-AA", 0.15),
]

# CAMEROON (Camrail)
CM_DOMESTIC: dict[int, float] = {
    2017: 250, 2018: 260, 2019: 280, 2020: 200,
    2021: 230, 2022: 260, 2023: 280, 2024: 300,
}
CM_DOMESTIC_FLOWS = [
    ("CM-LT", "CM-CE", 0.35),  # Littoral (Douala port) → Centre (Yaoundé)
    ("CM-CE", "CM-LT", 0.25),
    ("CM-LT", "CM-OU", 0.20),  # → West
    ("CM-OU", "CM-LT", 0.10),
    ("CM-CE", "CM-AD", 0.10),  # → Adamawa (N'Gaoundéré)
]

# SENEGAL (Dakar freight)
SN_DOMESTIC: dict[int, float] = {
    2017: 150, 2018: 160, 2019: 180, 2020: 120,
    2021: 150, 2022: 180, 2023: 200, 2024: 220,
}
SN_DOMESTIC_FLOWS = [
    ("SN-DK", "SN-TH", 0.40),  # Dakar → Thiès
    ("SN-TH", "SN-DK", 0.30),
    ("SN-DK", "SN-KD", 0.15),  # Dakar → Kaolack
    ("SN-KD", "SN-DK", 0.15),
]

# JORDAN (Aqaba Railway — phosphate)
JO_DOMESTIC: dict[int, float] = {
    2017: 180, 2018: 200, 2019: 220, 2020: 150,
    2021: 180, 2022: 200, 2023: 210, 2024: 220,
}
JO_DOMESTIC_FLOWS = [
    ("JO-MA", "JO-AQ", 0.80),  # Ma'an → Aqaba (phosphate)
    ("JO-AQ", "JO-MA", 0.20),
]

# CUBA (severely degraded)
CU_DOMESTIC: dict[int, float] = {
    2017: 500, 2018: 480, 2019: 450, 2020: 300,
    2021: 350, 2022: 400, 2023: 420, 2024: 450,
}
CU_DOMESTIC_FLOWS = [
    ("CU-03", "CU-07", 0.40),  # Havana → Camagüey
    ("CU-07", "CU-03", 0.20),
    ("CU-03", "CU-13", 0.15),  # Havana → Santiago de Cuba
    ("CU-13", "CU-03", 0.10),
    ("CU-07", "CU-13", 0.10),
    ("CU-13", "CU-07", 0.05),
]

# TAIWAN (limited freight)
TW_DOMESTIC: dict[int, float] = {
    2017: 300, 2018: 290, 2019: 280, 2020: 250,
    2021: 270, 2022: 280, 2023: 290, 2024: 300,
}
TW_DOMESTIC_FLOWS = [
    ("TW-TPE", "TW-KHH", 0.35),  # Taipei → Kaohsiung
    ("TW-KHH", "TW-TPE", 0.30),
    ("TW-TPE", "TW-TXG", 0.15),  # Taipei → Taichung
    ("TW-TXG", "TW-TPE", 0.10),
    ("TW-TXG", "TW-KHH", 0.10),
]

# AUSTRALIA — Pilbara iron ore (WA internal, not interstate)
AU_PILBARA: dict[int, float] = {
    2017: 850000, 2018: 870000, 2019: 880000, 2020: 860000,
    2021: 890000, 2022: 900000, 2023: 910000, 2024: 920000,
}
AU_PILBARA_FLOWS = [
    ("AU-WA", "AU-WA", 1.00),  # Internal WA (Pilbara mines → Port Hedland/Dampier)
]

# AUSTRALIA — Queensland coal
AU_QLD_COAL: dict[int, float] = {
    2017: 280000, 2018: 290000, 2019: 285000, 2020: 260000,
    2021: 270000, 2022: 300000, 2023: 290000, 2024: 285000,
}
AU_QLD_COAL_FLOWS = [
    ("AU-QLD", "AU-QLD", 1.00),  # Bowen Basin → Gladstone/Hay Point/Abbot Point
]

# PAKISTAN DOMESTIC (Source: Pakistan Railways)
PK_DOMESTIC: dict[int, float] = {
    2017: 7000, 2018: 7500, 2019: 8000, 2020: 6000,
    2021: 7000, 2022: 7500, 2023: 8000, 2024: 8500,
}
PK_DOMESTIC_FLOWS = [
    ("PK-PB", "PK-SD", 0.30),  # Punjab → Sindh (Karachi port)
    ("PK-SD", "PK-PB", 0.20),
    ("PK-PB", "PK-KP", 0.15),  # Punjab → Khyber Pakhtunkhwa
    ("PK-KP", "PK-PB", 0.10),
    ("PK-PB", "PK-BA", 0.10),  # → Balochistan
    ("PK-BA", "PK-PB", 0.05),
    ("PK-SD", "PK-BA", 0.05),
    ("PK-BA", "PK-SD", 0.05),
]

# BANGLADESH DOMESTIC (Source: Bangladesh Railway)
BD_DOMESTIC: dict[int, float] = {
    2017: 3000, 2018: 3200, 2019: 3500, 2020: 2800,
    2021: 3200, 2022: 3500, 2023: 4000, 2024: 4500,
}
BD_DOMESTIC_FLOWS = [
    ("BD-C", "BD-E", 0.30),   # Chittagong → Dhaka (East)
    ("BD-E", "BD-C", 0.20),
    ("BD-E", "BD-D", 0.15),   # Dhaka → Rajshahi (D=Rangpur div)
    ("BD-D", "BD-E", 0.10),
    ("BD-C", "BD-G", 0.10),   # Chittagong → Sylhet
    ("BD-G", "BD-C", 0.05),
    ("BD-E", "BD-A", 0.10),   # Dhaka → Barisal
]

# THAILAND DOMESTIC (Source: SRT annual report)
TH_DOMESTIC: dict[int, float] = {
    2017: 8000, 2018: 8500, 2019: 9000, 2020: 7500,
    2021: 8000, 2022: 8500, 2023: 9000, 2024: 9500,
}
TH_DOMESTIC_FLOWS = [
    ("TH-10", "TH-70", 0.20),  # Bangkok → Ratchaburi (cement)
    ("TH-70", "TH-10", 0.10),
    ("TH-10", "TH-20", 0.15),  # Bangkok → Nakhon Ratchasima (Korat)
    ("TH-20", "TH-10", 0.10),
    ("TH-10", "TH-90", 0.10),  # Bangkok → Songkhla (south)
    ("TH-20", "TH-40", 0.10),  # Korat → Khon Kaen
    ("TH-40", "TH-20", 0.05),
    ("TH-10", "TH-50", 0.10),  # Bangkok → Chiang Mai
    ("TH-50", "TH-10", 0.10),
]

# VIETNAM DOMESTIC (Source: VNR)
VN_DOMESTIC: dict[int, float] = {
    2017: 5000, 2018: 5200, 2019: 5500, 2020: 4500,
    2021: 5000, 2022: 5500, 2023: 6000, 2024: 6500,
}
VN_DOMESTIC_FLOWS = [
    ("VN-HN", "VN-SG", 0.20),  # Hanoi → Ho Chi Minh
    ("VN-SG", "VN-HN", 0.15),
    ("VN-HN", "VN-HP", 0.15),  # Hanoi → Hai Phong (port)
    ("VN-HP", "VN-HN", 0.10),
    ("VN-HN", "VN-QN", 0.10),  # Hanoi → Quang Ninh (coal)
    ("VN-QN", "VN-HP", 0.10),
    ("VN-SG", "VN-DN", 0.10),  # HCMC → Da Nang
    ("VN-DN", "VN-SG", 0.10),
]

# MYANMAR DOMESTIC (Source: Myanma Railways)
MM_DOMESTIC: dict[int, float] = {
    2017: 2500, 2018: 2600, 2019: 2800, 2020: 2000,
    2021: 1500, 2022: 1800, 2023: 2000, 2024: 2200,
}
MM_DOMESTIC_FLOWS = [
    ("MM-06", "MM-07", 0.35),  # Yangon → Mandalay
    ("MM-07", "MM-06", 0.25),
    ("MM-06", "MM-12", 0.15),  # Yangon → Bago
    ("MM-12", "MM-06", 0.10),
    ("MM-07", "MM-17", 0.10),  # Mandalay → Shan State
    ("MM-17", "MM-07", 0.05),
]

# NORTH KOREA (very limited data, Source: estimates from KCNA, UN)
KP_DOMESTIC: dict[int, float] = {
    2017: 4000, 2018: 3800, 2019: 3500, 2020: 3000,
    2021: 3200, 2022: 3500, 2023: 3800, 2024: 4000,
}
KP_DOMESTIC_FLOWS = [
    ("KP-01", "KP-06", 0.30),  # Pyongyang → S.Hamgyong (Chongjin)
    ("KP-06", "KP-01", 0.15),
    ("KP-01", "KP-07", 0.15),  # Pyongyang → Kangwon
    ("KP-07", "KP-01", 0.10),
    ("KP-01", "KP-04", 0.15),  # Pyongyang → S.Pyongan
    ("KP-04", "KP-01", 0.15),
]

# ═══════════════════════════════════════════════════════════════════════
# Additional African cross-border corridors not yet covered
# ═══════════════════════════════════════════════════════════════════════

# Senegal–Mali (Dakar–Bamako, mostly suspended but some freight)
SN_ML: dict[int, float] = {
    2017: 50, 2018: 0, 2019: 0, 2020: 0,
    2021: 0, 2022: 0, 2023: 0, 2024: 0,
}
SN_ML_FLOWS = [("SEN", "MLI", 0.60), ("MLI", "SEN", 0.40)]

# Namibia–South Africa (TransNamib → Transnet)
NA_ZA: dict[int, float] = {
    2017: 200, 2018: 220, 2019: 250, 2020: 180,
    2021: 200, 2022: 220, 2023: 240, 2024: 250,
}
NA_ZA_FLOWS = [("NAM", "ZAF", 0.50), ("ZAF", "NAM", 0.50)]

# Côte d'Ivoire–Burkina Faso (Sitarail: Abidjan → Ouagadougou)
CI_BF: dict[int, float] = {
    2017: 800, 2018: 900, 2019: 1000, 2020: 700,
    2021: 850, 2022: 1000, 2023: 1100, 2024: 1200,
}
CI_BF_FLOWS = [("CIV", "BFA", 0.55), ("BFA", "CIV", 0.45)]

# Ghana domestic (already above) doesn't cross-border

# Cameroon–Chad (Extension Douala → N'Djamena transit, small)
CM_TD: dict[int, float] = {
    2017: 100, 2018: 100, 2019: 120, 2020: 80,
    2021: 100, 2022: 110, 2023: 120, 2024: 130,
}
CM_TD_FLOWS = [("CMR", "TCD", 0.60), ("TCD", "CMR", 0.40)]

# eSwatini rail (link to Mozambique/SA)
SZ_MOZ: dict[int, float] = {
    2017: 500, 2018: 520, 2019: 540, 2020: 400,
    2021: 450, 2022: 500, 2023: 520, 2024: 550,
}
SZ_MOZ_FLOWS = [("SWZ", "MOZ", 0.60), ("MOZ", "SWZ", 0.40)]

# Algeria domestic (SNTF)
DZ_DOMESTIC: dict[int, float] = {
    2017: 4000, 2018: 4200, 2019: 4500, 2020: 3500,
    2021: 4000, 2022: 4500, 2023: 5000, 2024: 5500,
}
DZ_DOMESTIC_FLOWS = [
    ("DZA", "DZA", 0.50),   # Internal (single country ISO, Annaba iron)
    ("DZA", "DZA", 0.50),   # Oran → Algiers general
]
# Since same-country we just use country ISO
DZ_FLOWS = [("DZA", "DZA", 1.00)]

# Libya (very small, mostly suspended)
LY_DOMESTIC: dict[int, float] = {
    2017: 0, 2018: 0, 2019: 0, 2020: 0,
    2021: 0, 2022: 0, 2023: 0, 2024: 0,
}

# Sudan domestic
SD_DOMESTIC: dict[int, float] = {
    2017: 500, 2018: 450, 2019: 400, 2020: 300,
    2021: 250, 2022: 100, 2023: 50, 2024: 30,
}
SD_DOMESTIC_FLOWS = [("SDN", "SDN", 1.00)]

# ═══════════════════════════════════════════════════════════════════════
# Additional Asian cross-border
# ═══════════════════════════════════════════════════════════════════════

# China–North Korea
CN_KP: dict[int, float] = {
    2017: 2000, 2018: 1500, 2019: 1200, 2020: 200,
    2021: 300, 2022: 500, 2023: 800, 2024: 1000,
}
CN_KP_FLOWS = [("CHN", "PRK", 0.65), ("PRK", "CHN", 0.35)]

# China–Mongolia (additional to transit)
CN_MN: dict[int, float] = {
    2017: 15000, 2018: 18000, 2019: 20000, 2020: 22000,
    2021: 30000, 2022: 35000, 2023: 38000, 2024: 40000,
}
CN_MN_FLOWS = [("MNG", "CHN", 0.80), ("CHN", "MNG", 0.20)]

# ═══════════════════════════════════════════════════════════════════════
# PILBARA/QLD AUSTRALIA already handled as AU-WA/AU-QLD internal
# ═══════════════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════════════
# Build all records
# ═══════════════════════════════════════════════════════════════════════
ALL_CORRIDORS = [
    # MEGA — China domestic
    (CN_DAQIN, CN_DAQIN_FLOWS),
    (CN_SHENHUA, CN_SHENHUA_FLOWS),
    (CN_MENGHUA, CN_MENGHUA_FLOWS),
    (CN_JINGGUANG, CN_JINGGUANG_FLOWS),
    (CN_LANXIN, CN_LANXIN_FLOWS),
    (CN_LONGHAI, CN_LONGHAI_FLOWS),
    (CN_NORTHEAST, CN_NORTHEAST_FLOWS),
    (CN_YANGTZE, CN_YANGTZE_FLOWS),
    (CN_SOUTHWEST, CN_SOUTHWEST_FLOWS),
    (CN_SX_SD, CN_SX_SD_FLOWS),
    (CN_COASTAL_SE, CN_COASTAL_SE_FLOWS),
    # MEGA — India domestic
    (IN_EDFC, IN_EDFC_FLOWS),
    (IN_WDFC, IN_WDFC_FLOWS),
    (IN_COAL, IN_COAL_FLOWS),
    (IN_IRON, IN_IRON_FLOWS),
    (IN_CEMENT, IN_CEMENT_FLOWS),
    (IN_GRAIN, IN_GRAIN_FLOWS),
    # MEGA — Russia domestic
    (RU_KUZBASS, RU_KUZBASS_FLOWS),
    (RU_TRANSSIB, RU_TRANSSIB_FLOWS),
    (RU_BAM, RU_BAM_FLOWS),
    (RU_OIL, RU_OIL_FLOWS),
    (RU_URALS, RU_URALS_FLOWS),
    (RU_MOW_LED, RU_MOW_LED_FLOWS),
    # VERY LARGE — Canada domestic
    (CA_GRAIN, CA_GRAIN_FLOWS),
    (CA_POTASH, CA_POTASH_FLOWS),
    (CA_INTERMODAL, CA_INTERMODAL_FLOWS),
    (CA_CRUDE, CA_CRUDE_FLOWS),
    (CA_COAL, CA_COAL_FLOWS),
    (CA_LUMBER, CA_LUMBER_FLOWS),
    # VERY LARGE — Kazakhstan domestic
    (KZ_COAL, KZ_COAL_FLOWS),
    (KZ_METALS, KZ_METALS_FLOWS),
    (KZ_GRAIN, KZ_GRAIN_FLOWS),
    (KZ_OIL, KZ_OIL_FLOWS),
    # VERY LARGE — Ukraine domestic
    (UA_IRON, UA_IRON_FLOWS),
    (UA_COAL, UA_COAL_FLOWS),
    (UA_GRAIN, UA_GRAIN_FLOWS),
    (UA_GENERAL, UA_GENERAL_FLOWS),
    # LARGE — Mexico domestic
    (MX_MANUFACTURING, MX_MANUFACTURING_FLOWS),
    (MX_CEMENT, MX_CEMENT_FLOWS),
    (MX_GRAIN, MX_GRAIN_FLOWS),
    (MX_MINING, MX_MINING_FLOWS),
    # LARGE — Turkey domestic
    (TR_DOMESTIC, TR_DOMESTIC_FLOWS),
    # LARGE — Iran domestic
    (IR_DOMESTIC, IR_DOMESTIC_FLOWS),
    # LARGE — Indonesia
    (ID_DOMESTIC, ID_DOMESTIC_FLOWS),
    # LARGE — South Korea
    (KR_DOMESTIC, KR_DOMESTIC_FLOWS),
    # LARGE — Japan
    (JP_DOMESTIC, JP_DOMESTIC_FLOWS),
    # LARGE — Argentina
    (AR_DOMESTIC, AR_DOMESTIC_FLOWS),
    # LARGE — Chile
    (CL_DOMESTIC, CL_DOMESTIC_FLOWS),
    # LARGE — Egypt
    (EG_DOMESTIC, EG_DOMESTIC_FLOWS),
    # LARGE — Uzbekistan
    (UZ_DOMESTIC, UZ_DOMESTIC_FLOWS),
    # MEDIUM — Peru
    (PE_DOMESTIC, PE_DOMESTIC_FLOWS),
    # MEDIUM — Nigeria
    (NG_DOMESTIC, NG_DOMESTIC_FLOWS),
    # MEDIUM — Tunisia
    (TN_DOMESTIC, TN_DOMESTIC_FLOWS),
    # MEDIUM — Mongolia domestic
    (MN_DOMESTIC, MN_DOMESTIC_FLOWS),
    # MEDIUM — Pakistan domestic
    (PK_DOMESTIC, PK_DOMESTIC_FLOWS),
    # MEDIUM — Bangladesh domestic
    (BD_DOMESTIC, BD_DOMESTIC_FLOWS),
    # MEDIUM — Thailand domestic
    (TH_DOMESTIC, TH_DOMESTIC_FLOWS),
    # MEDIUM — Vietnam domestic
    (VN_DOMESTIC, VN_DOMESTIC_FLOWS),
    # MEDIUM — Myanmar domestic
    (MM_DOMESTIC, MM_DOMESTIC_FLOWS),
    # MEDIUM — North Korea
    (KP_DOMESTIC, KP_DOMESTIC_FLOWS),
    # SMALL — Namibia
    (NA_DOMESTIC, NA_DOMESTIC_FLOWS),
    # SMALL — Ghana
    (GH_DOMESTIC, GH_DOMESTIC_FLOWS),
    # SMALL — Cameroon
    (CM_DOMESTIC, CM_DOMESTIC_FLOWS),
    # SMALL — Senegal
    (SN_DOMESTIC, SN_DOMESTIC_FLOWS),
    # SMALL — Jordan
    (JO_DOMESTIC, JO_DOMESTIC_FLOWS),
    # SMALL — Cuba
    (CU_DOMESTIC, CU_DOMESTIC_FLOWS),
    # SMALL — Taiwan
    (TW_DOMESTIC, TW_DOMESTIC_FLOWS),
    # Australia mega-domestic (Pilbara + QLD coal)
    (AU_PILBARA, AU_PILBARA_FLOWS),
    (AU_QLD_COAL, AU_QLD_COAL_FLOWS),
    # Additional cross-border
    (NA_ZA, NA_ZA_FLOWS),
    (CI_BF, CI_BF_FLOWS),
    (CM_TD, CM_TD_FLOWS),
    (SZ_MOZ, SZ_MOZ_FLOWS),
    (CN_KP, CN_KP_FLOWS),
    (CN_MN, CN_MN_FLOWS),
    # Country-level domestic (single ISO)
    (DZ_DOMESTIC, DZ_FLOWS),
    (SD_DOMESTIC, SD_DOMESTIC_FLOWS),
]


def _build_records() -> list[dict]:
    agg: dict[tuple[str, str, int], float] = {}
    for totals, flows in ALL_CORRIDORS:
        for year, total in totals.items():
            if total <= 0:
                continue
            for orig, dest, share in flows:
                tonnes = round(total * share, 1)
                if tonnes >= 1:
                    key = (orig, dest, year)
                    agg[key] = agg.get(key, 0) + tonnes
    return [
        {"origin_iso": o, "destination_iso": d, "year": y,
         "tonnes": round(t, 1), "tonne_km": None, "estimated": True}
        for (o, d, y), t in agg.items()
    ]


def seed():
    """Insert estimated global domestic rail freight data into the DB."""
    RailFreight.__table__.create(engine, checkfirst=True)

    records = _build_records()
    log.info("Generated %d global domestic rail freight records", len(records))

    if not records:
        return

    BATCH = 500
    with engine.begin() as conn:
        for i in range(0, len(records), BATCH):
            batch = records[i : i + BATCH]
            stmt = pg_insert(RailFreight).values(batch)
            stmt = stmt.on_conflict_do_update(
                constraint="uq_rail_freight_od_year",
                set_={
                    "tonnes": stmt.excluded.tonnes,
                    "tonne_km": stmt.excluded.tonne_km,
                    "estimated": stmt.excluded.estimated,
                },
            )
            conn.execute(stmt)

    log.info("Global domestic rail freight seeding complete: %d records", len(records))

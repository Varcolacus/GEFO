"""
Seed data for major world ports.
Static data from World Shipping Council and public sources.
263 ports covering container, oil, bulk, LNG, and transit terminals across 102 countries.
"""
import logging
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.port import Port

logger = logging.getLogger(__name__)

# Top 50 ports by container throughput (TEU, approximate recent data)
PORTS_DATA = [
    {"name": "Shanghai", "country_iso": "CHN", "lat": 31.23, "lon": 121.47, "port_type": "container", "throughput_teu": 47300000, "unlocode": "CNSHA"},
    {"name": "Singapore", "country_iso": "SGP", "lat": 1.26, "lon": 103.84, "port_type": "container", "throughput_teu": 37200000, "unlocode": "SGSIN"},
    {"name": "Ningbo-Zhoushan", "country_iso": "CHN", "lat": 29.87, "lon": 121.56, "port_type": "container", "throughput_teu": 33350000, "unlocode": "CNNGB"},
    {"name": "Shenzhen", "country_iso": "CHN", "lat": 22.54, "lon": 114.05, "port_type": "container", "throughput_teu": 28750000, "unlocode": "CNSZX"},
    {"name": "Guangzhou", "country_iso": "CHN", "lat": 23.13, "lon": 113.27, "port_type": "container", "throughput_teu": 24180000, "unlocode": "CNCAN"},
    {"name": "Busan", "country_iso": "KOR", "lat": 35.10, "lon": 129.04, "port_type": "container", "throughput_teu": 22070000, "unlocode": "KRPUS"},
    {"name": "Qingdao", "country_iso": "CHN", "lat": 36.07, "lon": 120.38, "port_type": "container", "throughput_teu": 21800000, "unlocode": "CNTAO"},
    {"name": "Tianjin", "country_iso": "CHN", "lat": 38.99, "lon": 117.75, "port_type": "container", "throughput_teu": 18350000, "unlocode": "CNTSN"},
    {"name": "Hong Kong", "country_iso": "HKG", "lat": 22.28, "lon": 114.17, "port_type": "container", "throughput_teu": 17900000, "unlocode": "HKHKG"},
    {"name": "Rotterdam", "country_iso": "NLD", "lat": 51.95, "lon": 4.13, "port_type": "container", "throughput_teu": 14820000, "unlocode": "NLRTM"},
    {"name": "Dubai (Jebel Ali)", "country_iso": "ARE", "lat": 25.01, "lon": 55.06, "port_type": "container", "throughput_teu": 14110000, "unlocode": "AEJEA"},
    {"name": "Port Klang", "country_iso": "MYS", "lat": 3.00, "lon": 101.40, "port_type": "container", "throughput_teu": 13200000, "unlocode": "MYPKG"},
    {"name": "Antwerp-Bruges", "country_iso": "BEL", "lat": 51.27, "lon": 4.35, "port_type": "container", "throughput_teu": 13100000, "unlocode": "BEANR"},
    {"name": "Xiamen", "country_iso": "CHN", "lat": 24.48, "lon": 118.08, "port_type": "container", "throughput_teu": 12000000, "unlocode": "CNXMN"},
    {"name": "Kaohsiung", "country_iso": "TWN", "lat": 22.62, "lon": 120.27, "port_type": "container", "throughput_teu": 9900000, "unlocode": "TWKHH"},
    {"name": "Los Angeles", "country_iso": "USA", "lat": 33.74, "lon": -118.26, "port_type": "container", "throughput_teu": 9900000, "unlocode": "USLAX"},
    {"name": "Hamburg", "country_iso": "DEU", "lat": 53.55, "lon": 9.97, "port_type": "container", "throughput_teu": 8700000, "unlocode": "DEHAM"},
    {"name": "Tanjung Pelepas", "country_iso": "MYS", "lat": 1.37, "lon": 103.55, "port_type": "container", "throughput_teu": 8600000, "unlocode": "MYTPP"},
    {"name": "Laem Chabang", "country_iso": "THA", "lat": 13.08, "lon": 100.88, "port_type": "container", "throughput_teu": 7800000, "unlocode": "THLCH"},
    {"name": "Long Beach", "country_iso": "USA", "lat": 33.75, "lon": -118.19, "port_type": "container", "throughput_teu": 7600000, "unlocode": "USLGB"},
    {"name": "Tanjung Priok (Jakarta)", "country_iso": "IDN", "lat": -6.10, "lon": 106.87, "port_type": "container", "throughput_teu": 7500000, "unlocode": "IDTPP"},
    {"name": "Ho Chi Minh City", "country_iso": "VNM", "lat": 10.80, "lon": 106.69, "port_type": "container", "throughput_teu": 7200000, "unlocode": "VNSGN"},
    {"name": "Colombo", "country_iso": "LKA", "lat": 6.95, "lon": 79.85, "port_type": "container", "throughput_teu": 7100000, "unlocode": "LKCMB"},
    {"name": "Piraeus", "country_iso": "GRC", "lat": 37.94, "lon": 23.63, "port_type": "container", "throughput_teu": 5300000, "unlocode": "GRPIR"},
    {"name": "New York/New Jersey", "country_iso": "USA", "lat": 40.68, "lon": -74.04, "port_type": "container", "throughput_teu": 5200000, "unlocode": "USNYC"},
    {"name": "Savannah", "country_iso": "USA", "lat": 32.08, "lon": -81.09, "port_type": "container", "throughput_teu": 4800000, "unlocode": "USSAV"},
    {"name": "Jeddah", "country_iso": "SAU", "lat": 21.49, "lon": 39.17, "port_type": "container", "throughput_teu": 4700000, "unlocode": "SAJED"},
    {"name": "Santos", "country_iso": "BRA", "lat": -23.96, "lon": -46.33, "port_type": "container", "throughput_teu": 4200000, "unlocode": "BRSSZ"},
    {"name": "Felixstowe", "country_iso": "GBR", "lat": 51.96, "lon": 1.35, "port_type": "container", "throughput_teu": 3800000, "unlocode": "GBFXT"},
    {"name": "Algeciras", "country_iso": "ESP", "lat": 36.13, "lon": -5.44, "port_type": "container", "throughput_teu": 3600000, "unlocode": "ESALG"},
    # Oil/Energy ports
    {"name": "Ras Tanura", "country_iso": "SAU", "lat": 26.64, "lon": 50.17, "port_type": "oil", "throughput_tons": 300000000, "unlocode": "SARTA"},
    {"name": "Fujairah", "country_iso": "ARE", "lat": 25.12, "lon": 56.36, "port_type": "oil", "throughput_tons": 200000000, "unlocode": "AEFJR"},
    {"name": "Kharg Island", "country_iso": "IRN", "lat": 29.23, "lon": 50.33, "port_type": "oil", "throughput_tons": 180000000, "unlocode": "IRKHK"},
    {"name": "Houston", "country_iso": "USA", "lat": 29.76, "lon": -95.27, "port_type": "oil", "throughput_tons": 170000000, "unlocode": "USHOU"},
    {"name": "Novorossiysk", "country_iso": "RUS", "lat": 44.72, "lon": 37.77, "port_type": "oil", "throughput_tons": 140000000, "unlocode": "RUNVS"},
    {"name": "Primorsk", "country_iso": "RUS", "lat": 60.35, "lon": 28.68, "port_type": "oil", "throughput_tons": 120000000, "unlocode": "RUPRM"},
    {"name": "Basra", "country_iso": "IRQ", "lat": 30.49, "lon": 47.83, "port_type": "oil", "throughput_tons": 110000000, "unlocode": "IQBSR"},
    # Bulk ports
    {"name": "Port Hedland", "country_iso": "AUS", "lat": -20.31, "lon": 118.58, "port_type": "bulk", "throughput_tons": 550000000, "unlocode": "AUPHD"},
    {"name": "Dampier", "country_iso": "AUS", "lat": -20.66, "lon": 116.71, "port_type": "bulk", "throughput_tons": 180000000, "unlocode": "AUDAM"},
    {"name": "Richards Bay", "country_iso": "ZAF", "lat": -28.80, "lon": 32.09, "port_type": "bulk", "throughput_tons": 90000000, "unlocode": "ZARCB"},
    {"name": "Tubarao (Vitoria)", "country_iso": "BRA", "lat": -20.29, "lon": -40.24, "port_type": "bulk", "throughput_tons": 120000000, "unlocode": "BRVIX"},
    {"name": "Newcastle", "country_iso": "AUS", "lat": -32.93, "lon": 151.78, "port_type": "bulk", "throughput_tons": 160000000, "unlocode": "AUNTL"},
    {"name": "Suez Canal (Port Said)", "country_iso": "EGY", "lat": 31.26, "lon": 32.30, "port_type": "transit", "throughput_teu": 3500000, "unlocode": "EGPSD"},
    {"name": "Panama Canal (Balboa)", "country_iso": "PAN", "lat": 8.96, "lon": -79.57, "port_type": "transit", "throughput_teu": 2800000, "unlocode": "PABLB"},

    # ══════════════════════════════════════════════════════════════════
    #  EXPANSION — Container ports (ranked by TEU throughput)
    # ══════════════════════════════════════════════════════════════════

    # ── Asia — Container ──
    {"name": "Dalian", "country_iso": "CHN", "lat": 38.97, "lon": 121.63, "port_type": "container", "throughput_teu": 8700000, "unlocode": "CNDLC"},
    {"name": "Suzhou (Taicang)", "country_iso": "CHN", "lat": 31.62, "lon": 121.13, "port_type": "container", "throughput_teu": 7500000, "unlocode": "CNTAG"},
    {"name": "Rizhao", "country_iso": "CHN", "lat": 35.40, "lon": 119.53, "port_type": "container", "throughput_teu": 5300000, "unlocode": "CNRZH"},
    {"name": "Yingkou", "country_iso": "CHN", "lat": 40.67, "lon": 122.23, "port_type": "container", "throughput_teu": 4500000, "unlocode": "CNYKW"},
    {"name": "Lianyungang", "country_iso": "CHN", "lat": 34.73, "lon": 119.45, "port_type": "container", "throughput_teu": 5000000, "unlocode": "CNLYG"},
    {"name": "Fuzhou", "country_iso": "CHN", "lat": 26.06, "lon": 119.31, "port_type": "container", "throughput_teu": 3800000, "unlocode": "CNFOC"},
    {"name": "Dongguan", "country_iso": "CHN", "lat": 23.05, "lon": 113.75, "port_type": "container", "throughput_teu": 3500000, "unlocode": "CNDGG"},
    {"name": "Nanjing", "country_iso": "CHN", "lat": 32.09, "lon": 118.80, "port_type": "container", "throughput_teu": 3200000, "unlocode": "CNNKG"},
    {"name": "Tangshan", "country_iso": "CHN", "lat": 39.23, "lon": 119.05, "port_type": "bulk", "throughput_tons": 720000000, "unlocode": "CNTGS"},
    {"name": "Zhuhai", "country_iso": "CHN", "lat": 22.27, "lon": 113.58, "port_type": "container", "throughput_teu": 2500000, "unlocode": "CNZUH"},
    {"name": "Tokyo", "country_iso": "JPN", "lat": 35.64, "lon": 139.77, "port_type": "container", "throughput_teu": 4500000, "unlocode": "JPTYO"},
    {"name": "Yokohama", "country_iso": "JPN", "lat": 35.44, "lon": 139.65, "port_type": "container", "throughput_teu": 2900000, "unlocode": "JPYOK"},
    {"name": "Kobe", "country_iso": "JPN", "lat": 34.69, "lon": 135.20, "port_type": "container", "throughput_teu": 2900000, "unlocode": "JPUKB"},
    {"name": "Nagoya", "country_iso": "JPN", "lat": 35.09, "lon": 136.88, "port_type": "container", "throughput_teu": 2700000, "unlocode": "JPNGO"},
    {"name": "Osaka", "country_iso": "JPN", "lat": 34.65, "lon": 135.43, "port_type": "container", "throughput_teu": 2300000, "unlocode": "JPOSA"},
    {"name": "Hakata (Fukuoka)", "country_iso": "JPN", "lat": 33.60, "lon": 130.40, "port_type": "container", "throughput_teu": 900000, "unlocode": "JPFUK"},
    {"name": "Chiba", "country_iso": "JPN", "lat": 35.61, "lon": 140.11, "port_type": "bulk", "throughput_tons": 165000000, "unlocode": "JPCHB"},
    {"name": "Kitakyushu", "country_iso": "JPN", "lat": 33.95, "lon": 130.95, "port_type": "container", "throughput_teu": 500000, "unlocode": "JPKKJ"},
    {"name": "JNPT (Nhava Sheva)", "country_iso": "IND", "lat": 18.95, "lon": 72.95, "port_type": "container", "throughput_teu": 5700000, "unlocode": "INNSA"},
    {"name": "Mundra", "country_iso": "IND", "lat": 22.84, "lon": 69.72, "port_type": "container", "throughput_teu": 6500000, "unlocode": "INMUN"},
    {"name": "Chennai", "country_iso": "IND", "lat": 13.10, "lon": 80.30, "port_type": "container", "throughput_teu": 1600000, "unlocode": "INMAA"},
    {"name": "Visakhapatnam", "country_iso": "IND", "lat": 17.69, "lon": 83.29, "port_type": "bulk", "throughput_tons": 75000000, "unlocode": "INVTZ"},
    {"name": "Kandla (Deendayal)", "country_iso": "IND", "lat": 23.03, "lon": 70.21, "port_type": "bulk", "throughput_tons": 130000000, "unlocode": "INIXY"},
    {"name": "Paradip", "country_iso": "IND", "lat": 20.27, "lon": 86.67, "port_type": "bulk", "throughput_tons": 125000000, "unlocode": "INPRT"},
    {"name": "Krishnapatnam", "country_iso": "IND", "lat": 14.26, "lon": 80.13, "port_type": "container", "throughput_teu": 700000, "unlocode": "INKRI"},
    {"name": "Cochin", "country_iso": "IND", "lat": 9.97, "lon": 76.27, "port_type": "container", "throughput_teu": 700000, "unlocode": "INCOK"},
    {"name": "Kolkata/Haldia", "country_iso": "IND", "lat": 22.06, "lon": 88.11, "port_type": "container", "throughput_teu": 800000, "unlocode": "INCCU"},
    {"name": "Incheon", "country_iso": "KOR", "lat": 37.45, "lon": 126.60, "port_type": "container", "throughput_teu": 3300000, "unlocode": "KRINC"},
    {"name": "Gwangyang", "country_iso": "KOR", "lat": 34.93, "lon": 127.70, "port_type": "container", "throughput_teu": 2400000, "unlocode": "KRKWG"},
    {"name": "Ulsan", "country_iso": "KOR", "lat": 35.50, "lon": 129.39, "port_type": "oil", "throughput_tons": 200000000, "unlocode": "KRUSN"},
    {"name": "Taichung", "country_iso": "TWN", "lat": 24.27, "lon": 120.52, "port_type": "container", "throughput_teu": 1800000, "unlocode": "TWTXG"},
    {"name": "Keelung", "country_iso": "TWN", "lat": 25.15, "lon": 121.74, "port_type": "container", "throughput_teu": 1500000, "unlocode": "TWKEL"},
    {"name": "Manila", "country_iso": "PHL", "lat": 14.58, "lon": 120.97, "port_type": "container", "throughput_teu": 5500000, "unlocode": "PHMNL"},
    {"name": "Subic Bay", "country_iso": "PHL", "lat": 14.82, "lon": 120.28, "port_type": "container", "throughput_teu": 500000, "unlocode": "PHSFS"},
    {"name": "Cebu", "country_iso": "PHL", "lat": 10.31, "lon": 123.89, "port_type": "container", "throughput_teu": 400000, "unlocode": "PHCEB"},
    {"name": "Haiphong", "country_iso": "VNM", "lat": 20.86, "lon": 106.68, "port_type": "container", "throughput_teu": 5500000, "unlocode": "VNHPH"},
    {"name": "Cai Mep-Thi Vai", "country_iso": "VNM", "lat": 10.48, "lon": 107.01, "port_type": "container", "throughput_teu": 4000000, "unlocode": "VNCMT"},
    {"name": "Da Nang", "country_iso": "VNM", "lat": 16.06, "lon": 108.22, "port_type": "container", "throughput_teu": 500000, "unlocode": "VNDAD"},
    {"name": "Chittagong", "country_iso": "BGD", "lat": 22.33, "lon": 91.80, "port_type": "container", "throughput_teu": 3200000, "unlocode": "BDCGP"},
    {"name": "Sihanoukville", "country_iso": "KHM", "lat": 10.63, "lon": 103.50, "port_type": "container", "throughput_teu": 800000, "unlocode": "KHKOS"},
    {"name": "Yangon", "country_iso": "MMR", "lat": 16.78, "lon": 96.17, "port_type": "container", "throughput_teu": 600000, "unlocode": "MMRGN"},
    {"name": "Karachi", "country_iso": "PAK", "lat": 24.85, "lon": 66.99, "port_type": "container", "throughput_teu": 2200000, "unlocode": "PKKHI"},
    {"name": "Gwadar", "country_iso": "PAK", "lat": 25.13, "lon": 62.33, "port_type": "container", "throughput_teu": 100000, "unlocode": "PKGWD"},
    {"name": "Hambantota", "country_iso": "LKA", "lat": 6.12, "lon": 81.11, "port_type": "container", "throughput_teu": 200000, "unlocode": "LKHBA"},

    # ── Middle East — Container & Oil ──
    {"name": "Khalifa (Abu Dhabi)", "country_iso": "ARE", "lat": 24.82, "lon": 54.64, "port_type": "container", "throughput_teu": 3200000, "unlocode": "AEKHL"},
    {"name": "Salalah", "country_iso": "OMN", "lat": 16.94, "lon": 54.00, "port_type": "container", "throughput_teu": 3800000, "unlocode": "OMSLL"},
    {"name": "Sohar", "country_iso": "OMN", "lat": 24.37, "lon": 56.73, "port_type": "container", "throughput_teu": 1200000, "unlocode": "OMSOH"},
    {"name": "King Abdullah (KAEC)", "country_iso": "SAU", "lat": 22.40, "lon": 39.10, "port_type": "container", "throughput_teu": 2500000, "unlocode": "SAKAC"},
    {"name": "Dammam", "country_iso": "SAU", "lat": 26.43, "lon": 50.11, "port_type": "container", "throughput_teu": 1800000, "unlocode": "SADMM"},
    {"name": "Jubail", "country_iso": "SAU", "lat": 27.01, "lon": 49.66, "port_type": "oil", "throughput_tons": 80000000, "unlocode": "SAJUB"},
    {"name": "Hamad (Doha)", "country_iso": "QAT", "lat": 25.01, "lon": 51.60, "port_type": "container", "throughput_teu": 2000000, "unlocode": "QAHAM"},
    {"name": "Ras Laffan", "country_iso": "QAT", "lat": 25.93, "lon": 51.54, "port_type": "lng", "throughput_tons": 80000000, "unlocode": "QARAF"},
    {"name": "Shuwaikh (Kuwait)", "country_iso": "KWT", "lat": 29.35, "lon": 47.93, "port_type": "container", "throughput_teu": 800000, "unlocode": "KWSWK"},
    {"name": "Mina Shuaiba", "country_iso": "KWT", "lat": 29.04, "lon": 48.16, "port_type": "oil", "throughput_tons": 50000000, "unlocode": "KWSAA"},
    {"name": "Bahrain (Khalifa bin Salman)", "country_iso": "BHR", "lat": 26.00, "lon": 50.58, "port_type": "container", "throughput_teu": 450000, "unlocode": "BHKBS"},
    {"name": "Bandar Abbas", "country_iso": "IRN", "lat": 27.18, "lon": 56.28, "port_type": "container", "throughput_teu": 2500000, "unlocode": "IRBND"},
    {"name": "Haifa", "country_iso": "ISR", "lat": 32.82, "lon": 34.99, "port_type": "container", "throughput_teu": 1500000, "unlocode": "ILHFA"},
    {"name": "Ashdod", "country_iso": "ISR", "lat": 31.83, "lon": 34.63, "port_type": "container", "throughput_teu": 1200000, "unlocode": "ILASH"},
    {"name": "Aqaba", "country_iso": "JOR", "lat": 29.52, "lon": 35.00, "port_type": "container", "throughput_teu": 800000, "unlocode": "JOAQJ"},
    {"name": "Beirut", "country_iso": "LBN", "lat": 33.90, "lon": 35.52, "port_type": "container", "throughput_teu": 1200000, "unlocode": "LBBEY"},
    {"name": "Mersin", "country_iso": "TUR", "lat": 36.78, "lon": 34.62, "port_type": "container", "throughput_teu": 2100000, "unlocode": "TRMER"},
    {"name": "Ambarli (Istanbul)", "country_iso": "TUR", "lat": 40.96, "lon": 28.69, "port_type": "container", "throughput_teu": 3500000, "unlocode": "TRAMB"},
    {"name": "Izmir (Alsancak)", "country_iso": "TUR", "lat": 38.44, "lon": 27.14, "port_type": "container", "throughput_teu": 900000, "unlocode": "TRIZM"},
    {"name": "Iskenderun", "country_iso": "TUR", "lat": 36.59, "lon": 36.17, "port_type": "container", "throughput_teu": 500000, "unlocode": "TRISK"},
    {"name": "Trabzon", "country_iso": "TUR", "lat": 41.00, "lon": 39.72, "port_type": "container", "throughput_teu": 100000, "unlocode": "TRTRA"},

    # ── Europe — Container ──
    {"name": "Bremerhaven", "country_iso": "DEU", "lat": 53.54, "lon": 8.58, "port_type": "container", "throughput_teu": 5000000, "unlocode": "DEBRV"},
    {"name": "Wilhelmshaven (JadeWeserPort)", "country_iso": "DEU", "lat": 53.57, "lon": 8.15, "port_type": "container", "throughput_teu": 700000, "unlocode": "DEWVN"},
    {"name": "Valencia", "country_iso": "ESP", "lat": 39.44, "lon": -0.33, "port_type": "container", "throughput_teu": 5600000, "unlocode": "ESVLC"},
    {"name": "Barcelona", "country_iso": "ESP", "lat": 41.35, "lon": 2.17, "port_type": "container", "throughput_teu": 3800000, "unlocode": "ESBCN"},
    {"name": "Las Palmas", "country_iso": "ESP", "lat": 28.15, "lon": -15.42, "port_type": "container", "throughput_teu": 1300000, "unlocode": "ESLPA"},
    {"name": "Bilbao", "country_iso": "ESP", "lat": 43.35, "lon": -3.03, "port_type": "container", "throughput_teu": 700000, "unlocode": "ESBIO"},
    {"name": "Genoa", "country_iso": "ITA", "lat": 44.41, "lon": 8.93, "port_type": "container", "throughput_teu": 2600000, "unlocode": "ITGOA"},
    {"name": "Gioia Tauro", "country_iso": "ITA", "lat": 38.43, "lon": 15.90, "port_type": "container", "throughput_teu": 3100000, "unlocode": "ITGIT"},
    {"name": "La Spezia", "country_iso": "ITA", "lat": 44.10, "lon": 9.82, "port_type": "container", "throughput_teu": 1400000, "unlocode": "ITSPE"},
    {"name": "Trieste", "country_iso": "ITA", "lat": 45.65, "lon": 13.76, "port_type": "container", "throughput_teu": 800000, "unlocode": "ITTRS"},
    {"name": "Livorno", "country_iso": "ITA", "lat": 43.55, "lon": 10.30, "port_type": "container", "throughput_teu": 700000, "unlocode": "ITLIV"},
    {"name": "Naples", "country_iso": "ITA", "lat": 40.84, "lon": 14.27, "port_type": "container", "throughput_teu": 600000, "unlocode": "ITNAP"},
    {"name": "Le Havre", "country_iso": "FRA", "lat": 49.49, "lon": 0.12, "port_type": "container", "throughput_teu": 2900000, "unlocode": "FRLEH"},
    {"name": "Marseille (Fos)", "country_iso": "FRA", "lat": 43.40, "lon": 4.87, "port_type": "container", "throughput_teu": 1500000, "unlocode": "FRMRS"},
    {"name": "Dunkirk", "country_iso": "FRA", "lat": 51.05, "lon": 2.37, "port_type": "bulk", "throughput_tons": 47000000, "unlocode": "FRDKK"},
    {"name": "London Gateway", "country_iso": "GBR", "lat": 51.50, "lon": 0.47, "port_type": "container", "throughput_teu": 1800000, "unlocode": "GBLGP"},
    {"name": "Southampton", "country_iso": "GBR", "lat": 50.89, "lon": -1.40, "port_type": "container", "throughput_teu": 1700000, "unlocode": "GBSOU"},
    {"name": "Liverpool", "country_iso": "GBR", "lat": 53.44, "lon": -3.02, "port_type": "container", "throughput_teu": 900000, "unlocode": "GBLIV"},
    {"name": "Gothenburg", "country_iso": "SWE", "lat": 57.69, "lon": 11.94, "port_type": "container", "throughput_teu": 800000, "unlocode": "SEGOT"},
    {"name": "Gdansk", "country_iso": "POL", "lat": 54.40, "lon": 18.69, "port_type": "container", "throughput_teu": 2100000, "unlocode": "PLGDN"},
    {"name": "Gdynia", "country_iso": "POL", "lat": 54.53, "lon": 18.55, "port_type": "container", "throughput_teu": 900000, "unlocode": "PLGDY"},
    {"name": "St Petersburg", "country_iso": "RUS", "lat": 59.90, "lon": 30.25, "port_type": "container", "throughput_teu": 2100000, "unlocode": "RULED"},
    {"name": "Vladivostok", "country_iso": "RUS", "lat": 43.12, "lon": 131.88, "port_type": "container", "throughput_teu": 900000, "unlocode": "RUVVO"},
    {"name": "Ust-Luga", "country_iso": "RUS", "lat": 59.68, "lon": 28.40, "port_type": "oil", "throughput_tons": 100000000, "unlocode": "RUULU"},
    {"name": "Murmansk", "country_iso": "RUS", "lat": 68.97, "lon": 33.07, "port_type": "bulk", "throughput_tons": 55000000, "unlocode": "RUMMK"},
    {"name": "Vostochny", "country_iso": "RUS", "lat": 42.75, "lon": 133.07, "port_type": "container", "throughput_teu": 700000, "unlocode": "RUVYP"},
    {"name": "Constanta", "country_iso": "ROU", "lat": 44.17, "lon": 28.66, "port_type": "container", "throughput_teu": 700000, "unlocode": "ROCND"},
    {"name": "Koper", "country_iso": "SVN", "lat": 45.55, "lon": 13.73, "port_type": "container", "throughput_teu": 1000000, "unlocode": "SIKOP"},
    {"name": "Rijeka", "country_iso": "HRV", "lat": 45.33, "lon": 14.44, "port_type": "container", "throughput_teu": 350000, "unlocode": "HRRJK"},
    {"name": "Thessaloniki", "country_iso": "GRC", "lat": 40.63, "lon": 22.94, "port_type": "container", "throughput_teu": 450000, "unlocode": "GRSKG"},
    {"name": "Zeebrugge", "country_iso": "BEL", "lat": 51.33, "lon": 3.18, "port_type": "container", "throughput_teu": 1800000, "unlocode": "BEZEE"},
    {"name": "Aarhus", "country_iso": "DNK", "lat": 56.15, "lon": 10.22, "port_type": "container", "throughput_teu": 500000, "unlocode": "DKAAR"},
    {"name": "Helsinki", "country_iso": "FIN", "lat": 60.16, "lon": 24.96, "port_type": "container", "throughput_teu": 400000, "unlocode": "FIHEL"},
    {"name": "Kotka (HaminaKotka)", "country_iso": "FIN", "lat": 60.47, "lon": 26.95, "port_type": "container", "throughput_teu": 600000, "unlocode": "FIKTK"},
    {"name": "Sines", "country_iso": "PRT", "lat": 37.95, "lon": -8.87, "port_type": "container", "throughput_teu": 1800000, "unlocode": "PTSIE"},
    {"name": "Lisbon", "country_iso": "PRT", "lat": 38.70, "lon": -9.15, "port_type": "container", "throughput_teu": 400000, "unlocode": "PTLIS"},
    {"name": "Leixoes (Porto)", "country_iso": "PRT", "lat": 41.18, "lon": -8.70, "port_type": "container", "throughput_teu": 700000, "unlocode": "PTLEI"},
    {"name": "Marsaxlokk", "country_iso": "MLT", "lat": 35.84, "lon": 14.54, "port_type": "container", "throughput_teu": 2800000, "unlocode": "MTMAR"},
    {"name": "Dublin", "country_iso": "IRL", "lat": 53.35, "lon": -6.22, "port_type": "container", "throughput_teu": 800000, "unlocode": "IEDUB"},
    {"name": "Cork", "country_iso": "IRL", "lat": 51.85, "lon": -8.29, "port_type": "container", "throughput_teu": 250000, "unlocode": "IEORK"},

    # ── Africa ──
    {"name": "Tanger Med", "country_iso": "MAR", "lat": 35.87, "lon": -5.50, "port_type": "container", "throughput_teu": 7200000, "unlocode": "MAPTM"},
    {"name": "Casablanca", "country_iso": "MAR", "lat": 33.60, "lon": -7.62, "port_type": "container", "throughput_teu": 1000000, "unlocode": "MACAS"},
    {"name": "Durban", "country_iso": "ZAF", "lat": -29.87, "lon": 31.05, "port_type": "container", "throughput_teu": 2800000, "unlocode": "ZADUR"},
    {"name": "Cape Town", "country_iso": "ZAF", "lat": -33.90, "lon": 18.44, "port_type": "container", "throughput_teu": 900000, "unlocode": "ZACPT"},
    {"name": "Ngqura (Coega)", "country_iso": "ZAF", "lat": -33.76, "lon": 25.67, "port_type": "container", "throughput_teu": 800000, "unlocode": "ZANQU"},
    {"name": "Saldanha Bay", "country_iso": "ZAF", "lat": -33.01, "lon": 17.93, "port_type": "bulk", "throughput_tons": 65000000, "unlocode": "ZASDB"},
    {"name": "Lagos (Apapa/Tin Can)", "country_iso": "NGA", "lat": 6.44, "lon": 3.39, "port_type": "container", "throughput_teu": 1800000, "unlocode": "NGLOS"},
    {"name": "Onne", "country_iso": "NGA", "lat": 4.73, "lon": 7.15, "port_type": "bulk", "throughput_tons": 20000000, "unlocode": "NGONN"},
    {"name": "Mombasa", "country_iso": "KEN", "lat": -4.04, "lon": 39.67, "port_type": "container", "throughput_teu": 1400000, "unlocode": "KEMBA"},
    {"name": "Dar es Salaam", "country_iso": "TZA", "lat": -6.83, "lon": 39.29, "port_type": "container", "throughput_teu": 600000, "unlocode": "TZDAR"},
    {"name": "Djibouti (Doraleh)", "country_iso": "DJI", "lat": 11.59, "lon": 43.15, "port_type": "container", "throughput_teu": 1000000, "unlocode": "DJJIB"},
    {"name": "Maputo", "country_iso": "MOZ", "lat": -25.97, "lon": 32.56, "port_type": "container", "throughput_teu": 400000, "unlocode": "MZMPM"},
    {"name": "Beira", "country_iso": "MOZ", "lat": -19.84, "lon": 34.87, "port_type": "container", "throughput_teu": 200000, "unlocode": "MZBEW"},
    {"name": "Lome", "country_iso": "TGO", "lat": 6.13, "lon": 1.29, "port_type": "container", "throughput_teu": 1600000, "unlocode": "TGLFW"},
    {"name": "Abidjan", "country_iso": "CIV", "lat": 5.26, "lon": -3.96, "port_type": "container", "throughput_teu": 1000000, "unlocode": "CIABJ"},
    {"name": "Dakar", "country_iso": "SEN", "lat": 14.68, "lon": -17.44, "port_type": "container", "throughput_teu": 600000, "unlocode": "SNDKR"},
    {"name": "Tema", "country_iso": "GHA", "lat": 5.62, "lon": -0.02, "port_type": "container", "throughput_teu": 1000000, "unlocode": "GHTEM"},
    {"name": "Douala", "country_iso": "CMR", "lat": 4.05, "lon": 9.70, "port_type": "container", "throughput_teu": 400000, "unlocode": "CMDLA"},
    {"name": "Pointe Noire", "country_iso": "COG", "lat": -4.80, "lon": 11.85, "port_type": "container", "throughput_teu": 400000, "unlocode": "CGPNR"},
    {"name": "Luanda", "country_iso": "AGO", "lat": -8.80, "lon": 13.24, "port_type": "container", "throughput_teu": 400000, "unlocode": "AOLAD"},
    {"name": "Walvis Bay", "country_iso": "NAM", "lat": -22.96, "lon": 14.51, "port_type": "container", "throughput_teu": 200000, "unlocode": "NAWVB"},
    {"name": "Port Louis", "country_iso": "MUS", "lat": -20.16, "lon": 57.50, "port_type": "container", "throughput_teu": 400000, "unlocode": "MUPLU"},
    {"name": "Libreville", "country_iso": "GAB", "lat": 0.39, "lon": 9.43, "port_type": "oil", "throughput_tons": 15000000, "unlocode": "GALBV"},
    {"name": "Alexandria", "country_iso": "EGY", "lat": 31.20, "lon": 29.90, "port_type": "container", "throughput_teu": 1800000, "unlocode": "EGALY"},
    {"name": "Sokhna (Ain Sokhna)", "country_iso": "EGY", "lat": 29.60, "lon": 32.33, "port_type": "container", "throughput_teu": 700000, "unlocode": "EGSOK"},
    {"name": "East Port Said", "country_iso": "EGY", "lat": 31.26, "lon": 32.37, "port_type": "container", "throughput_teu": 3500000, "unlocode": "EGEPT"},
    {"name": "Algiers", "country_iso": "DZA", "lat": 36.76, "lon": 3.06, "port_type": "container", "throughput_teu": 800000, "unlocode": "DZALG"},
    {"name": "Oran", "country_iso": "DZA", "lat": 35.70, "lon": -0.65, "port_type": "container", "throughput_teu": 300000, "unlocode": "DZORN"},
    {"name": "Rades (Tunis)", "country_iso": "TUN", "lat": 36.77, "lon": 10.28, "port_type": "container", "throughput_teu": 400000, "unlocode": "TNRAD"},
    {"name": "Tripoli", "country_iso": "LBY", "lat": 32.90, "lon": 13.18, "port_type": "oil", "throughput_tons": 20000000, "unlocode": "LYTIP"},
    {"name": "Port Sudan", "country_iso": "SDN", "lat": 19.62, "lon": 37.22, "port_type": "container", "throughput_teu": 300000, "unlocode": "SDPZU"},

    # ── North America ──
    {"name": "Vancouver", "country_iso": "CAN", "lat": 49.29, "lon": -123.11, "port_type": "container", "throughput_teu": 3600000, "unlocode": "CAVAN"},
    {"name": "Montreal", "country_iso": "CAN", "lat": 45.50, "lon": -73.55, "port_type": "container", "throughput_teu": 1700000, "unlocode": "CAMTR"},
    {"name": "Prince Rupert", "country_iso": "CAN", "lat": 54.32, "lon": -130.33, "port_type": "container", "throughput_teu": 1100000, "unlocode": "CAPRR"},
    {"name": "Halifax", "country_iso": "CAN", "lat": 44.65, "lon": -63.57, "port_type": "container", "throughput_teu": 600000, "unlocode": "CAHAL"},
    {"name": "Saint John", "country_iso": "CAN", "lat": 45.27, "lon": -66.06, "port_type": "bulk", "throughput_tons": 28000000, "unlocode": "CASJN"},
    {"name": "Charleston", "country_iso": "USA", "lat": 32.78, "lon": -79.93, "port_type": "container", "throughput_teu": 2800000, "unlocode": "USCHS"},
    {"name": "Oakland", "country_iso": "USA", "lat": 37.80, "lon": -122.27, "port_type": "container", "throughput_teu": 2500000, "unlocode": "USOAK"},
    {"name": "Virginia (Norfolk)", "country_iso": "USA", "lat": 36.85, "lon": -76.29, "port_type": "container", "throughput_teu": 3700000, "unlocode": "USORF"},
    {"name": "Seattle-Tacoma", "country_iso": "USA", "lat": 47.27, "lon": -122.34, "port_type": "container", "throughput_teu": 3400000, "unlocode": "USSEA"},
    {"name": "Miami", "country_iso": "USA", "lat": 25.77, "lon": -80.17, "port_type": "container", "throughput_teu": 1200000, "unlocode": "USMIA"},
    {"name": "Jacksonville", "country_iso": "USA", "lat": 30.40, "lon": -81.62, "port_type": "container", "throughput_teu": 1300000, "unlocode": "USJAX"},
    {"name": "Baltimore", "country_iso": "USA", "lat": 39.26, "lon": -76.58, "port_type": "container", "throughput_teu": 1100000, "unlocode": "USBAL"},
    {"name": "Philadelphia", "country_iso": "USA", "lat": 39.90, "lon": -75.14, "port_type": "container", "throughput_teu": 700000, "unlocode": "USPHL"},
    {"name": "Tacoma", "country_iso": "USA", "lat": 47.26, "lon": -122.42, "port_type": "container", "throughput_teu": 800000, "unlocode": "USTCM"},
    {"name": "New Orleans", "country_iso": "USA", "lat": 29.93, "lon": -90.03, "port_type": "bulk", "throughput_tons": 90000000, "unlocode": "USMSY"},
    {"name": "Corpus Christi", "country_iso": "USA", "lat": 27.81, "lon": -97.40, "port_type": "oil", "throughput_tons": 130000000, "unlocode": "USCRP"},
    {"name": "Beaumont", "country_iso": "USA", "lat": 30.08, "lon": -94.10, "port_type": "oil", "throughput_tons": 90000000, "unlocode": "USBPT"},
    {"name": "Manzanillo", "country_iso": "MEX", "lat": 19.05, "lon": -104.32, "port_type": "container", "throughput_teu": 3400000, "unlocode": "MXZLO"},
    {"name": "Lazaro Cardenas", "country_iso": "MEX", "lat": 17.94, "lon": -102.17, "port_type": "container", "throughput_teu": 1500000, "unlocode": "MXLZC"},
    {"name": "Veracruz", "country_iso": "MEX", "lat": 19.18, "lon": -96.13, "port_type": "container", "throughput_teu": 1200000, "unlocode": "MXVER"},
    {"name": "Altamira", "country_iso": "MEX", "lat": 22.40, "lon": -97.87, "port_type": "container", "throughput_teu": 600000, "unlocode": "MXATM"},
    {"name": "Ensenada", "country_iso": "MEX", "lat": 31.86, "lon": -116.60, "port_type": "container", "throughput_teu": 300000, "unlocode": "MXESE"},

    # ── Caribbean & Central America ──
    {"name": "Freeport (Bahamas)", "country_iso": "BHS", "lat": 26.53, "lon": -78.70, "port_type": "container", "throughput_teu": 2000000, "unlocode": "BSFPO"},
    {"name": "Kingston", "country_iso": "JAM", "lat": 17.97, "lon": -76.84, "port_type": "container", "throughput_teu": 1800000, "unlocode": "JMKIN"},
    {"name": "Colon (Cristobal)", "country_iso": "PAN", "lat": 9.36, "lon": -79.90, "port_type": "container", "throughput_teu": 4000000, "unlocode": "PACRI"},
    {"name": "San Juan", "country_iso": "PRI", "lat": 18.46, "lon": -66.10, "port_type": "container", "throughput_teu": 1400000, "unlocode": "PRSJU"},
    {"name": "Caucedo", "country_iso": "DOM", "lat": 18.43, "lon": -69.63, "port_type": "container", "throughput_teu": 1200000, "unlocode": "DOCAU"},
    {"name": "Limon/Moin", "country_iso": "CRI", "lat": 10.00, "lon": -83.08, "port_type": "container", "throughput_teu": 1200000, "unlocode": "CRLIO"},
    {"name": "Puerto Cortes", "country_iso": "HND", "lat": 15.83, "lon": -87.95, "port_type": "container", "throughput_teu": 600000, "unlocode": "HNPCR"},
    {"name": "Santo Tomas de Castilla", "country_iso": "GTM", "lat": 15.70, "lon": -88.62, "port_type": "container", "throughput_teu": 400000, "unlocode": "GTSTC"},
    {"name": "Havana", "country_iso": "CUB", "lat": 23.14, "lon": -82.34, "port_type": "container", "throughput_teu": 200000, "unlocode": "CUHAV"},
    {"name": "Port of Spain", "country_iso": "TTO", "lat": 10.65, "lon": -61.52, "port_type": "container", "throughput_teu": 400000, "unlocode": "TTPOS"},
    {"name": "Point Lisas", "country_iso": "TTO", "lat": 10.41, "lon": -61.47, "port_type": "bulk", "throughput_tons": 15000000, "unlocode": "TTPLS"},

    # ── South America ──
    {"name": "Cartagena", "country_iso": "COL", "lat": 10.40, "lon": -75.51, "port_type": "container", "throughput_teu": 3200000, "unlocode": "COCTG"},
    {"name": "Buenaventura", "country_iso": "COL", "lat": 3.88, "lon": -77.02, "port_type": "container", "throughput_teu": 1200000, "unlocode": "COBUN"},
    {"name": "Buenos Aires", "country_iso": "ARG", "lat": -34.60, "lon": -58.37, "port_type": "container", "throughput_teu": 1600000, "unlocode": "ARBUE"},
    {"name": "Rosario", "country_iso": "ARG", "lat": -32.95, "lon": -60.63, "port_type": "bulk", "throughput_tons": 40000000, "unlocode": "ARROS"},
    {"name": "Bahia Blanca", "country_iso": "ARG", "lat": -38.73, "lon": -62.27, "port_type": "bulk", "throughput_tons": 25000000, "unlocode": "ARBHI"},
    {"name": "Callao", "country_iso": "PER", "lat": -12.06, "lon": -77.14, "port_type": "container", "throughput_teu": 2600000, "unlocode": "PECLL"},
    {"name": "San Antonio", "country_iso": "CHL", "lat": -33.59, "lon": -71.61, "port_type": "container", "throughput_teu": 1700000, "unlocode": "CLSAI"},
    {"name": "Valparaiso", "country_iso": "CHL", "lat": -33.04, "lon": -71.63, "port_type": "container", "throughput_teu": 900000, "unlocode": "CLVAP"},
    {"name": "Paranagua", "country_iso": "BRA", "lat": -25.52, "lon": -48.51, "port_type": "container", "throughput_teu": 1000000, "unlocode": "BRPNG"},
    {"name": "Itaqui (Sao Luis)", "country_iso": "BRA", "lat": -2.57, "lon": -44.36, "port_type": "bulk", "throughput_tons": 60000000, "unlocode": "BRITQ"},
    {"name": "Rio Grande", "country_iso": "BRA", "lat": -32.05, "lon": -52.10, "port_type": "container", "throughput_teu": 800000, "unlocode": "BRRIG"},
    {"name": "Itajai/Navegantes", "country_iso": "BRA", "lat": -26.91, "lon": -48.67, "port_type": "container", "throughput_teu": 1500000, "unlocode": "BRITJ"},
    {"name": "Suape (Recife)", "country_iso": "BRA", "lat": -8.39, "lon": -34.96, "port_type": "container", "throughput_teu": 500000, "unlocode": "BRSUA"},
    {"name": "Manaus", "country_iso": "BRA", "lat": -3.12, "lon": -59.98, "port_type": "container", "throughput_teu": 500000, "unlocode": "BRMAO"},
    {"name": "Guayaquil", "country_iso": "ECU", "lat": -2.17, "lon": -79.93, "port_type": "container", "throughput_teu": 2000000, "unlocode": "ECGYE"},
    {"name": "Montevideo", "country_iso": "URY", "lat": -34.90, "lon": -56.21, "port_type": "container", "throughput_teu": 800000, "unlocode": "UYMVD"},
    {"name": "La Guaira (Caracas)", "country_iso": "VEN", "lat": 10.60, "lon": -66.93, "port_type": "container", "throughput_teu": 400000, "unlocode": "VELAG"},
    {"name": "Puerto Cabello", "country_iso": "VEN", "lat": 10.47, "lon": -68.01, "port_type": "container", "throughput_teu": 300000, "unlocode": "VEPBL"},
    {"name": "Georgetown", "country_iso": "GUY", "lat": 6.80, "lon": -58.16, "port_type": "bulk", "throughput_tons": 10000000, "unlocode": "GYGEO"},
    {"name": "Paramaribo", "country_iso": "SUR", "lat": 5.83, "lon": -55.17, "port_type": "container", "throughput_teu": 50000, "unlocode": "SRPBM"},

    # ── Oceania ──
    {"name": "Melbourne", "country_iso": "AUS", "lat": -37.81, "lon": 144.93, "port_type": "container", "throughput_teu": 3000000, "unlocode": "AUMEL"},
    {"name": "Sydney (Botany Bay)", "country_iso": "AUS", "lat": -33.96, "lon": 151.19, "port_type": "container", "throughput_teu": 2700000, "unlocode": "AUSYD"},
    {"name": "Brisbane", "country_iso": "AUS", "lat": -27.38, "lon": 153.17, "port_type": "container", "throughput_teu": 1300000, "unlocode": "AUBNE"},
    {"name": "Fremantle (Perth)", "country_iso": "AUS", "lat": -32.06, "lon": 115.74, "port_type": "container", "throughput_teu": 800000, "unlocode": "AUFRE"},
    {"name": "Adelaide", "country_iso": "AUS", "lat": -34.79, "lon": 138.51, "port_type": "container", "throughput_teu": 400000, "unlocode": "AUADL"},
    {"name": "Gladstone", "country_iso": "AUS", "lat": -23.85, "lon": 151.27, "port_type": "bulk", "throughput_tons": 125000000, "unlocode": "AUGLT"},
    {"name": "Hay Point", "country_iso": "AUS", "lat": -21.28, "lon": 149.30, "port_type": "bulk", "throughput_tons": 110000000, "unlocode": "AUHPT"},
    {"name": "Darwin", "country_iso": "AUS", "lat": -12.46, "lon": 130.85, "port_type": "bulk", "throughput_tons": 10000000, "unlocode": "AUDRW"},
    {"name": "Auckland", "country_iso": "NZL", "lat": -36.84, "lon": 174.77, "port_type": "container", "throughput_teu": 900000, "unlocode": "NZAKL"},
    {"name": "Tauranga", "country_iso": "NZL", "lat": -37.65, "lon": 176.18, "port_type": "container", "throughput_teu": 1200000, "unlocode": "NZTRG"},
    {"name": "Lyttelton (Christchurch)", "country_iso": "NZL", "lat": -43.60, "lon": 172.72, "port_type": "container", "throughput_teu": 400000, "unlocode": "NZLYT"},
    {"name": "Lautoka", "country_iso": "FJI", "lat": -17.60, "lon": 177.45, "port_type": "container", "throughput_teu": 50000, "unlocode": "FJLTK"},
    {"name": "Suva", "country_iso": "FJI", "lat": -18.14, "lon": 178.44, "port_type": "container", "throughput_teu": 50000, "unlocode": "FJSUV"},
    {"name": "Noumea", "country_iso": "NCL", "lat": -22.27, "lon": 166.44, "port_type": "bulk", "throughput_tons": 5000000, "unlocode": "NCNOU"},
    {"name": "Apia", "country_iso": "WSM", "lat": -13.83, "lon": -171.76, "port_type": "container", "throughput_teu": 20000, "unlocode": "WSAPW"},
    {"name": "Nuku'alofa", "country_iso": "TON", "lat": -21.14, "lon": -175.20, "port_type": "container", "throughput_teu": 15000, "unlocode": "TONUK"},
    {"name": "Port Moresby", "country_iso": "PNG", "lat": -9.47, "lon": 147.16, "port_type": "container", "throughput_teu": 200000, "unlocode": "PGPOM"},
    {"name": "Lae", "country_iso": "PNG", "lat": -6.73, "lon": 147.00, "port_type": "container", "throughput_teu": 100000, "unlocode": "PGLAE"},

    # ── LNG terminals ──
    {"name": "Sabine Pass", "country_iso": "USA", "lat": 29.73, "lon": -93.86, "port_type": "lng", "throughput_tons": 30000000, "unlocode": "USSAB"},
    {"name": "Cameron LNG", "country_iso": "USA", "lat": 29.78, "lon": -93.38, "port_type": "lng", "throughput_tons": 15000000, "unlocode": "USCAM"},
    {"name": "Freeport LNG", "country_iso": "USA", "lat": 28.94, "lon": -95.31, "port_type": "lng", "throughput_tons": 15000000, "unlocode": "USFPT"},
    {"name": "Bintulu LNG", "country_iso": "MYS", "lat": 3.17, "lon": 113.05, "port_type": "lng", "throughput_tons": 25000000, "unlocode": "MYBTU"},
    {"name": "Gladstone LNG", "country_iso": "AUS", "lat": -23.85, "lon": 151.30, "port_type": "lng", "throughput_tons": 20000000, "unlocode": "AUGLNG"},
    {"name": "Yamal LNG (Sabetta)", "country_iso": "RUS", "lat": 71.27, "lon": 72.07, "port_type": "lng", "throughput_tons": 18000000, "unlocode": "RUSAB"},
    {"name": "Das Island", "country_iso": "ARE", "lat": 25.15, "lon": 52.87, "port_type": "lng", "throughput_tons": 12000000, "unlocode": "AEDAS"},
    {"name": "Hammerfest (Melkoya)", "country_iso": "NOR", "lat": 70.67, "lon": 23.63, "port_type": "lng", "throughput_tons": 5500000, "unlocode": "NOHFT"},
    {"name": "Bonny Island", "country_iso": "NGA", "lat": 4.43, "lon": 7.17, "port_type": "lng", "throughput_tons": 22000000, "unlocode": "NGBON"},
    {"name": "Damietta LNG", "country_iso": "EGY", "lat": 31.42, "lon": 31.79, "port_type": "lng", "throughput_tons": 5000000, "unlocode": "EGDAM"},
    {"name": "Balhaf LNG", "country_iso": "YEM", "lat": 14.03, "lon": 48.16, "port_type": "lng", "throughput_tons": 7000000, "unlocode": "YEBLH"},
    {"name": "Arzew", "country_iso": "DZA", "lat": 35.82, "lon": -0.27, "port_type": "lng", "throughput_tons": 20000000, "unlocode": "DZARW"},
]


def seed_ports():
    """Seed port data into the database."""
    db = SessionLocal()

    try:
        for port_data in PORTS_DATA:
            existing = db.query(Port).filter(Port.unlocode == port_data["unlocode"]).first()

            if existing:
                for key, value in port_data.items():
                    setattr(existing, key, value)
            else:
                port = Port(**port_data)
                db.add(port)

        db.commit()
        logger.info(f"Seeded {len(PORTS_DATA)} ports")

    finally:
        db.close()

    return len(PORTS_DATA)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    seed_ports()

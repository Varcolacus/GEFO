"""
Seed data for major world ports.
Static data from World Shipping Council and public sources.
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

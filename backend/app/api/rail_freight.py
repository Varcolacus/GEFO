from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
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
    # Australian states
    "AU-NSW": ("New South Wales", -33.87, 151.21),
    "AU-VIC": ("Victoria", -37.81, 144.96),
    "AU-QLD": ("Queensland", -27.47, 153.03),
    "AU-SA": ("South Australia", -34.93, 138.60),
    "AU-WA": ("Western Australia", -31.95, 115.86),
    "AU-NT": ("Northern Territory", -12.46, 130.84),
    "AU-TAS": ("Tasmania", -42.88, 147.33),
    "AU-ACT": ("ACT", -35.28, 149.13),
    # Brazilian states
    "BR-PA": ("Pará", -1.46, -48.50),
    "BR-MA": ("Maranhão", -2.53, -44.28),
    "BR-MG": ("Minas Gerais", -19.92, -43.94),
    "BR-ES": ("Espírito Santo", -20.32, -40.34),
    "BR-SP": ("São Paulo", -23.55, -46.63),
    "BR-RJ": ("Rio de Janeiro", -22.91, -43.17),
    "BR-MT": ("Mato Grosso", -15.60, -56.10),
    "BR-PR": ("Paraná", -25.43, -49.27),
    "BR-BA": ("Bahia", -12.97, -38.51),
    "BR-RS": ("Rio Grande do Sul", -30.03, -51.23),
    "BR-SC": ("Santa Catarina", -27.59, -48.55),
    # South African provinces
    "ZA-NC": ("Northern Cape", -28.74, 21.48),
    "ZA-WC": ("Western Cape", -33.02, 18.00),
    "ZA-MP": ("Mpumalanga", -25.77, 29.40),
    "ZA-KZN": ("KwaZulu-Natal", -28.73, 32.04),
    "ZA-GP": ("Gauteng", -26.20, 28.05),
    # Colombia departments
    "CO-LAG": ("La Guajira", 11.54, -72.91),
    # Morocco regions
    "MA-05": ("Béni Mellal-Khénifra", 32.34, -6.35),
    "MA-06": ("Casablanca-Settat", 33.57, -7.59),
    "MA-09": ("Marrakech-Safi", 32.30, -9.24),
    # Mauritania regions
    "MR-07": ("Tiris Zemmour", 22.73, -12.33),
    "MR-08": ("Dakhlet Nouadhibou", 20.94, -17.03),
    # ── China provinces ──
    "CN-SX": ("Shanxi", 37.87, 112.55),
    "CN-HE": ("Hebei", 38.04, 114.50),
    "CN-NM": ("Inner Mongolia", 40.82, 111.65),
    "CN-JX": ("Jiangxi", 28.68, 115.89),
    "CN-HN": ("Hunan", 28.21, 112.97),
    "CN-GD": ("Guangdong", 23.13, 113.26),
    "CN-GS": ("Gansu", 36.06, 103.83),
    "CN-XJ": ("Xinjiang", 43.79, 87.63),
    "CN-SC": ("Sichuan", 30.57, 104.07),
    "CN-JS": ("Jiangsu", 32.06, 118.80),
    "CN-SN": ("Shaanxi", 34.26, 108.94),
    "CN-HL": ("Heilongjiang", 45.75, 126.65),
    "CN-LN": ("Liaoning", 41.80, 123.43),
    "CN-JL": ("Jilin", 43.88, 125.32),
    "CN-SH": ("Shanghai", 31.23, 121.47),
    "CN-HB": ("Hubei", 30.59, 114.31),
    "CN-AH": ("Anhui", 31.86, 117.28),
    "CN-YN": ("Yunnan", 25.04, 102.71),
    "CN-GZ": ("Guizhou", 26.65, 106.63),
    "CN-SD": ("Shandong", 36.67, 117.00),
    "CN-ZJ": ("Zhejiang", 30.27, 120.15),
    "CN-FJ": ("Fujian", 26.08, 119.30),
    # ── India states ──
    "IN-JH": ("Jharkhand", 23.61, 85.28),
    "IN-OR": ("Odisha", 20.94, 84.80),
    "IN-UP": ("Uttar Pradesh", 26.85, 80.95),
    "IN-HR": ("Haryana", 29.06, 76.08),
    "IN-MH": ("Maharashtra", 19.08, 72.88),
    "IN-GJ": ("Gujarat", 23.02, 72.57),
    "IN-RJ": ("Rajasthan", 26.92, 75.79),
    "IN-CT": ("Chhattisgarh", 21.25, 81.63),
    "IN-TN": ("Tamil Nadu", 13.08, 80.27),
    "IN-KA": ("Karnataka", 12.97, 77.59),
    "IN-AP": ("Andhra Pradesh", 15.91, 79.74),
    "IN-WB": ("West Bengal", 22.57, 88.36),
    "IN-BR": ("Bihar", 25.60, 85.12),
    "IN-MP": ("Madhya Pradesh", 23.26, 77.41),
    "IN-GA": ("Goa", 15.50, 73.83),
    "IN-DL": ("Delhi", 28.61, 77.21),
    "IN-PB": ("Punjab", 31.15, 75.34),
    "IN-KL": ("Kerala", 10.85, 76.27),
    # ── Russia regions ──
    "RU-KEM": ("Kemerovo", 55.35, 86.09),
    "RU-PRI": ("Primorsky", 43.12, 131.89),
    "RU-LEN": ("Leningrad/StPetersburg", 59.93, 30.32),
    "RU-MUR": ("Murmansk", 68.97, 33.09),
    "RU-KDA": ("Krasnodar", 45.04, 38.97),
    "RU-NVS": ("Novosibirsk", 55.03, 82.92),
    "RU-MOW": ("Moscow", 55.76, 37.62),
    "RU-SVE": ("Sverdlovsk", 56.84, 60.60),
    "RU-IRK": ("Irkutsk", 52.30, 104.30),
    "RU-KHA": ("Khabarovsk", 48.48, 135.07),
    "RU-AMU": ("Amur", 50.29, 128.47),
    "RU-TYU": ("Tyumen", 57.15, 65.53),
    "RU-BA": ("Bashkortostan", 54.74, 55.97),
    "RU-CHE": ("Chelyabinsk", 55.16, 61.40),
    "RU-NVG": ("Novgorod", 58.52, 31.27),
    # ── Canada provinces ──
    "CA-SK": ("Saskatchewan", 52.13, -106.67),
    "CA-AB": ("Alberta", 53.55, -113.49),
    "CA-BC": ("British Columbia", 49.28, -123.12),
    "CA-ON": ("Ontario", 43.65, -79.38),
    "CA-MB": ("Manitoba", 49.90, -97.14),
    "CA-QC": ("Quebec", 46.81, -71.21),
    "CA-NB": ("New Brunswick", 46.09, -64.77),
    # ── Kazakhstan regions ──
    "KZ-KAR": ("Karaganda", 49.80, 73.10),
    "KZ-PAV": ("Pavlodar", 52.29, 76.95),
    "KZ-AKM": ("Akmola", 51.13, 71.43),
    "KZ-ALA": ("Almaty Region", 43.24, 76.95),
    "KZ-KUS": ("Kostanay", 53.21, 63.63),
    "KZ-MAN": ("Mangystau", 43.65, 51.15),
    # ── Ukraine oblasts ──
    "UA-12": ("Dnipropetrovsk", 48.46, 35.05),
    "UA-65": ("Odesa", 46.48, 30.73),
    "UA-23": ("Zaporizhzhia", 47.84, 35.14),
    "UA-30": ("Kyiv", 50.45, 30.52),
    "UA-14": ("Donetsk", 48.00, 37.80),
    "UA-44": ("Luhansk", 48.57, 39.31),
    "UA-53": ("Poltava", 49.59, 34.55),
    "UA-71": ("Cherkasy", 49.44, 32.06),
    "UA-18": ("Zhytomyr", 50.25, 28.66),
    "UA-46": ("Lviv", 49.84, 24.03),
    "UA-63": ("Kharkiv", 49.99, 36.23),
    # ── Mexico states ──
    "MX-QUE": ("Querétaro", 20.59, -100.39),
    "MX-NLE": ("Nuevo León", 25.67, -100.31),
    "MX-JAL": ("Jalisco", 20.66, -103.35),
    "MX-AGU": ("Aguascalientes", 21.88, -102.29),
    "MX-MEX": ("State of Mexico", 19.43, -99.13),
    "MX-HID": ("Hidalgo", 20.09, -98.76),
    "MX-SIN": ("Sinaloa", 24.81, -107.39),
    "MX-SON": ("Sonora", 29.07, -110.96),
    "MX-CHH": ("Chihuahua", 28.63, -106.09),
    # ── Turkey provinces ──
    "TR-34": ("Istanbul", 41.01, 28.98),
    "TR-06": ("Ankara", 39.93, 32.87),
    "TR-42": ("Kocaeli", 40.77, 29.92),
    "TR-35": ("Izmir", 38.42, 27.13),
    "TR-38": ("Kayseri", 38.73, 35.48),
    "TR-25": ("Erzurum", 39.91, 41.28),
    # ── Iran provinces ──
    "IR-23": ("Isfahan", 32.65, 51.68),
    "IR-08": ("Tehran", 35.69, 51.39),
    "IR-10": ("Khorasan Razavi", 36.30, 59.60),
    "IR-07": ("Hormozgan", 27.18, 56.27),
    "IR-04": ("East Azerbaijan", 38.08, 46.30),
    "IR-06": ("Khuzestan", 31.32, 48.67),
    # ── Indonesia provinces ──
    "ID-SS": ("South Sumatra", -3.32, 104.91),
    "ID-LA": ("Lampung", -5.45, 105.26),
    "ID-JK": ("Jakarta", -6.17, 106.85),
    "ID-JB": ("West Java", -6.92, 107.61),
    "ID-JT": ("Central Java", -7.15, 110.14),
    "ID-JI": ("East Java", -7.54, 112.24),
    # ── South Korea ──
    "KR-11": ("Seoul", 37.57, 126.98),
    "KR-26": ("Busan", 35.18, 129.08),
    "KR-28": ("Incheon", 37.46, 126.71),
    "KR-27": ("Ulsan", 35.54, 129.31),
    "KR-30": ("Daejeon", 36.35, 127.38),
    # ── Japan ──
    "JP-13": ("Tokyo", 35.68, 139.69),
    "JP-01": ("Hokkaido", 43.06, 141.35),
    "JP-27": ("Osaka", 34.69, 135.50),
    "JP-40": ("Fukuoka", 33.59, 130.40),
    "JP-23": ("Aichi/Nagoya", 35.18, 136.91),
    # ── Argentina provinces ──
    "AR-B": ("Buenos Aires Prov", -34.61, -58.38),
    "AR-C": ("Buenos Aires City", -34.60, -58.38),
    "AR-X": ("Córdoba", -31.42, -64.18),
    "AR-S": ("Santa Fe", -31.63, -60.70),
    "AR-T": ("Tucumán", -26.81, -65.22),
    "AR-E": ("Entre Ríos", -31.74, -60.52),
    # ── Chile regions ──
    "CL-AN": ("Antofagasta", -23.65, -70.40),
    "CL-AT": ("Atacama", -27.37, -70.33),
    "CL-TA": ("Tarapacá", -20.21, -69.33),
    "CL-RM": ("Santiago", -33.45, -70.67),
    "CL-VS": ("Valparaíso", -33.05, -71.62),
    # ── Egypt ──
    "EG-C": ("Cairo", 30.04, 31.24),
    "EG-ALX": ("Alexandria", 31.20, 29.92),
    "EG-SUZ": ("Suez", 29.97, 32.54),
    "EG-ASN": ("Aswan", 24.09, 32.90),
    # ── Uzbekistan ──
    "UZ-TK": ("Tashkent", 41.30, 69.28),
    "UZ-AN": ("Andijan", 40.78, 72.34),
    "UZ-BU": ("Bukhara", 39.77, 64.42),
    "UZ-SA": ("Samarkand", 39.65, 66.96),
    "UZ-NW": ("Navoi", 40.10, 65.38),
    # ── Peru ──
    "PE-JUN": ("Junín", -11.16, -75.99),
    "PE-LIM": ("Lima", -12.05, -77.04),
    "PE-TAC": ("Tacna", -17.60, -70.25),
    "PE-ARE": ("Arequipa", -16.41, -71.54),
    # ── Nigeria ──
    "NG-LA": ("Lagos", 6.52, 3.38),
    "NG-OG": ("Ogun", 7.00, 3.35),
    "NG-KW": ("Kwara", 8.49, 4.54),
    "NG-FC": ("Abuja FCT", 9.06, 7.49),
    "NG-KN": ("Kano", 12.00, 8.52),
    # ── Tunisia ──
    "TN-12": ("Gafsa", 34.42, 8.78),
    "TN-23": ("Sfax", 34.74, 10.76),
    "TN-11": ("Tunis", 36.81, 10.18),
    "TN-51": ("Sousse", 35.83, 10.61),
    # ── Mongolia ──
    "MN-1": ("Darkhan", 49.47, 106.00),
    "MN-UB": ("Ulaanbaatar", 47.92, 106.91),
    "MN-047": ("Erdenet", 49.07, 104.15),
    # ── Pakistan ──
    "PK-PB": ("Punjab", 31.15, 72.69),
    "PK-SD": ("Sindh", 25.38, 68.37),
    "PK-KP": ("Khyber Pakhtunkhwa", 34.17, 71.84),
    "PK-BA": ("Balochistan", 30.12, 67.01),
    # ── Bangladesh ──
    "BD-C": ("Chittagong", 22.34, 91.83),
    "BD-E": ("Dhaka", 23.81, 90.41),
    "BD-D": ("Rangpur", 25.75, 89.25),
    "BD-G": ("Sylhet", 24.90, 91.87),
    "BD-A": ("Barisal", 22.70, 90.37),
    # ── Thailand ──
    "TH-10": ("Bangkok", 13.76, 100.50),
    "TH-70": ("Ratchaburi", 13.54, 99.81),
    "TH-20": ("Nakhon Ratchasima", 14.97, 102.10),
    "TH-40": ("Khon Kaen", 16.43, 102.83),
    "TH-90": ("Songkhla", 7.19, 100.60),
    "TH-50": ("Chiang Mai", 18.79, 98.98),
    # ── Vietnam ──
    "VN-HN": ("Hanoi", 21.03, 105.85),
    "VN-SG": ("Ho Chi Minh City", 10.82, 106.63),
    "VN-HP": ("Hai Phong", 20.86, 106.68),
    "VN-QN": ("Quang Ninh", 21.25, 107.00),
    "VN-DN": ("Da Nang", 16.07, 108.22),
    # ── Myanmar ──
    "MM-06": ("Yangon", 16.87, 96.15),
    "MM-07": ("Mandalay", 21.97, 96.08),
    "MM-12": ("Bago", 17.34, 96.48),
    "MM-17": ("Shan State", 20.79, 97.04),
    # ── North Korea ──
    "KP-01": ("Pyongyang", 39.03, 125.75),
    "KP-06": ("South Hamgyong", 40.81, 128.17),
    "KP-07": ("Kangwon", 38.84, 127.56),
    "KP-04": ("South Pyongan", 39.24, 125.95),
    # ── Namibia ──
    "NA-KU": ("Kunene", -19.19, 15.93),
    "NA-ER": ("Erongo", -22.56, 14.53),
    "NA-KH": ("Khomas", -22.57, 17.08),
    # ── Ghana ──
    "GH-WP": ("Western", 5.55, -1.98),
    "GH-CP": ("Central", 5.93, -1.03),
    "GH-AA": ("Greater Accra", 5.61, -0.19),
    # ── Cameroon ──
    "CM-LT": ("Littoral", 4.05, 9.70),
    "CM-CE": ("Centre", 3.87, 11.52),
    "CM-OU": ("West", 5.49, 10.15),
    "CM-AD": ("Adamawa", 7.39, 13.57),
    # ── Senegal ──
    "SN-DK": ("Dakar", 14.72, -17.47),
    "SN-TH": ("Thiès", 14.79, -16.93),
    "SN-KD": ("Kaolack", 14.15, -16.07),
    # ── Jordan ──
    "JO-MA": ("Ma'an", 30.20, 35.73),
    "JO-AQ": ("Aqaba", 29.53, 35.01),
    # ── Cuba ──
    "CU-03": ("Havana", 23.05, -82.35),
    "CU-07": ("Camagüey", 21.38, -77.92),
    "CU-13": ("Santiago de Cuba", 20.02, -75.83),
    # ── Taiwan ──
    "TW-TPE": ("Taipei", 25.03, 121.57),
    "TW-KHH": ("Kaohsiung", 22.62, 120.31),
    "TW-TXG": ("Taichung", 24.15, 120.67),
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
        # East Asia
        "JPN", "KOR", "PRK", "IDN", "TWN",
    }

    # Regex for sub-national codes belonging to each region (PostgreSQL ~ operator)
    _ASIA_SUB_RE = r"^(CN|IN|RU|KZ|MN|UZ|PK|BD|IR|VN|TH|MM|KP|JP|KR|ID|TW)-"
    _US_SUB_RE = r"^(US|CA|MX)-"

    def _region_filter(region_key: str):
        """Return a SQLAlchemy filter for the given region key.
        
        Asia region includes any flow where EITHER origin or destination is
        an Asia ISO or has an Asia sub-national prefix.
        """
        if region_key == "us":
            return (
                RailFreight.origin_iso.op("~")(_US_SUB_RE)
                | (RailFreight.origin_iso == "CA")
                | (RailFreight.origin_iso == "MX")
            )
        elif region_key == "asia":
            return (
                RailFreight.origin_iso.in_(ASIA_ISOS)
                | RailFreight.destination_iso.in_(ASIA_ISOS)
                | RailFreight.origin_iso.op("~")(_ASIA_SUB_RE)
                | RailFreight.destination_iso.op("~")(_ASIA_SUB_RE)
            )
        else:  # eu — exclude US/CA/MX and exclude any flow touching Asia
            return (
                ~RailFreight.origin_iso.op("~")(_US_SUB_RE)
                & (RailFreight.origin_iso != "CA")
                & (RailFreight.origin_iso != "MX")
                & ~RailFreight.origin_iso.in_(ASIA_ISOS)
                & ~RailFreight.destination_iso.in_(ASIA_ISOS)
                & ~RailFreight.origin_iso.op("~")(_ASIA_SUB_RE)
                & ~RailFreight.destination_iso.op("~")(_ASIA_SUB_RE)
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
        if f.origin_iso in US_STATE_INFO or f.destination_iso in US_STATE_INFO:
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

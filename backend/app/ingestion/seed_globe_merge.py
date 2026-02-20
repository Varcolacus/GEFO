"""
Phase 11: Merge globe project data into GEFO.
Enriches countries with capitals, flags, income groups, economic group memberships.
Seeds national data source registry.
Imports 5 pre-built trade-data JSON files into trade_flows.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from app.core.database import SessionLocal
from app.models.country import Country
from app.models.data_source import (
    NationalDataSource, EconomicGroup, CountryGroupMembership, DataProvenance
)
from app.models.trade_flow import TradeFlow

# ────────────────────────────────────────────
#  ISO-2 → ISO-3 mapping  (globe uses 2-letter, GEFO uses 3-letter)
# ────────────────────────────────────────────
ISO2_TO_ISO3 = {
    "AF": "AFG", "AL": "ALB", "DZ": "DZA", "AD": "AND", "AO": "AGO",
    "AG": "ATG", "AR": "ARG", "AM": "ARM", "AU": "AUS", "AT": "AUT",
    "AZ": "AZE", "BS": "BHS", "BH": "BHR", "BD": "BGD", "BB": "BRB",
    "BY": "BLR", "BE": "BEL", "BZ": "BLZ", "BJ": "BEN", "BT": "BTN",
    "BO": "BOL", "BA": "BIH", "BW": "BWA", "BR": "BRA", "BN": "BRN",
    "BG": "BGR", "BF": "BFA", "BI": "BDI", "KH": "KHM", "CM": "CMR",
    "CA": "CAN", "CV": "CPV", "CF": "CAF", "TD": "TCD", "CL": "CHL",
    "CN": "CHN", "CO": "COL", "KM": "COM", "CG": "COG", "CD": "COD",
    "CR": "CRI", "CI": "CIV", "HR": "HRV", "CU": "CUB", "CY": "CYP",
    "CZ": "CZE", "DK": "DNK", "DJ": "DJI", "DM": "DMA", "DO": "DOM",
    "EC": "ECU", "EG": "EGY", "SV": "SLV", "GQ": "GNQ", "ER": "ERI",
    "EE": "EST", "SZ": "SWZ", "ET": "ETH", "FJ": "FJI", "FI": "FIN",
    "FR": "FRA", "GA": "GAB", "GM": "GMB", "GE": "GEO", "DE": "DEU",
    "GH": "GHA", "GR": "GRC", "GD": "GRD", "GT": "GTM", "GN": "GIN",
    "GW": "GNB", "GY": "GUY", "HT": "HTI", "HN": "HND", "HU": "HUN",
    "IS": "ISL", "IN": "IND", "ID": "IDN", "IR": "IRN", "IQ": "IRQ",
    "IE": "IRL", "IL": "ISR", "IT": "ITA", "JM": "JAM", "JP": "JPN",
    "JO": "JOR", "KZ": "KAZ", "KE": "KEN", "KI": "KIR", "KP": "PRK",
    "KR": "KOR", "KW": "KWT", "KG": "KGZ", "LA": "LAO", "LV": "LVA",
    "LB": "LBN", "LS": "LSO", "LR": "LBR", "LY": "LBY", "LI": "LIE",
    "LT": "LTU", "LU": "LUX", "MG": "MDG", "MW": "MWI", "MY": "MYS",
    "MV": "MDV", "ML": "MLI", "MT": "MLT", "MH": "MHL", "MR": "MRT",
    "MU": "MUS", "MX": "MEX", "FM": "FSM", "MD": "MDA", "MC": "MCO",
    "MN": "MNG", "ME": "MNE", "MA": "MAR", "MZ": "MOZ", "MM": "MMR",
    "NA": "NAM", "NR": "NRU", "NP": "NPL", "NL": "NLD", "NZ": "NZL",
    "NI": "NIC", "NE": "NER", "NG": "NGA", "MK": "MKD", "NO": "NOR",
    "OM": "OMN", "PK": "PAK", "PW": "PLW", "PA": "PAN", "PG": "PNG",
    "PY": "PRY", "PE": "PER", "PH": "PHL", "PL": "POL", "PT": "PRT",
    "QA": "QAT", "RO": "ROU", "RU": "RUS", "RW": "RWA", "KN": "KNA",
    "LC": "LCA", "VC": "VCT", "WS": "WSM", "SM": "SMR", "ST": "STP",
    "SA": "SAU", "SN": "SEN", "RS": "SRB", "SC": "SYC", "SL": "SLE",
    "SG": "SGP", "SK": "SVK", "SI": "SVN", "SB": "SLB", "SO": "SOM",
    "ZA": "ZAF", "SS": "SSD", "ES": "ESP", "LK": "LKA", "SD": "SDN",
    "SR": "SUR", "SE": "SWE", "CH": "CHE", "SY": "SYR", "TW": "TWN",
    "TJ": "TJK", "TZ": "TZA", "TH": "THA", "TL": "TLS", "TG": "TGO",
    "TO": "TON", "TT": "TTO", "TN": "TUN", "TR": "TUR", "TM": "TKM",
    "TV": "TUV", "UG": "UGA", "UA": "UKR", "AE": "ARE", "GB": "GBR",
    "US": "USA", "UY": "URY", "UZ": "UZB", "VU": "VUT", "VA": "VAT",
    "VE": "VEN", "VN": "VNM", "YE": "YEM", "ZM": "ZMB", "ZW": "ZWE",
    "XK": "XKX", "PS": "PSE", "CW": "CUW",
    # Additional codes found in trade data JSONs
    "HK": "HKG", "TW": "TWN", "SG": "SGP", "MY": "MYS",
    "TH": "THA", "AE": "ARE", "TR": "TUR", "IL": "ISR",
    "RO": "ROU", "BG": "BGR", "HR": "HRV", "LT": "LTU",
    "LV": "LVA", "EE": "EST", "CY": "CYP", "MT": "MLT",
    "NG": "NGA", "KE": "KEN", "ET": "ETH", "GH": "GHA",
    "XX": None, "XS": None, "EU": None, "WL": None,
}

ISO3_TO_ISO2 = {v: k for k, v in ISO2_TO_ISO3.items() if v}

# ────────────────────────────────────────────
# Globe country data → enrichment
# French name → (ISO2, flag, capital_EN, lat, lon, region_EN)
# ────────────────────────────────────────────

# Region French → English
REGION_MAP = {"Europe": "Europe", "Asie": "Asia", "Afrique": "Africa",
              "Amériques": "Americas", "Océanie": "Oceania"}

GLOBE_COUNTRIES = [
    ("FR", "🇫🇷", "Paris", 46.2276, 2.2137, "Europe"),
    ("AF", "🇦🇫", "Kabul", 33.9391, 67.7100, "Asia"),
    ("AL", "🇦🇱", "Tirana", 41.1533, 20.1683, "Europe"),
    ("DZ", "🇩🇿", "Algiers", 28.0339, 1.6596, "Africa"),
    ("AD", "🇦🇩", "Andorra la Vella", 42.5063, 1.5218, "Europe"),
    ("AO", "🇦🇴", "Luanda", -11.2027, 17.8739, "Africa"),
    ("AR", "🇦🇷", "Buenos Aires", -38.4161, -63.6167, "Americas"),
    ("AM", "🇦🇲", "Yerevan", 40.0691, 45.0382, "Asia"),
    ("AU", "🇦🇺", "Canberra", -25.2744, 133.7751, "Oceania"),
    ("AT", "🇦🇹", "Vienna", 47.5162, 14.5501, "Europe"),
    ("AZ", "🇦🇿", "Baku", 40.1431, 47.5769, "Asia"),
    ("BS", "🇧🇸", "Nassau", 25.0343, -77.3963, "Americas"),
    ("BH", "🇧🇭", "Manama", 26.0667, 50.5577, "Asia"),
    ("BD", "🇧🇩", "Dhaka", 23.6850, 90.3563, "Asia"),
    ("BB", "🇧🇧", "Bridgetown", 13.1939, -59.5432, "Americas"),
    ("BY", "🇧🇾", "Minsk", 53.7098, 27.9534, "Europe"),
    ("BE", "🇧🇪", "Brussels", 50.5039, 4.4699, "Europe"),
    ("BZ", "🇧🇿", "Belmopan", 17.1899, -88.4976, "Americas"),
    ("BJ", "🇧🇯", "Porto-Novo", 9.3077, 2.3158, "Africa"),
    ("BT", "🇧🇹", "Thimphu", 27.5142, 90.4336, "Asia"),
    ("BO", "🇧🇴", "La Paz", -16.2902, -63.5887, "Americas"),
    ("BA", "🇧🇦", "Sarajevo", 43.9159, 17.6791, "Europe"),
    ("BW", "🇧🇼", "Gaborone", -22.3285, 24.6849, "Africa"),
    ("BR", "🇧🇷", "Brasília", -14.2350, -51.9253, "Americas"),
    ("BN", "🇧🇳", "Bandar Seri Begawan", 4.5353, 114.7277, "Asia"),
    ("BG", "🇧🇬", "Sofia", 42.7339, 25.4858, "Europe"),
    ("BF", "🇧🇫", "Ouagadougou", 12.2383, -1.5616, "Africa"),
    ("BI", "🇧🇮", "Gitega", -3.3731, 29.9189, "Africa"),
    ("KH", "🇰🇭", "Phnom Penh", 11.5564, 104.9282, "Asia"),
    ("CM", "🇨🇲", "Yaoundé", 3.8480, 11.5021, "Africa"),
    ("CA", "🇨🇦", "Ottawa", 56.1304, -106.3468, "Americas"),
    ("CV", "🇨🇻", "Praia", 14.9333, -23.5133, "Africa"),
    ("CF", "🇨🇫", "Bangui", 4.3947, 18.5582, "Africa"),
    ("TD", "🇹🇩", "N'Djamena", 12.1348, 15.0557, "Africa"),
    ("CL", "🇨🇱", "Santiago", -33.4489, -70.6693, "Americas"),
    ("CN", "🇨🇳", "Beijing", 35.8617, 104.1954, "Asia"),
    ("CO", "🇨🇴", "Bogotá", 4.7110, -74.0721, "Americas"),
    ("KM", "🇰🇲", "Moroni", -11.7022, 43.2551, "Africa"),
    ("CG", "🇨🇬", "Brazzaville", -4.3217, 15.3125, "Africa"),
    ("CD", "🇨🇩", "Kinshasa", -4.0383, 21.7587, "Africa"),
    ("CR", "🇨🇷", "San José", 9.9281, -84.0907, "Americas"),
    ("HR", "🇭🇷", "Zagreb", 45.8150, 15.9819, "Europe"),
    ("CU", "🇨🇺", "Havana", 23.1136, -82.3666, "Americas"),
    ("CY", "🇨🇾", "Nicosia", 35.1264, 33.4299, "Europe"),
    ("CZ", "🇨🇿", "Prague", 50.0755, 14.4378, "Europe"),
    ("DK", "🇩🇰", "Copenhagen", 55.6761, 12.5683, "Europe"),
    ("DJ", "🇩🇯", "Djibouti", 11.5721, 43.1456, "Africa"),
    ("DM", "🇩🇲", "Roseau", 15.3000, -61.3833, "Americas"),
    ("DO", "🇩🇴", "Santo Domingo", 18.4861, -69.9312, "Americas"),
    ("EC", "🇪🇨", "Quito", -0.1807, -78.4678, "Americas"),
    ("EG", "🇪🇬", "Cairo", 30.0444, 31.2357, "Africa"),
    ("SV", "🇸🇻", "San Salvador", 13.6929, -89.2182, "Americas"),
    ("GQ", "🇬🇶", "Malabo", 3.7504, 8.7371, "Africa"),
    ("ER", "🇪🇷", "Asmara", 15.3229, 38.9251, "Africa"),
    ("EE", "🇪🇪", "Tallinn", 59.4370, 24.7536, "Europe"),
    ("SZ", "🇸🇿", "Mbabane", -26.3054, 31.1367, "Africa"),
    ("ET", "🇪🇹", "Addis Ababa", 9.0320, 38.7469, "Africa"),
    ("FJ", "🇫🇯", "Suva", -18.1416, 178.4419, "Oceania"),
    ("FI", "🇫🇮", "Helsinki", 60.1695, 24.9354, "Europe"),
    ("GA", "🇬🇦", "Libreville", 0.3901, 9.4544, "Africa"),
    ("GM", "🇬🇲", "Banjul", 13.4549, -16.5790, "Africa"),
    ("GE", "🇬🇪", "Tbilisi", 41.7151, 44.8271, "Asia"),
    ("DE", "🇩🇪", "Berlin", 51.1657, 10.4515, "Europe"),
    ("GH", "🇬🇭", "Accra", 5.6037, -0.1870, "Africa"),
    ("GR", "🇬🇷", "Athens", 37.9838, 23.7275, "Europe"),
    ("GD", "🇬🇩", "St. George's", 12.0561, -61.7488, "Americas"),
    ("GT", "🇬🇹", "Guatemala City", 14.6349, -90.5069, "Americas"),
    ("GN", "🇬🇳", "Conakry", 9.5092, -13.7122, "Africa"),
    ("GW", "🇬🇼", "Bissau", 11.8037, -15.1804, "Africa"),
    ("GY", "🇬🇾", "Georgetown", 6.8013, -58.1551, "Americas"),
    ("HT", "🇭🇹", "Port-au-Prince", 18.5944, -72.3074, "Americas"),
    ("HN", "🇭🇳", "Tegucigalpa", 14.0723, -87.1921, "Americas"),
    ("HU", "🇭🇺", "Budapest", 47.4979, 19.0402, "Europe"),
    ("IS", "🇮🇸", "Reykjavik", 64.1466, -21.9426, "Europe"),
    ("IN", "🇮🇳", "New Delhi", 20.5937, 78.9629, "Asia"),
    ("ID", "🇮🇩", "Jakarta", -6.2088, 106.8456, "Asia"),
    ("IR", "🇮🇷", "Tehran", 35.6892, 51.3890, "Asia"),
    ("IQ", "🇮🇶", "Baghdad", 33.3128, 44.3615, "Asia"),
    ("IE", "🇮🇪", "Dublin", 53.3498, -6.2603, "Europe"),
    ("IL", "🇮🇱", "Jerusalem", 31.7683, 35.2137, "Asia"),
    ("IT", "🇮🇹", "Rome", 41.8719, 12.5674, "Europe"),
    ("CI", "🇨🇮", "Yamoussoukro", 6.9271, -1.2350, "Africa"),
    ("JM", "🇯🇲", "Kingston", 18.0179, -76.8099, "Americas"),
    ("JP", "🇯🇵", "Tokyo", 36.2048, 138.2529, "Asia"),
    ("JO", "🇯🇴", "Amman", 31.9454, 35.9284, "Asia"),
    ("KZ", "🇰🇿", "Astana", 51.1694, 71.4491, "Asia"),
    ("KE", "🇰🇪", "Nairobi", -1.2921, 36.8219, "Africa"),
    ("KI", "🇰🇮", "South Tarawa", 1.3397, 103.7450, "Oceania"),
    ("KG", "🇰🇬", "Bishkek", 42.8746, 74.5698, "Asia"),
    ("KW", "🇰🇼", "Kuwait City", 29.3759, 47.9774, "Asia"),
    ("LA", "🇱🇦", "Vientiane", 17.9750, 102.6331, "Asia"),
    ("LV", "🇱🇻", "Riga", 56.9496, 24.1052, "Europe"),
    ("LB", "🇱🇧", "Beirut", 33.8886, 35.4955, "Asia"),
    ("LS", "🇱🇸", "Maseru", -29.3167, 27.4833, "Africa"),
    ("LR", "🇱🇷", "Monrovia", 6.3156, -10.8074, "Africa"),
    ("LY", "🇱🇾", "Tripoli", 32.8872, 13.1913, "Africa"),
    ("LI", "🇱🇮", "Vaduz", 47.1410, 9.5209, "Europe"),
    ("LT", "🇱🇹", "Vilnius", 54.6872, 25.2797, "Europe"),
    ("LU", "🇱🇺", "Luxembourg", 49.6116, 6.1319, "Europe"),
    ("MG", "🇲🇬", "Antananarivo", -18.8792, 47.5079, "Africa"),
    ("MW", "🇲🇼", "Lilongwe", -13.9626, 33.7741, "Africa"),
    ("MY", "🇲🇾", "Kuala Lumpur", 3.1390, 101.6869, "Asia"),
    ("MV", "🇲🇻", "Malé", 4.1755, 73.5093, "Asia"),
    ("ML", "🇲🇱", "Bamako", 12.6392, -8.0029, "Africa"),
    ("MT", "🇲🇹", "Valletta", 35.8989, 14.5146, "Europe"),
    ("MH", "🇲🇭", "Majuro", 7.1315, 171.1845, "Oceania"),
    ("MR", "🇲🇷", "Nouakchott", 18.0735, -15.9582, "Africa"),
    ("MU", "🇲🇺", "Port Louis", -20.1609, 57.5012, "Africa"),
    ("MX", "🇲🇽", "Mexico City", 19.4326, -99.1332, "Americas"),
    ("FM", "🇫🇲", "Palikir", 6.9271, 158.1610, "Oceania"),
    ("MD", "🇲🇩", "Chișinău", 47.0105, 28.8638, "Europe"),
    ("MC", "🇲🇨", "Monaco", 43.7384, 7.4246, "Europe"),
    ("MN", "🇲🇳", "Ulaanbaatar", 47.8864, 106.9057, "Asia"),
    ("ME", "🇲🇪", "Podgorica", 42.4304, 19.2594, "Europe"),
    ("MA", "🇲🇦", "Rabat", 33.9716, -6.8498, "Africa"),
    ("MZ", "🇲🇿", "Maputo", -25.9655, 32.5832, "Africa"),
    ("MM", "🇲🇲", "Naypyidaw", 19.7633, 96.0785, "Asia"),
    ("NA", "🇳🇦", "Windhoek", -22.5609, 17.0658, "Africa"),
    ("NR", "🇳🇷", "Yaren", -0.5477, 166.9209, "Oceania"),
    ("NP", "🇳🇵", "Kathmandu", 27.7172, 85.3240, "Asia"),
    ("NL", "🇳🇱", "Amsterdam", 52.3676, 4.9041, "Europe"),
    ("NZ", "🇳🇿", "Wellington", -41.2865, 174.7762, "Oceania"),
    ("NI", "🇳🇮", "Managua", 12.1150, -86.2362, "Americas"),
    ("NE", "🇳🇪", "Niamey", 13.5127, 2.1128, "Africa"),
    ("NG", "🇳🇬", "Abuja", 9.0765, 7.3986, "Africa"),
    ("MK", "🇲🇰", "Skopje", 40.7295, 74.0134, "Europe"),
    ("KP", "🇰🇵", "Pyongyang", 39.0392, 125.7625, "Asia"),
    ("NO", "🇳🇴", "Oslo", 59.9139, 10.7522, "Europe"),
    ("OM", "🇴🇲", "Muscat", 23.6100, 58.5400, "Asia"),
    ("PK", "🇵🇰", "Islamabad", 33.6844, 73.0479, "Asia"),
    ("PW", "🇵🇼", "Ngerulmud", 7.3419, 134.4789, "Oceania"),
    ("PA", "🇵🇦", "Panama City", 9.1021, -79.4028, "Americas"),
    ("PG", "🇵🇬", "Port Moresby", -9.4438, 147.1803, "Oceania"),
    ("PY", "🇵🇾", "Asunción", -25.2637, -57.5759, "Americas"),
    ("PE", "🇵🇪", "Lima", -12.0464, -77.0428, "Americas"),
    ("PH", "🇵🇭", "Manila", 14.5995, 120.9842, "Asia"),
    ("PL", "🇵🇱", "Warsaw", 52.2297, 21.0122, "Europe"),
    ("PT", "🇵🇹", "Lisbon", 38.7223, -9.1393, "Europe"),
    ("QA", "🇶🇦", "Doha", 25.3548, 51.1839, "Asia"),
    ("RO", "🇷🇴", "Bucharest", 44.4268, 26.1025, "Europe"),
    ("RU", "🇷🇺", "Moscow", 61.5240, 105.3188, "Europe"),
    ("RW", "🇷🇼", "Kigali", -1.9403, 29.8739, "Africa"),
    ("KN", "🇰🇳", "Basseterre", 17.3578, -62.7830, "Americas"),
    ("LC", "🇱🇨", "Castries", 13.9094, -60.9789, "Americas"),
    ("VC", "🇻🇨", "Kingstown", 13.1579, -61.2248, "Americas"),
    ("WS", "🇼🇸", "Apia", -13.7590, -172.1046, "Oceania"),
    ("SM", "🇸🇲", "San Marino", 43.9424, 12.4578, "Europe"),
    ("ST", "🇸🇹", "São Tomé", 0.3302, 6.7333, "Africa"),
    ("SA", "🇸🇦", "Riyadh", 24.7136, 46.6753, "Asia"),
    ("SN", "🇸🇳", "Dakar", 14.6928, -17.4467, "Africa"),
    ("RS", "🇷🇸", "Belgrade", 44.7866, 20.4489, "Europe"),
    ("SC", "🇸🇨", "Victoria", -4.6796, 55.4920, "Africa"),
    ("SL", "🇸🇱", "Freetown", 8.4657, -13.2317, "Africa"),
    ("SG", "🇸🇬", "Singapore", 1.3521, 103.8198, "Asia"),
    ("SK", "🇸🇰", "Bratislava", 48.1486, 17.1077, "Europe"),
    ("SI", "🇸🇮", "Ljubljana", 46.0569, 14.5058, "Europe"),
    ("SB", "🇸🇧", "Honiara", -9.6457, 160.1562, "Oceania"),
    ("SO", "🇸🇴", "Mogadishu", 2.0469, 45.3182, "Africa"),
    ("ZA", "🇿🇦", "Pretoria", -25.7479, 28.2293, "Africa"),
    ("KR", "🇰🇷", "Seoul", 37.5665, 126.9780, "Asia"),
    ("SS", "🇸🇸", "Juba", 4.8594, 31.5713, "Africa"),
    ("ES", "🇪🇸", "Madrid", 40.4637, -3.7492, "Europe"),
    ("LK", "🇱🇰", "Sri Jayawardenepura Kotte", 6.9271, 79.8612, "Asia"),
    ("SD", "🇸🇩", "Khartoum", 15.5007, 32.5599, "Africa"),
    ("SR", "🇸🇷", "Paramaribo", 5.8520, -55.2038, "Americas"),
    ("SE", "🇸🇪", "Stockholm", 59.3293, 18.0686, "Europe"),
    ("CH", "🇨🇭", "Bern", 46.9479, 7.4474, "Europe"),
    ("SY", "🇸🇾", "Damascus", 33.5138, 36.2765, "Asia"),
    ("TJ", "🇹🇯", "Dushanbe", 38.5598, 68.7738, "Asia"),
    ("TW", "🇹🇼", "Taipei", 23.6978, 120.9605, "Asia"),
    ("TZ", "🇹🇿", "Dodoma", -6.7924, 39.2083, "Africa"),
    ("TH", "🇹🇭", "Bangkok", 13.7563, 100.5018, "Asia"),
    ("TL", "🇹🇱", "Dili", -8.5569, 125.5603, "Asia"),
    ("TG", "🇹🇬", "Lomé", 6.1256, 1.2226, "Africa"),
    ("TO", "🇹🇴", "Nuku'alofa", -21.1393, -175.2018, "Oceania"),
    ("TT", "🇹🇹", "Port of Spain", 10.6918, -61.2225, "Americas"),
    ("TN", "🇹🇳", "Tunis", 36.8065, 10.1815, "Africa"),
    ("TR", "🇹🇷", "Ankara", 39.9334, 32.8597, "Asia"),
    ("TM", "🇹🇲", "Ashgabat", 37.9601, 58.3261, "Asia"),
    ("TV", "🇹🇻", "Funafuti", -8.5211, 179.1962, "Oceania"),
    ("UG", "🇺🇬", "Kampala", 0.3136, 32.5811, "Africa"),
    ("UA", "🇺🇦", "Kyiv", 50.4501, 30.5234, "Europe"),
    ("AE", "🇦🇪", "Abu Dhabi", 24.4539, 54.3773, "Asia"),
    ("GB", "🇬🇧", "London", 55.3781, -3.4360, "Europe"),
    ("US", "🇺🇸", "Washington D.C.", 37.0902, -95.7129, "Americas"),
    ("UY", "🇺🇾", "Montevideo", -34.9011, -56.1645, "Americas"),
    ("UZ", "🇺🇿", "Tashkent", 41.2995, 69.2401, "Asia"),
    ("VU", "🇻🇺", "Port Vila", -17.7333, 168.3273, "Oceania"),
    ("VA", "🇻🇦", "Vatican City", 41.9029, 12.4534, "Europe"),
    ("VE", "🇻🇪", "Caracas", 10.4806, -66.9036, "Americas"),
    ("VN", "🇻🇳", "Hanoi", 21.0285, 105.8542, "Asia"),
    ("YE", "🇾🇪", "Sana'a", 15.5527, 48.5164, "Asia"),
    ("ZM", "🇿🇲", "Lusaka", -15.4167, 28.2833, "Africa"),
    ("ZW", "🇿🇼", "Harare", -17.8252, 31.0335, "Africa"),
]

# ────────────────────────────────────────────
# Income groups (ISO-3 keys)
# ────────────────────────────────────────────
INCOME_GROUPS = {
    "high": [
        "DEU","AND","SAU","ARG","AUS","AUT","BHS","BHR","BRB","BEL","BRN","CAN",
        "CHL","CYP","KOR","HRV","DNK","ARE","ESP","EST","USA","FIN","FRA","GRC",
        "HUN","IRL","ISL","ISR","ITA","JPN","KWT","LVA","LIE","LTU","LUX","MLT",
        "MCO","NRU","NOR","NZL","OMN","NLD","POL","PRT","QAT","ROU","GBR","KNA",
        "SMR","SYC","SGP","SVK","SVN","SWE","CHE","TWN","CZE","TTO","URY","VAT",
    ],
    "upper_middle": [
        "ZAF","ALB","DZA","ARM","AZE","BLR","BLZ","BIH","BWA","BRA","BGR","CHN",
        "COL","CRI","CUB","DMA","ECU","FJI","GAB","GRD","GTM","GUY","IDN","IRQ",
        "IRN","JAM","JOR","KAZ","LBN","LBY","MKD","MYS","MDV","MUS","MEX","MDA",
        "MNG","MNE","NAM","PLW","PAN","PRY","PER","DOM","RUS","LCA","VCT","WSM",
        "SRB","SUR","THA","TON","TUR","TKM","TUV",
    ],
    "lower_middle": [
        "AGO","BGD","BEN","BTN","BOL","CPV","KHM","CMR","COM","COG","CIV","DJI",
        "EGY","SLV","SWZ","GHA","HND","IND","KGZ","KIR","LAO","LSO","MAR","MRT",
        "FSM","MMR","NPL","NIC","NGA","PAK","PNG","PHL","STP","SEN","SLB","LKA",
        "TZA","TJK","TLS","TUN","UKR","UZB","VUT","VNM","ZMB","ZWE",
    ],
    "low": [
        "AFG","BFA","BDI","CAF","TCD","COD","ERI","ETH","GMB","GIN","GNB","HTI",
        "PRK","LBR","MDG","MWI","MLI","MOZ","NER","RWA","SLE","SOM","SSD","SDN",
        "SYR","TGO","UGA","YEM",
    ],
}

# ────────────────────────────────────────────
# Economic groups (ISO-3 keys)
# ────────────────────────────────────────────
ECONOMIC_GROUPS = {
    "G7": {
        "name": "Group of Seven",
        "category": "political",
        "members": ["DEU", "CAN", "USA", "FRA", "ITA", "JPN", "GBR"],
    },
    "G20": {
        "name": "Group of Twenty",
        "category": "political",
        "members": [
            "ZAF", "DEU", "SAU", "ARG", "AUS", "BRA", "CAN", "CHN", "KOR",
            "USA", "FRA", "IND", "IDN", "ITA", "JPN", "MEX", "GBR", "RUS", "TUR",
        ],
    },
    "BRICS": {
        "name": "BRICS",
        "category": "economic",
        "members": ["ZAF", "BRA", "CHN", "IND", "RUS"],
    },
    "EU": {
        "name": "European Union",
        "category": "political",
        "members": [
            "DEU", "AUT", "BEL", "BGR", "CYP", "HRV", "DNK", "ESP", "EST",
            "FIN", "FRA", "GRC", "HUN", "IRL", "ITA", "LVA", "LTU", "LUX",
            "MLT", "NLD", "POL", "PRT", "ROU", "SVK", "SVN", "SWE", "CZE",
        ],
    },
    "EUROZONE": {
        "name": "Eurozone",
        "category": "economic",
        "members": [
            "DEU", "AUT", "BEL", "BGR", "CYP", "HRV", "ESP", "EST", "FIN",
            "FRA", "GRC", "IRL", "ITA", "LVA", "LTU", "LUX", "MLT", "NLD",
            "PRT", "SVK", "SVN",
        ],
    },
    "OPEC": {
        "name": "Organization of Petroleum Exporting Countries",
        "category": "trade",
        "members": [
            "DZA", "AGO", "SAU", "COG", "ARE", "GAB", "GNQ", "IRN", "IRQ",
            "KWT", "LBY", "NGA", "VEN",
        ],
    },
    "ASEAN": {
        "name": "Association of Southeast Asian Nations",
        "category": "regional",
        "members": ["BRN", "KHM", "IDN", "LAO", "MYS", "MMR", "PHL", "SGP", "THA", "VNM"],
    },
    "GULF": {
        "name": "Gulf Cooperation Council",
        "category": "regional",
        "members": ["SAU", "BHR", "ARE", "KWT", "OMN", "QAT"],
    },
    "MAGHREB": {
        "name": "Arab Maghreb Union",
        "category": "regional",
        "members": ["DZA", "LBY", "MAR", "MRT", "TUN"],
    },
}

# ────────────────────────────────────────────
# National data source registry (ported from national-apis-config.js)
# ────────────────────────────────────────────
DATA_SOURCES = [
    # Premium tier — full bilateral data
    ("DEU", "DE", "Destatis (Statistisches Bundesamt)", "https://www.destatis.de/EN/Themes/Economy/Foreign-Trade/Tables/order-rank-germany-trading-partners-xlsx.xlsx", False, "excellent", "complete", "annual", "xlsx", "premium", "https://www.destatis.de/EN/Themes/Economy/Foreign-Trade/_node.html"),
    ("FRA", "FR", "Banque de France", "https://webstat.banque-france.fr/api/v1", True, "excellent", "complete", "monthly", "sdmx", "premium", "https://www.banque-france.fr/statistiques"),
    ("NOR", "NO", "Statistics Norway (SSB)", "https://data.ssb.no/api/v0", False, "excellent", "complete", "monthly", "pxweb", "premium", "https://www.ssb.no/en/api"),
    ("USA", "US", "US Census Bureau", "https://api.census.gov/data/timeseries/intltrade", True, "excellent", "complete", "monthly", "json", "premium", "https://www.census.gov/data/developers/data-sets/international-trade.html"),
    ("CAN", "CA", "Statistics Canada (StatCan)", "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1210017101", False, "excellent", "complete", "annual", "json", "premium", "https://www.statcan.gc.ca/en/developers"),
    ("JPN", "JP", "e-Stat / Ministry of Finance", "https://www.stat.go.jp/english/data/trade-st/index.html", False, "excellent", "complete", "monthly", "json", "premium", "https://www.stat.go.jp/english/data/trade-st/index.html"),
    ("SWE", "SE", "Statistics Sweden (SCB)", "https://api.scb.se/OV0104/v1/doris", False, "excellent", "complete", "monthly", "pxweb", "premium", "https://www.scb.se/en/services/open-data-api/"),
    ("GBR", "GB", "Office for National Statistics (ONS)", "https://api.ons.gov.uk", False, "excellent", "complete", "monthly", "json", "premium", "https://developer.ons.gov.uk/"),
    ("ITA", "IT", "ISTAT / Banca d'Italia", "https://www.istat.it", False, "excellent", "complete", "monthly", "json", "premium", "https://www.istat.it/"),
    ("ESP", "ES", "Banco de España / INE", "https://www.bde.es/", False, "excellent", "complete", "monthly", "json", "premium", "https://www.bde.es/"),
    ("MEX", "MX", "Banco de México (SIE)", "https://www.banxico.org.mx/SieAPIRest/service/v1/", True, "excellent", "complete", "monthly", "json", "premium", "https://www.banxico.org.mx/SieInternet/"),
    ("SVN", "SI", "SURS (SiStat)", "https://pxweb.stat.si/SiStatData/api/v1/en/Data/", False, "excellent", "complete", "annual", "pxweb", "premium", "https://www.stat.si/en"),
    ("HRV", "HR", "DZS (Croatian Bureau of Statistics)", "https://web.dzs.hr/PXWeb/api/v1/en/", False, "excellent", "complete", "annual", "pxweb", "premium", "https://www.dzs.hr/"),
    ("IDN", "ID", "BPS (Badan Pusat Statistik)", "https://webapi.bps.go.id/v1/api/", True, "excellent", "complete", "monthly", "json", "premium", "https://webapi.bps.go.id/"),
    ("IND", "IN", "DGCI&S (EIDB Tradestat)", "https://tradestat.commerce.gov.in/", False, "excellent", "complete", "annual", "html_scrape", "premium", "https://tradestat.commerce.gov.in/"),
    ("KOR", "KR", "Bank of Korea (ECOS)", "https://ecos.bok.or.kr/api/", True, "excellent", "complete", "monthly", "json", "premium", "https://ecos.bok.or.kr/api/"),
    ("FIN", "FI", "Statistics Finland (Uljas Verti)", "https://uljas.tulli.fi/verti-tieto-0/api/dataset", False, "excellent", "complete", "monthly", "json", "premium", "https://uljas.tulli.fi/verti-tieto-0/"),
    ("ROU", "RO", "INSSE", "https://statistici.insse.ro/", False, "excellent", "complete", "annual", "json", "premium", "https://insse.ro/cms/en"),
    ("POL", "PL", "Statistics Poland (GUS) — DBW API", "https://api-dbw.stat.gov.pl/", True, "excellent", "complete", "annual", "json", "premium", "https://stat.gov.pl/en/"),
    ("THA", "TH", "NSO / Bank of Thailand", "https://www.nso.go.th/", True, "excellent", "complete", "monthly", "json", "premium", "https://www.nso.go.th/"),
    ("BRA", "BR", "IBGE — ComexStat / MDIC SECEX", "https://servicodados.ibge.gov.br/api/v1/comex", False, "excellent", "complete", "monthly", "json", "premium", "https://servicodados.ibge.gov.br/api/v1/comex"),
    ("BIH", "BA", "BHAS (Agency for Statistics of BiH)", "https://bhas.gov.ba/", False, "excellent", "complete", "annual", "xlsx", "premium", "https://bhas.gov.ba/"),
    ("SRB", "RS", "SORS (Statistical Office of Serbia)", "https://data.stat.gov.rs/", False, "excellent", "complete", "annual", "json", "premium", "https://data.stat.gov.rs/"),
    ("BHR", "BH", "Bahrain Open Data Portal", "https://data.gov.bh/", False, "excellent", "complete", "annual", "json", "premium", "https://data.gov.bh/"),
    ("CHL", "CL", "Servicio Nacional de Aduanas", "https://www.aduana.cl/", False, "excellent", "complete", "annual", "json", "premium", "https://www.aduana.cl/"),
    ("QAT", "QA", "Qatar PSA", "https://www.psa.gov.qa/", False, "excellent", "complete", "annual", "json", "premium", "https://www.psa.gov.qa/"),
    ("PLW", "PW", "Bureau of Budget and Planning (Palau)", "https://www.palaugov.pw/", False, "good", "partial", "annual", "json", "premium", "https://www.palaugov.pw/"),
    ("KIR", "KI", "KNSO via SPC Pacific Data Hub", "https://stats-nsi-stable.pacificdata.org/", False, "excellent", "complete", "annual", "sdmx", "premium", "https://stats.pacificdata.org/"),
    ("TON", "TO", "Tonga Statistics (SPC)", "https://stats-nsi-stable.pacificdata.org/", False, "excellent", "complete", "annual", "sdmx", "premium", "https://stats.pacificdata.org/"),
    ("TUV", "TV", "Tuvalu Statistics (SPC)", "https://stats-nsi-stable.pacificdata.org/", False, "excellent", "complete", "annual", "sdmx", "premium", "https://stats.pacificdata.org/"),
    ("WSM", "WS", "Samoa Bureau of Statistics (SPC)", "https://stats-nsi-stable.pacificdata.org/", False, "excellent", "complete", "annual", "sdmx", "premium", "https://stats.pacificdata.org/"),
    ("BEL", "BE", "National Bank of Belgium (NBB)", "https://nsidisseminate-stat.nbb.be/rest/data/", False, "excellent", "complete", "annual", "sdmx", "premium", "https://stat.nbb.be/"),
    # Standard tier
    ("CHE", "CH", "Federal Statistical Office (BFS)", "https://www.bfs.admin.ch/", False, "good", "partial", "annual", "xlsx", "standard", "https://www.bfs.admin.ch/"),
    # Limited tier
    ("FJI", "FJ", "SPC Pacific Data Hub / Fiji Bureau", "https://stats-nsi-stable.pacificdata.org/rest/data/SPC,DF_IMTS", False, "excellent", "complete", "annual", "sdmx", "limited", "https://stats.pacificdata.org/"),
]

# ────────────────────────────────────────────
# Trade data JSON files to import
# ────────────────────────────────────────────
TRADE_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "globe-repo")


def enrich_countries(db):
    """Add capitals, flags, iso_code_2, income_group from globe data."""
    updated = 0
    for iso2, flag, capital, lat, lon, region in GLOBE_COUNTRIES:
        iso3 = ISO2_TO_ISO3.get(iso2)
        if not iso3:
            continue
        country = db.query(Country).filter(Country.iso_code == iso3).first()
        if not country:
            continue
        # Enrich with globe data
        if not country.flag_emoji:
            country.flag_emoji = flag
        if not country.capital:
            country.capital = capital
        if not country.iso_code_2:
            country.iso_code_2 = iso2
        # Fill centroid if missing
        if not country.centroid_lat:
            country.centroid_lat = lat
            country.centroid_lon = lon
        updated += 1

    # Set income groups
    for group_name, isos in INCOME_GROUPS.items():
        label = group_name.replace("_", " ").title()
        for iso3 in isos:
            c = db.query(Country).filter(Country.iso_code == iso3).first()
            if c and not c.income_group:
                c.income_group = label

    db.commit()
    print(f"  ✅ Enriched {updated} countries with capitals/flags/iso2")


def seed_economic_groups(db):
    """Seed economic groups and memberships."""
    # Clear existing
    db.query(CountryGroupMembership).delete()
    db.query(EconomicGroup).delete()
    db.commit()

    for code, info in ECONOMIC_GROUPS.items():
        grp = EconomicGroup(
            code=code,
            name=info["name"],
            category=info["category"],
            member_count=len(info["members"]),
        )
        db.add(grp)
    db.commit()

    memberships = 0
    for code, info in ECONOMIC_GROUPS.items():
        for iso3 in info["members"]:
            # Verify country exists
            c = db.query(Country).filter(Country.iso_code == iso3).first()
            if not c:
                continue
            m = CountryGroupMembership(country_iso=iso3, group_code=code)
            db.add(m)
            memberships += 1
    db.commit()
    print(f"  ✅ Seeded {len(ECONOMIC_GROUPS)} economic groups, {memberships} memberships")


def seed_data_sources(db):
    """Seed national data source registry."""
    db.query(NationalDataSource).delete()
    db.commit()

    count = 0
    for row in DATA_SOURCES:
        iso3, iso2, institution, url, auth, quality, coverage, freq, fmt, tier, docs = row
        # Verify country exists
        c = db.query(Country).filter(Country.iso_code == iso3).first()
        if not c:
            print(f"  ⚠️ Skipping data source for {iso3} — country not in DB")
            continue
        ds = NationalDataSource(
            country_iso=iso3,
            iso2=iso2,
            institution=institution,
            api_url=url,
            docs_url=docs,
            auth_required=auth,
            quality=quality,
            coverage=coverage,
            update_frequency=freq,
            data_format=fmt,
            tier=tier,
            is_active=True,
        )
        db.add(ds)
        count += 1
    db.commit()
    print(f"  ✅ Seeded {count} national data sources")


def import_trade_data_jsons(db):
    """Import the 5 pre-built trade-data JSON files from globe project."""
    json_files = [
        "belgium-trade-data.json",
        "brazil-trade-data.json",
        "canada-trade-data.json",
        "germany-trade-data.json",
        "luxembourg-trade-data.json",
    ]

    # Get all known country ISO codes for validation
    known_isos = {c.iso_code for c in db.query(Country.iso_code).all()}

    total_flows = 0
    total_skipped = 0

    for filename in json_files:
        filepath = os.path.join(TRADE_DATA_DIR, filename)
        if not os.path.exists(filepath):
            print(f"  ⚠️ {filename} not found at {filepath}")
            continue

        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)

        reporter_iso2 = data.get("reporterISO", "")
        reporter_iso3 = ISO2_TO_ISO3.get(reporter_iso2)
        year = data.get("year", 2023)
        source = data.get("source", "Unknown")

        if not reporter_iso3 or reporter_iso3 not in known_isos:
            print(f"  ⚠️ Reporter {reporter_iso2} → {reporter_iso3} not in DB, skipping {filename}")
            continue

        partners = data.get("countries", [])
        file_flows = 0
        file_skipped = 0

        for p in partners:
            partner_iso2 = p.get("partnerISO", "")
            partner_iso3 = ISO2_TO_ISO3.get(partner_iso2)

            if not partner_iso3 or partner_iso3 not in known_isos:
                file_skipped += 1
                continue

            exports_val = p.get("exports", 0)
            imports_val = p.get("imports", 0)

            # Skip zero-value flows
            if exports_val <= 0 and imports_val <= 0:
                file_skipped += 1
                continue

            # Convert from millions USD to USD
            exports_usd = exports_val * 1_000_000
            imports_usd = imports_val * 1_000_000

            # Check for existing flow to avoid duplicates
            existing = db.query(TradeFlow).filter(
                TradeFlow.exporter_iso == reporter_iso3,
                TradeFlow.importer_iso == partner_iso3,
                TradeFlow.year == year,
                TradeFlow.flow_type == "export",
                TradeFlow.commodity_code == None,
            ).first()

            if existing:
                file_skipped += 1
                continue

            # Export flow: reporter → partner
            if exports_usd > 0:
                db.add(TradeFlow(
                    exporter_iso=reporter_iso3,
                    importer_iso=partner_iso3,
                    year=year,
                    trade_value_usd=exports_usd,
                    flow_type="export",
                ))
                file_flows += 1

            # Import flow: partner → reporter
            if imports_usd > 0:
                db.add(TradeFlow(
                    exporter_iso=partner_iso3,
                    importer_iso=reporter_iso3,
                    year=year,
                    trade_value_usd=imports_usd,
                    flow_type="export",
                ))
                file_flows += 1

        db.commit()
        total_flows += file_flows
        total_skipped += file_skipped
        print(f"  📊 {filename}: {file_flows} flows imported, {file_skipped} skipped "
              f"({reporter_iso2}→{reporter_iso3}, year={year}, source: {source})")

    print(f"  ✅ Total: {total_flows} trade flows imported from {len(json_files)} files "
          f"({total_skipped} skipped)")


def seed_globe_merge():
    """Main entry point: merge globe project data into GEFO."""
    db = SessionLocal()
    try:
        print("=" * 60)
        print("Phase 11: Merging globe project into GEFO")
        print("=" * 60)

        print("\n1. Enriching countries with capitals, flags, ISO-2...")
        enrich_countries(db)

        print("\n2. Seeding economic groups (G7, G20, BRICS, EU, etc.)...")
        seed_economic_groups(db)

        print("\n3. Seeding national data source registry...")
        seed_data_sources(db)

        print("\n4. Importing trade data from globe JSON files...")
        import_trade_data_jsons(db)

        print("\n" + "=" * 60)
        print("✅ Globe merge complete!")
        print("=" * 60)
    finally:
        db.close()


if __name__ == "__main__":
    seed_globe_merge()

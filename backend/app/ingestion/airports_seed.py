"""
Seed data for major world airports.
~95 busiest airports from public sources (OurAirports, Wikipedia).
"""
import logging
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.airport import Airport

logger = logging.getLogger(__name__)

AIRPORTS_DATA = [
    # ── North America ──
    {"iata": "ATL", "icao": "KATL", "name": "Hartsfield-Jackson Atlanta Intl", "city": "Atlanta", "country_iso": "USA", "lat": 33.6407, "lon": -84.4277, "elevation_ft": 1026, "airport_type": "large_airport", "pax_annual": 93.7, "runways": 5, "continent": "NA"},
    {"iata": "DFW", "icao": "KDFW", "name": "Dallas/Fort Worth Intl", "city": "Dallas", "country_iso": "USA", "lat": 32.8998, "lon": -97.0403, "elevation_ft": 607, "airport_type": "large_airport", "pax_annual": 73.4, "runways": 7, "continent": "NA"},
    {"iata": "DEN", "icao": "KDEN", "name": "Denver Intl", "city": "Denver", "country_iso": "USA", "lat": 39.8561, "lon": -104.6737, "elevation_ft": 5431, "airport_type": "large_airport", "pax_annual": 69.3, "runways": 6, "continent": "NA"},
    {"iata": "ORD", "icao": "KORD", "name": "O'Hare Intl", "city": "Chicago", "country_iso": "USA", "lat": 41.9742, "lon": -87.9073, "elevation_ft": 672, "airport_type": "large_airport", "pax_annual": 83.2, "runways": 8, "continent": "NA"},
    {"iata": "LAX", "icao": "KLAX", "name": "Los Angeles Intl", "city": "Los Angeles", "country_iso": "USA", "lat": 33.9425, "lon": -118.4081, "elevation_ft": 125, "airport_type": "large_airport", "pax_annual": 88.1, "runways": 4, "continent": "NA"},
    {"iata": "JFK", "icao": "KJFK", "name": "John F. Kennedy Intl", "city": "New York", "country_iso": "USA", "lat": 40.6413, "lon": -73.7781, "elevation_ft": 13, "airport_type": "large_airport", "pax_annual": 62.5, "runways": 4, "continent": "NA"},
    {"iata": "SFO", "icao": "KSFO", "name": "San Francisco Intl", "city": "San Francisco", "country_iso": "USA", "lat": 37.6213, "lon": -122.3790, "elevation_ft": 13, "airport_type": "large_airport", "pax_annual": 57.5, "runways": 4, "continent": "NA"},
    {"iata": "SEA", "icao": "KSEA", "name": "Seattle-Tacoma Intl", "city": "Seattle", "country_iso": "USA", "lat": 47.4502, "lon": -122.3088, "elevation_ft": 433, "airport_type": "large_airport", "pax_annual": 50.6, "runways": 3, "continent": "NA"},
    {"iata": "MIA", "icao": "KMIA", "name": "Miami Intl", "city": "Miami", "country_iso": "USA", "lat": 25.7959, "lon": -80.2870, "elevation_ft": 8, "airport_type": "large_airport", "pax_annual": 52.0, "runways": 4, "continent": "NA"},
    {"iata": "EWR", "icao": "KEWR", "name": "Newark Liberty Intl", "city": "Newark", "country_iso": "USA", "lat": 40.6895, "lon": -74.1745, "elevation_ft": 18, "airport_type": "large_airport", "pax_annual": 46.3, "runways": 3, "continent": "NA"},
    {"iata": "MCO", "icao": "KMCO", "name": "Orlando Intl", "city": "Orlando", "country_iso": "USA", "lat": 28.4312, "lon": -81.3081, "elevation_ft": 96, "airport_type": "large_airport", "pax_annual": 57.8, "runways": 4, "continent": "NA"},
    {"iata": "IAH", "icao": "KIAH", "name": "George Bush Intercontinental", "city": "Houston", "country_iso": "USA", "lat": 29.9902, "lon": -95.3368, "elevation_ft": 97, "airport_type": "large_airport", "pax_annual": 45.3, "runways": 5, "continent": "NA"},
    {"iata": "YYZ", "icao": "CYYZ", "name": "Toronto Pearson Intl", "city": "Toronto", "country_iso": "CAN", "lat": 43.6777, "lon": -79.6248, "elevation_ft": 569, "airport_type": "large_airport", "pax_annual": 50.5, "runways": 5, "continent": "NA"},
    {"iata": "YVR", "icao": "CYVR", "name": "Vancouver Intl", "city": "Vancouver", "country_iso": "CAN", "lat": 49.1947, "lon": -123.1792, "elevation_ft": 14, "airport_type": "large_airport", "pax_annual": 26.4, "runways": 3, "continent": "NA"},
    {"iata": "MEX", "icao": "MMMX", "name": "Mexico City Intl", "city": "Mexico City", "country_iso": "MEX", "lat": 19.4363, "lon": -99.0721, "elevation_ft": 7316, "airport_type": "large_airport", "pax_annual": 52.9, "runways": 2, "continent": "NA"},
    {"iata": "CUN", "icao": "MMUN", "name": "Cancún Intl", "city": "Cancún", "country_iso": "MEX", "lat": 21.0365, "lon": -86.8771, "elevation_ft": 22, "airport_type": "large_airport", "pax_annual": 31.2, "runways": 2, "continent": "NA"},
    # ── North America (additional) ──
    {"iata": "LAS", "icao": "KLAS", "name": "Harry Reid Intl", "city": "Las Vegas", "country_iso": "USA", "lat": 36.0840, "lon": -115.1537, "elevation_ft": 2181, "airport_type": "large_airport", "pax_annual": 57.3, "runways": 4, "continent": "NA"},
    {"iata": "CLT", "icao": "KCLT", "name": "Charlotte Douglas Intl", "city": "Charlotte", "country_iso": "USA", "lat": 35.2140, "lon": -80.9431, "elevation_ft": 748, "airport_type": "large_airport", "pax_annual": 54.2, "runways": 4, "continent": "NA"},
    {"iata": "PHX", "icao": "KPHX", "name": "Phoenix Sky Harbor Intl", "city": "Phoenix", "country_iso": "USA", "lat": 33.4373, "lon": -112.0078, "elevation_ft": 1135, "airport_type": "large_airport", "pax_annual": 53.8, "runways": 3, "continent": "NA"},
    {"iata": "BOS", "icao": "KBOS", "name": "Boston Logan Intl", "city": "Boston", "country_iso": "USA", "lat": 42.3656, "lon": -71.0096, "elevation_ft": 20, "airport_type": "large_airport", "pax_annual": 42.5, "runways": 6, "continent": "NA"},
    {"iata": "MSP", "icao": "KMSP", "name": "Minneapolis-Saint Paul Intl", "city": "Minneapolis", "country_iso": "USA", "lat": 44.8848, "lon": -93.2223, "elevation_ft": 841, "airport_type": "large_airport", "pax_annual": 39.6, "runways": 4, "continent": "NA"},
    {"iata": "FLL", "icao": "KFLL", "name": "Fort Lauderdale-Hollywood Intl", "city": "Fort Lauderdale", "country_iso": "USA", "lat": 26.0726, "lon": -80.1527, "elevation_ft": 9, "airport_type": "large_airport", "pax_annual": 36.7, "runways": 2, "continent": "NA"},
    {"iata": "DTW", "icao": "KDTW", "name": "Detroit Metropolitan Wayne County", "city": "Detroit", "country_iso": "USA", "lat": 42.2124, "lon": -83.3534, "elevation_ft": 645, "airport_type": "large_airport", "pax_annual": 36.4, "runways": 6, "continent": "NA"},
    {"iata": "PHL", "icao": "KPHL", "name": "Philadelphia Intl", "city": "Philadelphia", "country_iso": "USA", "lat": 39.8721, "lon": -75.2411, "elevation_ft": 36, "airport_type": "large_airport", "pax_annual": 33.8, "runways": 4, "continent": "NA"},
    {"iata": "SLC", "icao": "KSLC", "name": "Salt Lake City Intl", "city": "Salt Lake City", "country_iso": "USA", "lat": 40.7884, "lon": -111.9778, "elevation_ft": 4227, "airport_type": "large_airport", "pax_annual": 27.8, "runways": 4, "continent": "NA"},
    {"iata": "IAD", "icao": "KIAD", "name": "Washington Dulles Intl", "city": "Washington", "country_iso": "USA", "lat": 38.9445, "lon": -77.4558, "elevation_ft": 313, "airport_type": "large_airport", "pax_annual": 27.2, "runways": 4, "continent": "NA"},
    {"iata": "BWI", "icao": "KBWI", "name": "Baltimore/Washington Intl", "city": "Baltimore", "country_iso": "USA", "lat": 39.1754, "lon": -76.6684, "elevation_ft": 146, "airport_type": "large_airport", "pax_annual": 27.1, "runways": 3, "continent": "NA"},
    {"iata": "SAN", "icao": "KSAN", "name": "San Diego Intl", "city": "San Diego", "country_iso": "USA", "lat": 32.7336, "lon": -117.1897, "elevation_ft": 17, "airport_type": "large_airport", "pax_annual": 25.6, "runways": 1, "continent": "NA"},
    {"iata": "DCA", "icao": "KDCA", "name": "Ronald Reagan Washington Natl", "city": "Washington", "country_iso": "USA", "lat": 38.8521, "lon": -77.0377, "elevation_ft": 15, "airport_type": "large_airport", "pax_annual": 25.0, "runways": 3, "continent": "NA"},
    {"iata": "TPA", "icao": "KTPA", "name": "Tampa Intl", "city": "Tampa", "country_iso": "USA", "lat": 27.9755, "lon": -82.5332, "elevation_ft": 26, "airport_type": "large_airport", "pax_annual": 23.4, "runways": 3, "continent": "NA"},
    {"iata": "BNA", "icao": "KBNA", "name": "Nashville Intl", "city": "Nashville", "country_iso": "USA", "lat": 36.1263, "lon": -86.6774, "elevation_ft": 599, "airport_type": "large_airport", "pax_annual": 22.0, "runways": 4, "continent": "NA"},
    {"iata": "HNL", "icao": "PHNL", "name": "Daniel K. Inouye Intl", "city": "Honolulu", "country_iso": "USA", "lat": 21.3187, "lon": -157.9225, "elevation_ft": 13, "airport_type": "large_airport", "pax_annual": 21.4, "runways": 4, "continent": "NA"},
    {"iata": "PDX", "icao": "KPDX", "name": "Portland Intl", "city": "Portland", "country_iso": "USA", "lat": 45.5898, "lon": -122.5951, "elevation_ft": 31, "airport_type": "large_airport", "pax_annual": 20.3, "runways": 3, "continent": "NA"},
    {"iata": "AUS", "icao": "KAUS", "name": "Austin-Bergstrom Intl", "city": "Austin", "country_iso": "USA", "lat": 30.1945, "lon": -97.6699, "elevation_ft": 542, "airport_type": "large_airport", "pax_annual": 20.1, "runways": 2, "continent": "NA"},
    {"iata": "GDL", "icao": "MMGL", "name": "Guadalajara Intl", "city": "Guadalajara", "country_iso": "MEX", "lat": 20.5218, "lon": -103.3113, "elevation_ft": 5016, "airport_type": "large_airport", "pax_annual": 15.6, "runways": 2, "continent": "NA"},
    {"iata": "RDU", "icao": "KRDU", "name": "Raleigh-Durham Intl", "city": "Raleigh", "country_iso": "USA", "lat": 35.8776, "lon": -78.7875, "elevation_ft": 435, "airport_type": "large_airport", "pax_annual": 15.2, "runways": 3, "continent": "NA"},
    {"iata": "SJU", "icao": "TJSJ", "name": "Luis Muñoz Marín Intl", "city": "San Juan", "country_iso": "PRI", "lat": 18.4394, "lon": -66.0018, "elevation_ft": 9, "airport_type": "large_airport", "pax_annual": 10.1, "runways": 2, "continent": "NA"},
    {"iata": "YUL", "icao": "CYUL", "name": "Montréal-Trudeau Intl", "city": "Montréal", "country_iso": "CAN", "lat": 45.4706, "lon": -73.7408, "elevation_ft": 118, "airport_type": "large_airport", "pax_annual": 20.3, "runways": 3, "continent": "NA"},
    {"iata": "YYC", "icao": "CYYC", "name": "Calgary Intl", "city": "Calgary", "country_iso": "CAN", "lat": 51.1215, "lon": -114.0076, "elevation_ft": 3557, "airport_type": "large_airport", "pax_annual": 17.7, "runways": 4, "continent": "NA"},
    {"iata": "YEG", "icao": "CYEG", "name": "Edmonton Intl", "city": "Edmonton", "country_iso": "CAN", "lat": 53.3097, "lon": -113.5800, "elevation_ft": 2373, "airport_type": "large_airport", "pax_annual": 8.2, "runways": 2, "continent": "NA"},
    {"iata": "SJO", "icao": "MROC", "name": "Juan Santamaría Intl", "city": "San José", "country_iso": "CRI", "lat": 9.9939, "lon": -84.2088, "elevation_ft": 3021, "airport_type": "large_airport", "pax_annual": 6.8, "runways": 1, "continent": "NA"},
    {"iata": "ANC", "icao": "PANC", "name": "Ted Stevens Anchorage Intl", "city": "Anchorage", "country_iso": "USA", "lat": 61.1743, "lon": -149.9962, "elevation_ft": 152, "airport_type": "large_airport", "pax_annual": 5.3, "runways": 3, "continent": "NA"},
    {"iata": "YOW", "icao": "CYOW", "name": "Ottawa Macdonald-Cartier Intl", "city": "Ottawa", "country_iso": "CAN", "lat": 45.3225, "lon": -75.6692, "elevation_ft": 374, "airport_type": "large_airport", "pax_annual": 5.1, "runways": 3, "continent": "NA"},

    # ── Europe ──
    {"iata": "LHR", "icao": "EGLL", "name": "London Heathrow", "city": "London", "country_iso": "GBR", "lat": 51.4700, "lon": -0.4543, "elevation_ft": 83, "airport_type": "large_airport", "pax_annual": 79.2, "runways": 2, "continent": "EU"},
    {"iata": "CDG", "icao": "LFPG", "name": "Paris Charles de Gaulle", "city": "Paris", "country_iso": "FRA", "lat": 49.0097, "lon": 2.5479, "elevation_ft": 392, "airport_type": "large_airport", "pax_annual": 76.2, "runways": 4, "continent": "EU"},
    {"iata": "IST", "icao": "LTFM", "name": "Istanbul Airport", "city": "Istanbul", "country_iso": "TUR", "lat": 41.2753, "lon": 28.7519, "elevation_ft": 325, "airport_type": "large_airport", "pax_annual": 76.0, "runways": 5, "continent": "EU"},
    {"iata": "AMS", "icao": "EHAM", "name": "Amsterdam Schiphol", "city": "Amsterdam", "country_iso": "NLD", "lat": 52.3105, "lon": 4.7683, "elevation_ft": -11, "airport_type": "large_airport", "pax_annual": 71.7, "runways": 6, "continent": "EU"},
    {"iata": "FRA", "icao": "EDDF", "name": "Frankfurt Airport", "city": "Frankfurt", "country_iso": "DEU", "lat": 50.0379, "lon": 8.5622, "elevation_ft": 364, "airport_type": "large_airport", "pax_annual": 69.4, "runways": 4, "continent": "EU"},
    {"iata": "MAD", "icao": "LEMD", "name": "Madrid Barajas", "city": "Madrid", "country_iso": "ESP", "lat": 40.4719, "lon": -3.5626, "elevation_ft": 1998, "airport_type": "large_airport", "pax_annual": 60.2, "runways": 4, "continent": "EU"},
    {"iata": "BCN", "icao": "LEBL", "name": "Barcelona El Prat", "city": "Barcelona", "country_iso": "ESP", "lat": 41.2974, "lon": 2.0833, "elevation_ft": 12, "airport_type": "large_airport", "pax_annual": 52.7, "runways": 3, "continent": "EU"},
    {"iata": "FCO", "icao": "LIRF", "name": "Rome Fiumicino", "city": "Rome", "country_iso": "ITA", "lat": 41.8003, "lon": 12.2389, "elevation_ft": 15, "airport_type": "large_airport", "pax_annual": 49.4, "runways": 4, "continent": "EU"},
    {"iata": "MUC", "icao": "EDDM", "name": "Munich Airport", "city": "Munich", "country_iso": "DEU", "lat": 48.3537, "lon": 11.7750, "elevation_ft": 1487, "airport_type": "large_airport", "pax_annual": 47.9, "runways": 2, "continent": "EU"},
    {"iata": "LGW", "icao": "EGKK", "name": "London Gatwick", "city": "London", "country_iso": "GBR", "lat": 51.1537, "lon": -0.1821, "elevation_ft": 202, "airport_type": "large_airport", "pax_annual": 40.9, "runways": 2, "continent": "EU"},
    {"iata": "ZRH", "icao": "LSZH", "name": "Zürich Airport", "city": "Zürich", "country_iso": "CHE", "lat": 47.4647, "lon": 8.5492, "elevation_ft": 1416, "airport_type": "large_airport", "pax_annual": 31.5, "runways": 3, "continent": "EU"},
    {"iata": "CPH", "icao": "EKCH", "name": "Copenhagen Airport", "city": "Copenhagen", "country_iso": "DNK", "lat": 55.6181, "lon": 12.6561, "elevation_ft": 17, "airport_type": "large_airport", "pax_annual": 30.3, "runways": 3, "continent": "EU"},
    {"iata": "DUB", "icao": "EIDW", "name": "Dublin Airport", "city": "Dublin", "country_iso": "IRL", "lat": 53.4264, "lon": -6.2499, "elevation_ft": 242, "airport_type": "large_airport", "pax_annual": 32.9, "runways": 2, "continent": "EU"},
    {"iata": "VIE", "icao": "LOWW", "name": "Vienna Intl Airport", "city": "Vienna", "country_iso": "AUT", "lat": 48.1103, "lon": 16.5697, "elevation_ft": 600, "airport_type": "large_airport", "pax_annual": 31.7, "runways": 2, "continent": "EU"},
    {"iata": "OSL", "icao": "ENGM", "name": "Oslo Gardermoen", "city": "Oslo", "country_iso": "NOR", "lat": 60.1976, "lon": 11.1004, "elevation_ft": 681, "airport_type": "large_airport", "pax_annual": 28.6, "runways": 2, "continent": "EU"},
    {"iata": "ARN", "icao": "ESSA", "name": "Stockholm Arlanda", "city": "Stockholm", "country_iso": "SWE", "lat": 59.6498, "lon": 17.9238, "elevation_ft": 137, "airport_type": "large_airport", "pax_annual": 26.8, "runways": 3, "continent": "EU"},
    {"iata": "BRU", "icao": "EBBR", "name": "Brussels Airport", "city": "Brussels", "country_iso": "BEL", "lat": 50.9014, "lon": 4.4844, "elevation_ft": 184, "airport_type": "large_airport", "pax_annual": 25.7, "runways": 3, "continent": "EU"},
    {"iata": "HEL", "icao": "EFHK", "name": "Helsinki-Vantaa", "city": "Helsinki", "country_iso": "FIN", "lat": 60.3172, "lon": 24.9633, "elevation_ft": 179, "airport_type": "large_airport", "pax_annual": 22.0, "runways": 3, "continent": "EU"},
    {"iata": "WAW", "icao": "EPWA", "name": "Warsaw Chopin", "city": "Warsaw", "country_iso": "POL", "lat": 52.1657, "lon": 20.9671, "elevation_ft": 362, "airport_type": "large_airport", "pax_annual": 18.9, "runways": 2, "continent": "EU"},
    {"iata": "LIS", "icao": "LPPT", "name": "Lisbon Humberto Delgado", "city": "Lisbon", "country_iso": "PRT", "lat": 38.7742, "lon": -9.1342, "elevation_ft": 374, "airport_type": "large_airport", "pax_annual": 31.2, "runways": 2, "continent": "EU"},
    {"iata": "ATH", "icao": "LGAV", "name": "Athens Eleftherios Venizelos", "city": "Athens", "country_iso": "GRC", "lat": 37.9364, "lon": 23.9445, "elevation_ft": 308, "airport_type": "large_airport", "pax_annual": 28.2, "runways": 2, "continent": "EU"},
    {"iata": "SVO", "icao": "UUEE", "name": "Moscow Sheremetyevo", "city": "Moscow", "country_iso": "RUS", "lat": 55.9726, "lon": 37.4146, "elevation_ft": 630, "airport_type": "large_airport", "pax_annual": 49.9, "runways": 3, "continent": "EU"},
    # ── Europe (additional) ──
    {"iata": "SAW", "icao": "LTFJ", "name": "Istanbul Sabiha Gökçen", "city": "Istanbul", "country_iso": "TUR", "lat": 40.8986, "lon": 29.3092, "elevation_ft": 312, "airport_type": "large_airport", "pax_annual": 35.6, "runways": 2, "continent": "EU"},
    {"iata": "AYT", "icao": "LTAI", "name": "Antalya", "city": "Antalya", "country_iso": "TUR", "lat": 36.8987, "lon": 30.8005, "elevation_ft": 177, "airport_type": "large_airport", "pax_annual": 35.5, "runways": 2, "continent": "EU"},
    {"iata": "ORY", "icao": "LFPO", "name": "Paris Orly", "city": "Paris", "country_iso": "FRA", "lat": 48.7233, "lon": 2.3794, "elevation_ft": 292, "airport_type": "large_airport", "pax_annual": 33.1, "runways": 3, "continent": "EU"},
    {"iata": "PMI", "icao": "LEPA", "name": "Palma de Mallorca", "city": "Palma", "country_iso": "ESP", "lat": 39.5517, "lon": 2.7388, "elevation_ft": 27, "airport_type": "large_airport", "pax_annual": 31.1, "runways": 2, "continent": "EU"},
    {"iata": "MXP", "icao": "LIMC", "name": "Milan Malpensa", "city": "Milan", "country_iso": "ITA", "lat": 45.6306, "lon": 8.7281, "elevation_ft": 768, "airport_type": "large_airport", "pax_annual": 28.8, "runways": 2, "continent": "EU"},
    {"iata": "MAN", "icao": "EGCC", "name": "Manchester", "city": "Manchester", "country_iso": "GBR", "lat": 53.3537, "lon": -2.2750, "elevation_ft": 257, "airport_type": "large_airport", "pax_annual": 28.3, "runways": 2, "continent": "EU"},
    {"iata": "STN", "icao": "EGSS", "name": "London Stansted", "city": "London", "country_iso": "GBR", "lat": 51.8850, "lon": 0.2350, "elevation_ft": 348, "airport_type": "large_airport", "pax_annual": 28.0, "runways": 1, "continent": "EU"},
    {"iata": "BER", "icao": "EDDB", "name": "Berlin Brandenburg", "city": "Berlin", "country_iso": "DEU", "lat": 52.3667, "lon": 13.5033, "elevation_ft": 157, "airport_type": "large_airport", "pax_annual": 25.5, "runways": 2, "continent": "EU"},
    {"iata": "DUS", "icao": "EDDL", "name": "Düsseldorf", "city": "Düsseldorf", "country_iso": "DEU", "lat": 51.2895, "lon": 6.7668, "elevation_ft": 147, "airport_type": "large_airport", "pax_annual": 25.5, "runways": 2, "continent": "EU"},
    {"iata": "AGP", "icao": "LEMG", "name": "Malaga-Costa del Sol", "city": "Malaga", "country_iso": "ESP", "lat": 36.6749, "lon": -4.4991, "elevation_ft": 53, "airport_type": "large_airport", "pax_annual": 22.0, "runways": 2, "continent": "EU"},
    {"iata": "GVA", "icao": "LSGG", "name": "Geneva", "city": "Geneva", "country_iso": "CHE", "lat": 46.2381, "lon": 6.1089, "elevation_ft": 1411, "airport_type": "large_airport", "pax_annual": 17.9, "runways": 1, "continent": "EU"},
    {"iata": "PRG", "icao": "LKPR", "name": "Prague Vaclav Havel", "city": "Prague", "country_iso": "CZE", "lat": 50.1008, "lon": 14.2600, "elevation_ft": 1247, "airport_type": "large_airport", "pax_annual": 17.8, "runways": 2, "continent": "EU"},
    {"iata": "HAM", "icao": "EDDH", "name": "Hamburg", "city": "Hamburg", "country_iso": "DEU", "lat": 53.6304, "lon": 9.9882, "elevation_ft": 53, "airport_type": "large_airport", "pax_annual": 17.3, "runways": 2, "continent": "EU"},
    {"iata": "BUD", "icao": "LHBP", "name": "Budapest Ferenc Liszt", "city": "Budapest", "country_iso": "HUN", "lat": 47.4369, "lon": 19.2556, "elevation_ft": 495, "airport_type": "large_airport", "pax_annual": 16.2, "runways": 2, "continent": "EU"},
    {"iata": "BGY", "icao": "LIME", "name": "Milan Bergamo", "city": "Bergamo", "country_iso": "ITA", "lat": 45.6739, "lon": 9.7042, "elevation_ft": 782, "airport_type": "large_airport", "pax_annual": 15.4, "runways": 1, "continent": "EU"},
    {"iata": "OTP", "icao": "LROP", "name": "Bucharest Henri Coanda", "city": "Bucharest", "country_iso": "ROU", "lat": 44.5711, "lon": 26.0850, "elevation_ft": 314, "airport_type": "large_airport", "pax_annual": 14.7, "runways": 1, "continent": "EU"},
    {"iata": "EDI", "icao": "EGPH", "name": "Edinburgh", "city": "Edinburgh", "country_iso": "GBR", "lat": 55.9500, "lon": -3.3725, "elevation_ft": 135, "airport_type": "large_airport", "pax_annual": 14.7, "runways": 1, "continent": "EU"},
    {"iata": "NCE", "icao": "LFMN", "name": "Nice Côte d Azur", "city": "Nice", "country_iso": "FRA", "lat": 43.6584, "lon": 7.2159, "elevation_ft": 12, "airport_type": "large_airport", "pax_annual": 14.5, "runways": 2, "continent": "EU"},
    {"iata": "NAP", "icao": "LIRN", "name": "Naples", "city": "Naples", "country_iso": "ITA", "lat": 40.8860, "lon": 14.2908, "elevation_ft": 294, "airport_type": "large_airport", "pax_annual": 12.5, "runways": 1, "continent": "EU"},
    {"iata": "LYS", "icao": "LFLL", "name": "Lyon-Saint Exupéry", "city": "Lyon", "country_iso": "FRA", "lat": 45.7256, "lon": 5.0811, "elevation_ft": 821, "airport_type": "large_airport", "pax_annual": 12.1, "runways": 2, "continent": "EU"},
    {"iata": "RIX", "icao": "EVRA", "name": "Riga Intl", "city": "Riga", "country_iso": "LVA", "lat": 56.9236, "lon": 23.9711, "elevation_ft": 36, "airport_type": "large_airport", "pax_annual": 7.8, "runways": 1, "continent": "EU"},
    {"iata": "BEG", "icao": "LYBE", "name": "Belgrade Nikola Tesla", "city": "Belgrade", "country_iso": "SRB", "lat": 44.8184, "lon": 20.3091, "elevation_ft": 335, "airport_type": "large_airport", "pax_annual": 7.5, "runways": 1, "continent": "EU"},
    {"iata": "KEF", "icao": "BIKF", "name": "Keflavik Intl", "city": "Reykjavik", "country_iso": "ISL", "lat": 63.9850, "lon": -22.6056, "elevation_ft": 171, "airport_type": "large_airport", "pax_annual": 7.2, "runways": 2, "continent": "EU"},
    {"iata": "SOF", "icao": "LBSF", "name": "Sofia", "city": "Sofia", "country_iso": "BGR", "lat": 42.6952, "lon": 23.4064, "elevation_ft": 1742, "airport_type": "large_airport", "pax_annual": 7.1, "runways": 1, "continent": "EU"},
    {"iata": "ZAG", "icao": "LDZA", "name": "Zagreb Franjo Tudman", "city": "Zagreb", "country_iso": "HRV", "lat": 45.7429, "lon": 16.0688, "elevation_ft": 353, "airport_type": "large_airport", "pax_annual": 3.8, "runways": 1, "continent": "EU"},

    # ── Middle East ──
    {"iata": "DXB", "icao": "OMDB", "name": "Dubai Intl", "city": "Dubai", "country_iso": "ARE", "lat": 25.2528, "lon": 55.3644, "elevation_ft": 62, "airport_type": "large_airport", "pax_annual": 87.0, "runways": 2, "continent": "AS"},
    {"iata": "DOH", "icao": "OTHH", "name": "Hamad Intl", "city": "Doha", "country_iso": "QAT", "lat": 25.2731, "lon": 51.6081, "elevation_ft": 13, "airport_type": "large_airport", "pax_annual": 46.1, "runways": 2, "continent": "AS"},
    {"iata": "AUH", "icao": "OMAA", "name": "Abu Dhabi Intl", "city": "Abu Dhabi", "country_iso": "ARE", "lat": 24.4331, "lon": 54.6511, "elevation_ft": 88, "airport_type": "large_airport", "pax_annual": 24.5, "runways": 2, "continent": "AS"},
    {"iata": "JED", "icao": "OEJN", "name": "King Abdulaziz Intl", "city": "Jeddah", "country_iso": "SAU", "lat": 21.6796, "lon": 39.1565, "elevation_ft": 48, "airport_type": "large_airport", "pax_annual": 46.4, "runways": 2, "continent": "AS"},
    {"iata": "RUH", "icao": "OERK", "name": "King Khalid Intl", "city": "Riyadh", "country_iso": "SAU", "lat": 24.9576, "lon": 46.6988, "elevation_ft": 2049, "airport_type": "large_airport", "pax_annual": 29.5, "runways": 2, "continent": "AS"},
    {"iata": "TLV", "icao": "LLBG", "name": "Ben Gurion Intl", "city": "Tel Aviv", "country_iso": "ISR", "lat": 32.0114, "lon": 34.8867, "elevation_ft": 135, "airport_type": "large_airport", "pax_annual": 25.0, "runways": 3, "continent": "AS"},

    # ── Asia-Pacific ──
    {"iata": "PEK", "icao": "ZBAA", "name": "Beijing Capital Intl", "city": "Beijing", "country_iso": "CHN", "lat": 40.0799, "lon": 116.6031, "elevation_ft": 116, "airport_type": "large_airport", "pax_annual": 100.0, "runways": 3, "continent": "AS"},
    {"iata": "PKX", "icao": "ZBAD", "name": "Beijing Daxing Intl", "city": "Beijing", "country_iso": "CHN", "lat": 39.5098, "lon": 116.4105, "elevation_ft": 98, "airport_type": "large_airport", "pax_annual": 39.1, "runways": 4, "continent": "AS"},
    {"iata": "HND", "icao": "RJTT", "name": "Tokyo Haneda", "city": "Tokyo", "country_iso": "JPN", "lat": 35.5494, "lon": 139.7798, "elevation_ft": 35, "airport_type": "large_airport", "pax_annual": 87.1, "runways": 4, "continent": "AS"},
    {"iata": "PVG", "icao": "ZSPD", "name": "Shanghai Pudong Intl", "city": "Shanghai", "country_iso": "CHN", "lat": 31.1443, "lon": 121.8083, "elevation_ft": 13, "airport_type": "large_airport", "pax_annual": 76.2, "runways": 5, "continent": "AS"},
    {"iata": "CAN", "icao": "ZGGG", "name": "Guangzhou Baiyun Intl", "city": "Guangzhou", "country_iso": "CHN", "lat": 23.3924, "lon": 113.2988, "elevation_ft": 49, "airport_type": "large_airport", "pax_annual": 73.4, "runways": 3, "continent": "AS"},
    {"iata": "SIN", "icao": "WSSS", "name": "Singapore Changi", "city": "Singapore", "country_iso": "SGP", "lat": 1.3644, "lon": 103.9915, "elevation_ft": 22, "airport_type": "large_airport", "pax_annual": 68.3, "runways": 2, "continent": "AS"},
    {"iata": "ICN", "icao": "RKSI", "name": "Seoul Incheon Intl", "city": "Seoul", "country_iso": "KOR", "lat": 37.4602, "lon": 126.4407, "elevation_ft": 23, "airport_type": "large_airport", "pax_annual": 71.2, "runways": 4, "continent": "AS"},
    {"iata": "BKK", "icao": "VTBS", "name": "Bangkok Suvarnabhumi", "city": "Bangkok", "country_iso": "THA", "lat": 13.6900, "lon": 100.7501, "elevation_ft": 5, "airport_type": "large_airport", "pax_annual": 65.4, "runways": 2, "continent": "AS"},
    {"iata": "DEL", "icao": "VIDP", "name": "Indira Gandhi Intl", "city": "Delhi", "country_iso": "IND", "lat": 28.5562, "lon": 77.1000, "elevation_ft": 777, "airport_type": "large_airport", "pax_annual": 72.3, "runways": 3, "continent": "AS"},
    {"iata": "BOM", "icao": "VABB", "name": "Chhatrapati Shivaji Maharaj Intl", "city": "Mumbai", "country_iso": "IND", "lat": 19.0896, "lon": 72.8656, "elevation_ft": 39, "airport_type": "large_airport", "pax_annual": 51.8, "runways": 2, "continent": "AS"},
    {"iata": "HKG", "icao": "VHHH", "name": "Hong Kong Intl", "city": "Hong Kong", "country_iso": "CHN", "lat": 22.3080, "lon": 113.9185, "elevation_ft": 28, "airport_type": "large_airport", "pax_annual": 50.9, "runways": 2, "continent": "AS"},
    {"iata": "KUL", "icao": "WMKK", "name": "Kuala Lumpur Intl", "city": "Kuala Lumpur", "country_iso": "MYS", "lat": 2.7456, "lon": 101.7099, "elevation_ft": 69, "airport_type": "large_airport", "pax_annual": 62.3, "runways": 2, "continent": "AS"},
    {"iata": "NRT", "icao": "RJAA", "name": "Tokyo Narita Intl", "city": "Tokyo", "country_iso": "JPN", "lat": 35.7647, "lon": 140.3864, "elevation_ft": 141, "airport_type": "large_airport", "pax_annual": 35.5, "runways": 2, "continent": "AS"},
    {"iata": "CGK", "icao": "WIII", "name": "Jakarta Soekarno-Hatta Intl", "city": "Jakarta", "country_iso": "IDN", "lat": -6.1256, "lon": 106.6558, "elevation_ft": 34, "airport_type": "large_airport", "pax_annual": 65.0, "runways": 2, "continent": "AS"},
    {"iata": "MNL", "icao": "RPLL", "name": "Manila Ninoy Aquino Intl", "city": "Manila", "country_iso": "PHL", "lat": 14.5086, "lon": 121.0197, "elevation_ft": 75, "airport_type": "large_airport", "pax_annual": 47.9, "runways": 2, "continent": "AS"},
    {"iata": "SYD", "icao": "YSSY", "name": "Sydney Kingsford Smith", "city": "Sydney", "country_iso": "AUS", "lat": -33.9461, "lon": 151.1772, "elevation_ft": 21, "airport_type": "large_airport", "pax_annual": 44.4, "runways": 3, "continent": "OC"},
    {"iata": "MEL", "icao": "YMML", "name": "Melbourne Tullamarine", "city": "Melbourne", "country_iso": "AUS", "lat": -37.6690, "lon": 144.8410, "elevation_ft": 434, "airport_type": "large_airport", "pax_annual": 37.7, "runways": 2, "continent": "OC"},
    {"iata": "AKL", "icao": "NZAA", "name": "Auckland Intl", "city": "Auckland", "country_iso": "NZL", "lat": -37.0082, "lon": 174.7850, "elevation_ft": 23, "airport_type": "large_airport", "pax_annual": 21.4, "runways": 2, "continent": "OC"},
    {"iata": "TPE", "icao": "RCTP", "name": "Taiwan Taoyuan Intl", "city": "Taipei", "country_iso": "TWN", "lat": 25.0797, "lon": 121.2342, "elevation_ft": 106, "airport_type": "large_airport", "pax_annual": 48.7, "runways": 2, "continent": "AS"},
    {"iata": "BLR", "icao": "VOBL", "name": "Bengaluru Kempegowda Intl", "city": "Bengaluru", "country_iso": "IND", "lat": 13.1986, "lon": 77.7066, "elevation_ft": 3000, "airport_type": "large_airport", "pax_annual": 37.5, "runways": 2, "continent": "AS"},
    {"iata": "CTU", "icao": "ZUUU", "name": "Chengdu Tianfu Intl", "city": "Chengdu", "country_iso": "CHN", "lat": 30.3145, "lon": 104.4432, "elevation_ft": 1624, "airport_type": "large_airport", "pax_annual": 60.2, "runways": 3, "continent": "AS"},
    {"iata": "SZX", "icao": "ZGSZ", "name": "Shenzhen Bao'an Intl", "city": "Shenzhen", "country_iso": "CHN", "lat": 22.6393, "lon": 113.8107, "elevation_ft": 13, "airport_type": "large_airport", "pax_annual": 52.9, "runways": 2, "continent": "AS"},
    # ── Asia-Pacific (additional) ──
    {"iata": "KMG", "icao": "ZPPP", "name": "Kunming Changshui Intl", "city": "Kunming", "country_iso": "CHN", "lat": 25.1022, "lon": 102.9291, "elevation_ft": 6903, "airport_type": "large_airport", "pax_annual": 48.1, "runways": 2, "continent": "AS"},
    {"iata": "SHA", "icao": "ZSSS", "name": "Shanghai Hongqiao Intl", "city": "Shanghai", "country_iso": "CHN", "lat": 31.1979, "lon": 121.3362, "elevation_ft": 10, "airport_type": "large_airport", "pax_annual": 45.6, "runways": 2, "continent": "AS"},
    {"iata": "XIY", "icao": "ZLXY", "name": "Xi an Xianyang Intl", "city": "Xi an", "country_iso": "CHN", "lat": 34.4471, "lon": 108.7516, "elevation_ft": 1572, "airport_type": "large_airport", "pax_annual": 44.7, "runways": 2, "continent": "AS"},
    {"iata": "CKG", "icao": "ZUCK", "name": "Chongqing Jiangbei Intl", "city": "Chongqing", "country_iso": "CHN", "lat": 29.7192, "lon": 106.6422, "elevation_ft": 1365, "airport_type": "large_airport", "pax_annual": 44.4, "runways": 3, "continent": "AS"},
    {"iata": "SGN", "icao": "VVTS", "name": "Tan Son Nhat Intl", "city": "Ho Chi Minh City", "country_iso": "VNM", "lat": 10.8188, "lon": 106.6520, "elevation_ft": 33, "airport_type": "large_airport", "pax_annual": 41.2, "runways": 2, "continent": "AS"},
    {"iata": "DMK", "icao": "VTBD", "name": "Bangkok Don Mueang", "city": "Bangkok", "country_iso": "THA", "lat": 13.9126, "lon": 100.6070, "elevation_ft": 9, "airport_type": "large_airport", "pax_annual": 40.5, "runways": 2, "continent": "AS"},
    {"iata": "HGH", "icao": "ZSHC", "name": "Hangzhou Xiaoshan Intl", "city": "Hangzhou", "country_iso": "CHN", "lat": 30.2295, "lon": 120.4344, "elevation_ft": 23, "airport_type": "large_airport", "pax_annual": 40.1, "runways": 2, "continent": "AS"},
    {"iata": "KIX", "icao": "RJBB", "name": "Osaka Kansai Intl", "city": "Osaka", "country_iso": "JPN", "lat": 34.4347, "lon": 135.2440, "elevation_ft": 26, "airport_type": "large_airport", "pax_annual": 31.9, "runways": 2, "continent": "AS"},
    {"iata": "HAN", "icao": "VVNB", "name": "Noi Bai Intl", "city": "Hanoi", "country_iso": "VNM", "lat": 21.2212, "lon": 105.8072, "elevation_ft": 39, "airport_type": "large_airport", "pax_annual": 29.4, "runways": 2, "continent": "AS"},
    {"iata": "GMP", "icao": "RKSS", "name": "Seoul Gimpo Intl", "city": "Seoul", "country_iso": "KOR", "lat": 37.5583, "lon": 126.7906, "elevation_ft": 59, "airport_type": "large_airport", "pax_annual": 26.3, "runways": 2, "continent": "AS"},
    {"iata": "HYD", "icao": "VOHS", "name": "Rajiv Gandhi Intl", "city": "Hyderabad", "country_iso": "IND", "lat": 17.2403, "lon": 78.4294, "elevation_ft": 2024, "airport_type": "large_airport", "pax_annual": 25.2, "runways": 1, "continent": "AS"},
    {"iata": "FUK", "icao": "RJFF", "name": "Fukuoka", "city": "Fukuoka", "country_iso": "JPN", "lat": 33.5859, "lon": 130.4511, "elevation_ft": 30, "airport_type": "large_airport", "pax_annual": 24.8, "runways": 1, "continent": "AS"},
    {"iata": "CTS", "icao": "RJCC", "name": "New Chitose (Sapporo)", "city": "Sapporo", "country_iso": "JPN", "lat": 42.7752, "lon": 141.6924, "elevation_ft": 82, "airport_type": "large_airport", "pax_annual": 23.6, "runways": 2, "continent": "AS"},
    {"iata": "MAA", "icao": "VOMM", "name": "Chennai Intl", "city": "Chennai", "country_iso": "IND", "lat": 12.9941, "lon": 80.1709, "elevation_ft": 52, "airport_type": "large_airport", "pax_annual": 23.4, "runways": 2, "continent": "AS"},
    {"iata": "CCU", "icao": "VECC", "name": "Netaji Subhas Chandra Bose Intl", "city": "Kolkata", "country_iso": "IND", "lat": 22.6547, "lon": 88.4467, "elevation_ft": 16, "airport_type": "large_airport", "pax_annual": 20.8, "runways": 2, "continent": "AS"},
    {"iata": "PUS", "icao": "RKPK", "name": "Busan Gimhae Intl", "city": "Busan", "country_iso": "KOR", "lat": 35.1795, "lon": 128.9382, "elevation_ft": 6, "airport_type": "large_airport", "pax_annual": 17.6, "runways": 2, "continent": "AS"},
    {"iata": "MCT", "icao": "OOMS", "name": "Muscat Intl", "city": "Muscat", "country_iso": "OMN", "lat": 23.5933, "lon": 58.2844, "elevation_ft": 48, "airport_type": "large_airport", "pax_annual": 16.0, "runways": 1, "continent": "AS"},
    {"iata": "KWI", "icao": "OKBK", "name": "Kuwait Intl", "city": "Kuwait City", "country_iso": "KWT", "lat": 29.2266, "lon": 47.9689, "elevation_ft": 206, "airport_type": "large_airport", "pax_annual": 15.6, "runways": 2, "continent": "AS"},
    {"iata": "CEB", "icao": "RPVM", "name": "Mactan-Cebu Intl", "city": "Cebu", "country_iso": "PHL", "lat": 10.3074, "lon": 123.9794, "elevation_ft": 31, "airport_type": "large_airport", "pax_annual": 12.8, "runways": 1, "continent": "AS"},
    {"iata": "DAC", "icao": "VGHS", "name": "Hazrat Shahjalal Intl", "city": "Dhaka", "country_iso": "BGD", "lat": 23.8433, "lon": 90.3978, "elevation_ft": 30, "airport_type": "large_airport", "pax_annual": 12.0, "runways": 1, "continent": "AS"},
    {"iata": "CMB", "icao": "VCBI", "name": "Bandaranaike Intl", "city": "Colombo", "country_iso": "LKA", "lat": 7.1808, "lon": 79.8841, "elevation_ft": 30, "airport_type": "large_airport", "pax_annual": 10.3, "runways": 1, "continent": "AS"},
    {"iata": "BAH", "icao": "OBBI", "name": "Bahrain Intl", "city": "Muharraq", "country_iso": "BHR", "lat": 26.2708, "lon": 50.6336, "elevation_ft": 6, "airport_type": "large_airport", "pax_annual": 9.6, "runways": 1, "continent": "AS"},
    {"iata": "ISB", "icao": "OPIS", "name": "Islamabad Intl", "city": "Islamabad", "country_iso": "PAK", "lat": 33.5605, "lon": 72.8526, "elevation_ft": 1761, "airport_type": "large_airport", "pax_annual": 9.2, "runways": 2, "continent": "AS"},
    {"iata": "AMM", "icao": "OJAI", "name": "Queen Alia Intl", "city": "Amman", "country_iso": "JOR", "lat": 31.7226, "lon": 35.9932, "elevation_ft": 2395, "airport_type": "large_airport", "pax_annual": 8.9, "runways": 2, "continent": "AS"},
    # ── Oceania (additional) ──
    {"iata": "BNE", "icao": "YBBN", "name": "Brisbane", "city": "Brisbane", "country_iso": "AUS", "lat": -27.3842, "lon": 153.1175, "elevation_ft": 13, "airport_type": "large_airport", "pax_annual": 23.7, "runways": 2, "continent": "OC"},
    {"iata": "PER", "icao": "YPPH", "name": "Perth", "city": "Perth", "country_iso": "AUS", "lat": -31.9403, "lon": 115.9672, "elevation_ft": 67, "airport_type": "large_airport", "pax_annual": 14.1, "runways": 2, "continent": "OC"},

    # ── South America ──
    {"iata": "GRU", "icao": "SBGR", "name": "São Paulo Guarulhos Intl", "city": "São Paulo", "country_iso": "BRA", "lat": -23.4356, "lon": -46.4731, "elevation_ft": 2459, "airport_type": "large_airport", "pax_annual": 41.3, "runways": 2, "continent": "SA"},
    {"iata": "BOG", "icao": "SKBO", "name": "Bogotá El Dorado Intl", "city": "Bogotá", "country_iso": "COL", "lat": 4.7016, "lon": -74.1469, "elevation_ft": 8361, "airport_type": "large_airport", "pax_annual": 38.1, "runways": 2, "continent": "SA"},
    {"iata": "SCL", "icao": "SCEL", "name": "Santiago Arturo Merino Benítez Intl", "city": "Santiago", "country_iso": "CHL", "lat": -33.3930, "lon": -70.7858, "elevation_ft": 1555, "airport_type": "large_airport", "pax_annual": 24.0, "runways": 2, "continent": "SA"},
    {"iata": "EZE", "icao": "SAEZ", "name": "Buenos Aires Ministro Pistarini Intl", "city": "Buenos Aires", "country_iso": "ARG", "lat": -34.8222, "lon": -58.5358, "elevation_ft": 67, "airport_type": "large_airport", "pax_annual": 14.2, "runways": 2, "continent": "SA"},
    {"iata": "LIM", "icao": "SPJC", "name": "Lima Jorge Chávez Intl", "city": "Lima", "country_iso": "PER", "lat": -12.0219, "lon": -77.1143, "elevation_ft": 113, "airport_type": "large_airport", "pax_annual": 24.8, "runways": 2, "continent": "SA"},
    {"iata": "GIG", "icao": "SBGL", "name": "Rio de Janeiro Galeão Intl", "city": "Rio de Janeiro", "country_iso": "BRA", "lat": -22.8100, "lon": -43.2506, "elevation_ft": 28, "airport_type": "large_airport", "pax_annual": 16.1, "runways": 2, "continent": "SA"},
    {"iata": "PTY", "icao": "MPTO", "name": "Panama City Tocumen Intl", "city": "Panama City", "country_iso": "PAN", "lat": 9.0714, "lon": -79.3835, "elevation_ft": 135, "airport_type": "large_airport", "pax_annual": 16.7, "runways": 2, "continent": "NA"},

    # ── Africa ──
    {"iata": "JNB", "icao": "FAOR", "name": "Johannesburg O.R. Tambo Intl", "city": "Johannesburg", "country_iso": "ZAF", "lat": -26.1392, "lon": 28.2460, "elevation_ft": 5558, "airport_type": "large_airport", "pax_annual": 21.7, "runways": 2, "continent": "AF"},
    {"iata": "CAI", "icao": "HECA", "name": "Cairo Intl", "city": "Cairo", "country_iso": "EGY", "lat": 30.1219, "lon": 31.4056, "elevation_ft": 382, "airport_type": "large_airport", "pax_annual": 22.1, "runways": 3, "continent": "AF"},
    {"iata": "ADD", "icao": "HAAB", "name": "Addis Ababa Bole Intl", "city": "Addis Ababa", "country_iso": "ETH", "lat": 8.9779, "lon": 38.7993, "elevation_ft": 7625, "airport_type": "large_airport", "pax_annual": 15.3, "runways": 2, "continent": "AF"},
    {"iata": "CMN", "icao": "GMMN", "name": "Casablanca Mohammed V Intl", "city": "Casablanca", "country_iso": "MAR", "lat": 33.3675, "lon": -7.5898, "elevation_ft": 656, "airport_type": "large_airport", "pax_annual": 10.3, "runways": 2, "continent": "AF"},
    {"iata": "NBO", "icao": "HKJK", "name": "Nairobi Jomo Kenyatta Intl", "city": "Nairobi", "country_iso": "KEN", "lat": -1.3192, "lon": 36.9278, "elevation_ft": 5327, "airport_type": "large_airport", "pax_annual": 8.1, "runways": 1, "continent": "AF"},
    {"iata": "LOS", "icao": "DNMM", "name": "Lagos Murtala Muhammed Intl", "city": "Lagos", "country_iso": "NGA", "lat": 6.5774, "lon": 3.3215, "elevation_ft": 135, "airport_type": "large_airport", "pax_annual": 9.2, "runways": 2, "continent": "AF"},
    {"iata": "CPT", "icao": "FACT", "name": "Cape Town Intl", "city": "Cape Town", "country_iso": "ZAF", "lat": -33.9715, "lon": 18.6021, "elevation_ft": 151, "airport_type": "large_airport", "pax_annual": 10.8, "runways": 1, "continent": "AF"},
    {"iata": "ALG", "icao": "DAAG", "name": "Algiers Houari Boumediene", "city": "Algiers", "country_iso": "DZA", "lat": 36.6910, "lon": 3.2154, "elevation_ft": 82, "airport_type": "large_airport", "pax_annual": 10.0, "runways": 2, "continent": "AF"},
    {"iata": "DAR", "icao": "HTDA", "name": "Dar es Salaam Julius Nyerere Intl", "city": "Dar es Salaam", "country_iso": "TZA", "lat": -6.8781, "lon": 39.2026, "elevation_ft": 186, "airport_type": "medium_airport", "pax_annual": 4.2, "runways": 1, "continent": "AF"},
    {"iata": "ACC", "icao": "DGAA", "name": "Accra Kotoka Intl", "city": "Accra", "country_iso": "GHA", "lat": 5.6052, "lon": -0.1668, "elevation_ft": 205, "airport_type": "large_airport", "pax_annual": 3.4, "runways": 1, "continent": "AF"},

    # ── Central Asia & Russia ──
    {"iata": "LED", "icao": "ULLI", "name": "St Petersburg Pulkovo", "city": "St Petersburg", "country_iso": "RUS", "lat": 59.8003, "lon": 30.2625, "elevation_ft": 78, "airport_type": "large_airport", "pax_annual": 19.6, "runways": 2, "continent": "EU"},
    {"iata": "DME", "icao": "UUDD", "name": "Moscow Domodedovo", "city": "Moscow", "country_iso": "RUS", "lat": 55.4088, "lon": 37.9063, "elevation_ft": 588, "airport_type": "large_airport", "pax_annual": 30.3, "runways": 2, "continent": "EU"},
    {"iata": "ALA", "icao": "UAAA", "name": "Almaty Intl", "city": "Almaty", "country_iso": "KAZ", "lat": 43.3521, "lon": 77.0405, "elevation_ft": 2234, "airport_type": "large_airport", "pax_annual": 7.5, "runways": 1, "continent": "AS"},
    {"iata": "TAS", "icao": "UTTT", "name": "Tashkent Intl", "city": "Tashkent", "country_iso": "UZB", "lat": 41.2579, "lon": 69.2812, "elevation_ft": 1417, "airport_type": "large_airport", "pax_annual": 5.0, "runways": 1, "continent": "AS"},
]


def seed_airports():
    """Seed airport data into the database."""
    db = SessionLocal()

    try:
        for airport_data in AIRPORTS_DATA:
            existing = db.query(Airport).filter(Airport.iata == airport_data["iata"]).first()

            if existing:
                for key, value in airport_data.items():
                    setattr(existing, key, value)
            else:
                airport = Airport(**airport_data)
                db.add(airport)

        db.commit()
        logger.info(f"Seeded {len(AIRPORTS_DATA)} airports")

    finally:
        db.close()

    return len(AIRPORTS_DATA)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    seed_airports()

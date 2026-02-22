/**
 * Major world airports for the GEFO globe overlay.
 * Curated list of ~120 busiest/most significant international airports.
 * Source: public domain airport data (OurAirports, Wikipedia).
 */

export interface Airport {
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  /** Approximate annual passengers in millions */
  pax: number;
}

export const MAJOR_AIRPORTS: Airport[] = [
  // North America
  { iata: "ATL", name: "Hartsfield-Jackson", city: "Atlanta", country: "USA", lat: 33.6407, lon: -84.4277, pax: 93.7 },
  { iata: "DFW", name: "Dallas/Fort Worth", city: "Dallas", country: "USA", lat: 32.8998, lon: -97.0403, pax: 73.4 },
  { iata: "DEN", name: "Denver Intl", city: "Denver", country: "USA", lat: 39.8561, lon: -104.6737, pax: 69.3 },
  { iata: "ORD", name: "O'Hare", city: "Chicago", country: "USA", lat: 41.9742, lon: -87.9073, pax: 83.2 },
  { iata: "LAX", name: "Los Angeles Intl", city: "Los Angeles", country: "USA", lat: 33.9425, lon: -118.4081, pax: 88.1 },
  { iata: "JFK", name: "John F. Kennedy", city: "New York", country: "USA", lat: 40.6413, lon: -73.7781, pax: 62.5 },
  { iata: "SFO", name: "San Francisco Intl", city: "San Francisco", country: "USA", lat: 37.6213, lon: -122.379, pax: 57.5 },
  { iata: "SEA", name: "Seattle-Tacoma", city: "Seattle", country: "USA", lat: 47.4502, lon: -122.3088, pax: 50.6 },
  { iata: "MIA", name: "Miami Intl", city: "Miami", country: "USA", lat: 25.7959, lon: -80.2870, pax: 52.0 },
  { iata: "EWR", name: "Newark Liberty", city: "Newark", country: "USA", lat: 40.6895, lon: -74.1745, pax: 46.3 },
  { iata: "MCO", name: "Orlando Intl", city: "Orlando", country: "USA", lat: 28.4312, lon: -81.3081, pax: 57.8 },
  { iata: "IAH", name: "George Bush Intercontinental", city: "Houston", country: "USA", lat: 29.9902, lon: -95.3368, pax: 45.3 },
  { iata: "YYZ", name: "Toronto Pearson", city: "Toronto", country: "CAN", lat: 43.6777, lon: -79.6248, pax: 50.5 },
  { iata: "YVR", name: "Vancouver Intl", city: "Vancouver", country: "CAN", lat: 49.1947, lon: -123.1792, pax: 26.4 },
  { iata: "MEX", name: "Mexico City Intl", city: "Mexico City", country: "MEX", lat: 19.4363, lon: -99.0721, pax: 52.9 },
  { iata: "CUN", name: "Cancún Intl", city: "Cancún", country: "MEX", lat: 21.0365, lon: -86.8771, pax: 31.2 },

  // Europe
  { iata: "LHR", name: "Heathrow", city: "London", country: "GBR", lat: 51.4700, lon: -0.4543, pax: 79.2 },
  { iata: "CDG", name: "Charles de Gaulle", city: "Paris", country: "FRA", lat: 49.0097, lon: 2.5479, pax: 76.2 },
  { iata: "IST", name: "Istanbul Airport", city: "Istanbul", country: "TUR", lat: 41.2753, lon: 28.7519, pax: 76.0 },
  { iata: "AMS", name: "Schiphol", city: "Amsterdam", country: "NLD", lat: 52.3105, lon: 4.7683, pax: 71.7 },
  { iata: "FRA", name: "Frankfurt", city: "Frankfurt", country: "DEU", lat: 50.0379, lon: 8.5622, pax: 69.4 },
  { iata: "MAD", name: "Barajas", city: "Madrid", country: "ESP", lat: 40.4719, lon: -3.5626, pax: 60.2 },
  { iata: "BCN", name: "El Prat", city: "Barcelona", country: "ESP", lat: 41.2974, lon: 2.0833, pax: 52.7 },
  { iata: "FCO", name: "Fiumicino", city: "Rome", country: "ITA", lat: 41.8003, lon: 12.2389, pax: 49.4 },
  { iata: "MUC", name: "Munich", city: "Munich", country: "DEU", lat: 48.3537, lon: 11.7750, pax: 47.9 },
  { iata: "LGW", name: "Gatwick", city: "London", country: "GBR", lat: 51.1537, lon: -0.1821, pax: 40.9 },
  { iata: "ZRH", name: "Zürich", city: "Zürich", country: "CHE", lat: 47.4647, lon: 8.5492, pax: 31.5 },
  { iata: "CPH", name: "Copenhagen", city: "Copenhagen", country: "DNK", lat: 55.6181, lon: 12.6561, pax: 30.3 },
  { iata: "DUB", name: "Dublin", city: "Dublin", country: "IRL", lat: 53.4264, lon: -6.2499, pax: 32.9 },
  { iata: "VIE", name: "Vienna Intl", city: "Vienna", country: "AUT", lat: 48.1103, lon: 16.5697, pax: 31.7 },
  { iata: "OSL", name: "Oslo Gardermoen", city: "Oslo", country: "NOR", lat: 60.1976, lon: 11.1004, pax: 28.6 },
  { iata: "ARN", name: "Arlanda", city: "Stockholm", country: "SWE", lat: 59.6498, lon: 17.9238, pax: 26.8 },
  { iata: "BRU", name: "Brussels", city: "Brussels", country: "BEL", lat: 50.9014, lon: 4.4844, pax: 25.7 },
  { iata: "HEL", name: "Helsinki-Vantaa", city: "Helsinki", country: "FIN", lat: 60.3172, lon: 24.9633, pax: 22.0 },
  { iata: "WAW", name: "Chopin", city: "Warsaw", country: "POL", lat: 52.1657, lon: 20.9671, pax: 18.9 },
  { iata: "LIS", name: "Humberto Delgado", city: "Lisbon", country: "PRT", lat: 38.7742, lon: -9.1342, pax: 31.2 },
  { iata: "ATH", name: "Eleftherios Venizelos", city: "Athens", country: "GRC", lat: 37.9364, lon: 23.9445, pax: 28.2 },
  { iata: "SVO", name: "Sheremetyevo", city: "Moscow", country: "RUS", lat: 55.9726, lon: 37.4146, pax: 49.9 },

  // Middle East
  { iata: "DXB", name: "Dubai Intl", city: "Dubai", country: "ARE", lat: 25.2528, lon: 55.3644, pax: 87.0 },
  { iata: "DOH", name: "Hamad Intl", city: "Doha", country: "QAT", lat: 25.2731, lon: 51.6081, pax: 46.1 },
  { iata: "AUH", name: "Abu Dhabi Intl", city: "Abu Dhabi", country: "ARE", lat: 24.4331, lon: 54.6511, pax: 24.5 },
  { iata: "JED", name: "King Abdulaziz", city: "Jeddah", country: "SAU", lat: 21.6796, lon: 39.1565, pax: 46.4 },
  { iata: "RUH", name: "King Khalid", city: "Riyadh", country: "SAU", lat: 24.9576, lon: 46.6988, pax: 29.5 },
  { iata: "TLV", name: "Ben Gurion", city: "Tel Aviv", country: "ISR", lat: 32.0114, lon: 34.8867, pax: 25.0 },

  // Asia-Pacific
  { iata: "PEK", name: "Beijing Capital", city: "Beijing", country: "CHN", lat: 40.0799, lon: 116.6031, pax: 100.0 },
  { iata: "PKX", name: "Beijing Daxing", city: "Beijing", country: "CHN", lat: 39.5098, lon: 116.4105, pax: 39.1 },
  { iata: "HND", name: "Haneda", city: "Tokyo", country: "JPN", lat: 35.5494, lon: 139.7798, pax: 87.1 },
  { iata: "PVG", name: "Pudong", city: "Shanghai", country: "CHN", lat: 31.1443, lon: 121.8083, pax: 76.2 },
  { iata: "CAN", name: "Baiyun", city: "Guangzhou", country: "CHN", lat: 23.3924, lon: 113.2988, pax: 73.4 },
  { iata: "SIN", name: "Changi", city: "Singapore", country: "SGP", lat: 1.3644, lon: 103.9915, pax: 68.3 },
  { iata: "ICN", name: "Incheon Intl", city: "Seoul", country: "KOR", lat: 37.4602, lon: 126.4407, pax: 71.2 },
  { iata: "BKK", name: "Suvarnabhumi", city: "Bangkok", country: "THA", lat: 13.6900, lon: 100.7501, pax: 65.4 },
  { iata: "DEL", name: "Indira Gandhi", city: "Delhi", country: "IND", lat: 28.5562, lon: 77.1000, pax: 72.3 },
  { iata: "BOM", name: "Chhatrapati Shivaji", city: "Mumbai", country: "IND", lat: 19.0896, lon: 72.8656, pax: 51.8 },
  { iata: "HKG", name: "Hong Kong Intl", city: "Hong Kong", country: "CHN", lat: 22.3080, lon: 113.9185, pax: 50.9 },
  { iata: "KUL", name: "Kuala Lumpur Intl", city: "Kuala Lumpur", country: "MYS", lat: 2.7456, lon: 101.7099, pax: 62.3 },
  { iata: "NRT", name: "Narita", city: "Tokyo", country: "JPN", lat: 35.7647, lon: 140.3864, pax: 35.5 },
  { iata: "CGK", name: "Soekarno-Hatta", city: "Jakarta", country: "IDN", lat: -6.1256, lon: 106.6558, pax: 65.0 },
  { iata: "MNL", name: "Ninoy Aquino", city: "Manila", country: "PHL", lat: 14.5086, lon: 121.0197, pax: 47.9 },
  { iata: "SYD", name: "Kingsford Smith", city: "Sydney", country: "AUS", lat: -33.9461, lon: 151.1772, pax: 44.4 },
  { iata: "MEL", name: "Melbourne Tullamarine", city: "Melbourne", country: "AUS", lat: -37.6690, lon: 144.8410, pax: 37.7 },
  { iata: "AKL", name: "Auckland Intl", city: "Auckland", country: "NZL", lat: -37.0082, lon: 174.7850, pax: 21.4 },
  { iata: "TPE", name: "Taiwan Taoyuan", city: "Taipei", country: "TWN", lat: 25.0797, lon: 121.2342, pax: 48.7 },
  { iata: "BLR", name: "Kempegowda", city: "Bengaluru", country: "IND", lat: 13.1986, lon: 77.7066, pax: 37.5 },
  { iata: "CTU", name: "Chengdu Tianfu", city: "Chengdu", country: "CHN", lat: 30.3145, lon: 104.4432, pax: 60.2 },
  { iata: "SZX", name: "Bao'an", city: "Shenzhen", country: "CHN", lat: 22.6393, lon: 113.8107, pax: 52.9 },

  // South America
  { iata: "GRU", name: "Guarulhos", city: "São Paulo", country: "BRA", lat: -23.4356, lon: -46.4731, pax: 41.3 },
  { iata: "BOG", name: "El Dorado", city: "Bogotá", country: "COL", lat: 4.7016, lon: -74.1469, pax: 38.1 },
  { iata: "SCL", name: "Arturo Merino Benítez", city: "Santiago", country: "CHL", lat: -33.3930, lon: -70.7858, pax: 24.0 },
  { iata: "EZE", name: "Ministro Pistarini", city: "Buenos Aires", country: "ARG", lat: -34.8222, lon: -58.5358, pax: 14.2 },
  { iata: "LIM", name: "Jorge Chávez", city: "Lima", country: "PER", lat: -12.0219, lon: -77.1143, pax: 24.8 },
  { iata: "GIG", name: "Galeão", city: "Rio de Janeiro", country: "BRA", lat: -22.8100, lon: -43.2506, pax: 16.1 },
  { iata: "PTY", name: "Tocumen Intl", city: "Panama City", country: "PAN", lat: 9.0714, lon: -79.3835, pax: 16.7 },

  // Africa
  { iata: "JNB", name: "O.R. Tambo", city: "Johannesburg", country: "ZAF", lat: -26.1392, lon: 28.2460, pax: 21.7 },
  { iata: "CAI", name: "Cairo Intl", city: "Cairo", country: "EGY", lat: 30.1219, lon: 31.4056, pax: 22.1 },
  { iata: "ADD", name: "Bole Intl", city: "Addis Ababa", country: "ETH", lat: 8.9779, lon: 38.7993, pax: 15.3 },
  { iata: "CMN", name: "Mohammed V", city: "Casablanca", country: "MAR", lat: 33.3675, lon: -7.5898, pax: 10.3 },
  { iata: "NBO", name: "Jomo Kenyatta", city: "Nairobi", country: "KEN", lat: -1.3192, lon: 36.9278, pax: 8.1 },
  { iata: "LOS", name: "Murtala Muhammed", city: "Lagos", country: "NGA", lat: 6.5774, lon: 3.3215, pax: 9.2 },
  { iata: "CPT", name: "Cape Town Intl", city: "Cape Town", country: "ZAF", lat: -33.9715, lon: 18.6021, pax: 10.8 },
  { iata: "ALG", name: "Houari Boumediene", city: "Algiers", country: "DZA", lat: 36.6910, lon: 3.2154, pax: 10.0 },
  { iata: "DAR", name: "Julius Nyerere", city: "Dar es Salaam", country: "TZA", lat: -6.8781, lon: 39.2026, pax: 4.2 },
  { iata: "ACC", name: "Kotoka Intl", city: "Accra", country: "GHA", lat: 5.6052, lon: -0.1668, pax: 3.4 },

  // Central Asia & Others
  { iata: "LED", name: "Pulkovo", city: "St Petersburg", country: "RUS", lat: 59.8003, lon: 30.2625, pax: 19.6 },
  { iata: "DME", name: "Domodedovo", city: "Moscow", country: "RUS", lat: 55.4088, lon: 37.9063, pax: 30.3 },
  { iata: "ALA", name: "Almaty Intl", city: "Almaty", country: "KAZ", lat: 43.3521, lon: 77.0405, pax: 7.5 },
  { iata: "TAS", name: "Tashkent Intl", city: "Tashkent", country: "UZB", lat: 41.2579, lon: 69.2812, pax: 5.0 },
];

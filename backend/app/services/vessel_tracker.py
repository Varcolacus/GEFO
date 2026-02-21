"""
Real-time vessel tracker using AISstream.io WebSocket API.

When AISSTREAM_API_KEY is configured in settings, connects to the live
AIS data stream and broadcasts vessel positions to GEFO frontend clients.
When no key is provided, runs a high-fidelity simulator that moves
vessels along major shipping lanes with realistic speeds and headings.

AISstream.io provides free real-time AIS data:
  - Sign up at https://aisstream.io to get an API key
  - Set env var AISSTREAM_API_KEY=<your-key>
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import random
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from app.core.websocket_manager import manager

logger = logging.getLogger("gefo.vessels")


# ── Vessel types and their visual properties ──

VESSEL_TYPES = {
    "cargo":   {"color": "#22d3ee", "label": "Cargo",   "icon": "🚢"},
    "tanker":  {"color": "#f97316", "label": "Tanker",  "icon": "🛢"},
    "container": {"color": "#10b981", "label": "Container", "icon": "📦"},
    "bulk":    {"color": "#a78bfa", "label": "Bulk Carrier", "icon": "⛴"},
    "lng":     {"color": "#38bdf8", "label": "LNG",     "icon": "❄"},
    "passenger": {"color": "#f472b6", "label": "Passenger", "icon": "🚤"},
    "fishing": {"color": "#84cc16", "label": "Fishing",  "icon": "🎣"},
    "military": {"color": "#ef4444", "label": "Military", "icon": "⚓"},
    "other":   {"color": "#94a3b8", "label": "Other",   "icon": "🔹"},
}


@dataclass
class VesselPosition:
    """A single vessel's current state."""
    mmsi: str                 # Maritime Mobile Service Identity (9-digit)
    name: str
    vessel_type: str          # one of VESSEL_TYPES keys
    lat: float
    lon: float
    speed_knots: float        # speed over ground
    heading: float            # degrees 0-360
    destination: str = ""
    flag_iso: str = ""
    length_m: float = 0
    draught_m: float = 0
    last_update: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {
            "mmsi": self.mmsi,
            "name": self.name,
            "vessel_type": self.vessel_type,
            "lat": round(self.lat, 5),
            "lon": round(self.lon, 5),
            "speed_knots": round(self.speed_knots, 1),
            "heading": round(self.heading, 1),
            "destination": self.destination,
            "flag_iso": self.flag_iso,
            "length_m": self.length_m,
            "draught_m": self.draught_m,
            "last_update": self.last_update,
        }


# ── Major shipping routes as waypoint chains ──
# Each route is a list of (lat, lon) waypoints that vessels follow

SHIPPING_ROUTES: Dict[str, List[Tuple[float, float]]] = {
    # Trans-Pacific: Shanghai → LA
    "trans_pacific_east": [
        (31.2, 121.5), (33.0, 130.0), (35.0, 140.0), (38.0, 155.0),
        (40.0, 170.0), (38.0, -175.0), (36.0, -160.0), (35.0, -145.0),
        (34.0, -130.0), (33.7, -118.3),
    ],
    # Trans-Pacific: LA → Shanghai
    "trans_pacific_west": [
        (33.7, -118.3), (34.0, -130.0), (35.0, -145.0), (36.0, -160.0),
        (38.0, -175.0), (40.0, 170.0), (38.0, 155.0), (35.0, 140.0),
        (33.0, 130.0), (31.2, 121.5),
    ],
    # Asia-Europe via Suez: Singapore → Suez → Rotterdam
    "asia_europe": [
        (1.3, 103.8), (5.0, 95.0), (10.0, 80.0), (12.0, 55.0),
        (12.5, 45.0), (14.0, 43.0), (28.5, 33.0), (30.5, 32.3),
        (31.3, 32.3), (35.0, 25.0), (36.0, 14.0), (37.5, 5.0),
        (36.0, -5.5), (43.0, -9.0), (48.0, -5.0), (51.0, 2.0),
        (51.9, 4.1),
    ],
    # Europe-Asia via Suez: Rotterdam → Suez → Singapore
    "europe_asia": [
        (51.9, 4.1), (51.0, 2.0), (48.0, -5.0), (43.0, -9.0),
        (36.0, -5.5), (37.5, 5.0), (36.0, 14.0), (35.0, 25.0),
        (31.3, 32.3), (30.5, 32.3), (28.5, 33.0), (14.0, 43.0),
        (12.5, 45.0), (12.0, 55.0), (10.0, 80.0), (5.0, 95.0),
        (1.3, 103.8),
    ],
    # Trans-Atlantic: Rotterdam → New York
    "trans_atlantic_west": [
        (51.9, 4.1), (51.0, -1.0), (50.0, -8.0), (49.0, -20.0),
        (45.0, -35.0), (42.0, -50.0), (40.5, -65.0), (40.5, -74.0),
    ],
    # Trans-Atlantic: New York → Rotterdam
    "trans_atlantic_east": [
        (40.5, -74.0), (40.5, -65.0), (42.0, -50.0), (45.0, -35.0),
        (49.0, -20.0), (50.0, -8.0), (51.0, -1.0), (51.9, 4.1),
    ],
    # Persian Gulf → East Asia
    "gulf_asia": [
        (26.5, 50.2), (25.5, 56.5), (22.0, 60.0), (15.0, 65.0),
        (10.0, 75.0), (5.0, 80.0), (1.3, 103.8), (5.0, 110.0),
        (10.0, 115.0), (22.0, 114.2),
    ],
    # East Asia → Persian Gulf
    "asia_gulf": [
        (22.0, 114.2), (10.0, 115.0), (5.0, 110.0), (1.3, 103.8),
        (5.0, 80.0), (10.0, 75.0), (15.0, 65.0), (22.0, 60.0),
        (25.5, 56.5), (26.5, 50.2),
    ],
    # Brazil → China (iron ore / soybeans)
    "brazil_china": [
        (-23.9, -46.3), (-22.0, -40.0), (-15.0, -25.0), (-5.0, -10.0),
        (5.0, 10.0), (-10.0, 40.0), (-20.0, 60.0), (-15.0, 80.0),
        (-5.0, 95.0), (1.3, 103.8), (10.0, 115.0), (22.5, 114.2),
    ],
    # Australia → China (coal / iron ore)
    "australia_china": [
        (-20.3, 118.6), (-15.0, 118.0), (-10.0, 115.0), (-5.0, 112.0),
        (1.3, 108.0), (10.0, 114.0), (22.5, 114.2),
    ],
    # Cape of Good Hope route
    "cape_route": [
        (1.3, 103.8), (0.0, 80.0), (-10.0, 60.0), (-25.0, 40.0),
        (-34.5, 18.5), (-30.0, 0.0), (-15.0, -20.0), (0.0, -30.0),
        (20.0, -40.0), (35.0, -40.0), (43.0, -20.0), (48.0, -5.0),
        (51.9, 4.1),
    ],
    # Intra-Asia: Japan-Korea-China-ASEAN loop
    "intra_asia": [
        (35.4, 139.8), (34.0, 132.0), (35.1, 129.0), (31.2, 121.5),
        (22.3, 114.2), (10.0, 107.0), (1.3, 103.8), (5.0, 110.0),
        (10.0, 118.0), (22.3, 114.2), (31.2, 121.5), (35.1, 129.0),
        (35.4, 139.8),
    ],
    # Panama Canal route: East Asia → US East Coast
    "panama_east": [
        (31.2, 121.5), (33.0, 140.0), (30.0, 160.0), (20.0, -170.0),
        (15.0, -150.0), (10.0, -120.0), (9.0, -79.5), (10.0, -78.0),
        (15.0, -75.0), (25.0, -75.0), (32.0, -80.0), (40.5, -74.0),
    ],
    # Mediterranean loop
    "mediterranean": [
        (36.0, -5.5), (36.5, -2.0), (38.0, 3.0), (41.0, 9.0),
        (38.0, 13.0), (35.5, 15.0), (35.0, 25.0), (38.0, 27.0),
        (41.0, 29.0), (38.0, 27.0), (35.0, 25.0), (35.5, 15.0),
        (38.0, 13.0), (41.0, 9.0), (38.0, 3.0), (36.5, -2.0),
        (36.0, -5.5),
    ],
    # North Sea / Baltic
    "north_sea_baltic": [
        (51.9, 4.1), (53.5, 8.0), (54.5, 10.0), (55.7, 12.6),
        (57.7, 12.0), (59.3, 18.1), (60.2, 25.0), (59.3, 18.1),
        (57.7, 12.0), (55.7, 12.6), (54.5, 10.0), (53.5, 8.0),
        (51.9, 4.1),
    ],
}

# Vessel name pools per type
VESSEL_NAMES = {
    "container": [
        "Ever Given", "MSC Gülsün", "HMM Algeciras", "CMA CGM Jacques Saadé",
        "OOCL Hong Kong", "Cosco Shipping Universe", "MOL Triumph",
        "Madrid Maersk", "MSC Isabella", "Ever Ace", "ONE Innovation",
        "Hapag-Lloyd Berlin Express", "Yang Ming Warranty", "ZIM Sammy Ofer",
        "MSC Tessa", "Ever Forward", "MSC Irina", "Evergreen Triton",
    ],
    "tanker": [
        "Knock Nevis", "TI Europe", "Seawise Giant", "Jahre Viking",
        "Nissos Therassia", "Minerva Gloria", "Eagle Vancouver",
        "Maran Tankers Poseidon", "Olympic Lion", "Euronav Carthage",
        "Stena Vision", "Torm Hellerup", "Teekay Cougar", "DHT Hawk",
    ],
    "cargo": [
        "Global Mercy", "Atlantic Star", "Pacific Explorer",
        "Nordic Breeze", "Baltic Phoenix", "Arabian Wind",
        "Oceanic Progress", "Cape Victory", "Coral Enterprise",
        "Golden Horizon", "Silver Bay", "Arctic Pioneer",
    ],
    "bulk": [
        "Valemax Brasil", "Cape Tsubaki", "Mineral New York",
        "Pacific Basin Dalian", "Star Bulk Hercules", "Oldendorff Alster",
        "Golden Ocean Baltic", "Navios Pollux", "Pan Ocean Dignity",
        "Berge Stahl", "Ore Brasil", "CSL Welland",
    ],
    "lng": [
        "Mozah", "Al Dafna", "Creole Spirit", "British Emerald",
        "Gaslog Salem", "Flex Freedom", "Dynagas Lena River",
        "Mitsui Genesis", "LNG Jurojin", "Cool Discoverer",
    ],
    "passenger": [
        "Symphony of the Seas", "Wonder of the Seas", "MSC World Europa",
        "Celebrity Edge", "Norwegian Prima", "AIDAnova", "Costa Smeralda",
    ],
}

FLAG_POOLS = [
    "PAN", "LBR", "MHL", "HKG", "SGP", "BHS", "MLT", "GRC",
    "CHN", "NOR", "JPN", "GBR", "DEU", "CYP", "DNK", "KOR",
    "USA", "ITA", "TUR", "IND", "BEL", "NLD", "FRA",
]


@dataclass
class SimulatedVessel:
    """A vessel being simulated along a route."""
    position: VesselPosition
    route_name: str
    waypoints: List[Tuple[float, float]]
    current_segment: int = 0
    segment_progress: float = 0.0  # 0.0 to 1.0 along current segment
    base_speed: float = 14.0       # base speed in knots


class VesselTracker:
    """
    Manages real-time vessel tracking.

    Connects to AISstream.io for live AIS data when configured,
    otherwise runs a high-fidelity route-based simulator.
    """

    MAX_VESSELS = 200        # cap to avoid overloading the frontend
    BROADCAST_INTERVAL = 3   # seconds between WebSocket broadcasts
    SIM_UPDATE_INTERVAL = 2  # seconds between simulation ticks

    def __init__(self, aisstream_api_key: str = ""):
        self._api_key = aisstream_api_key
        self._vessels: Dict[str, VesselPosition] = {}
        self._sim_vessels: List[SimulatedVessel] = []
        self._running = False
        self._tasks: List[asyncio.Task] = []
        self._lock = asyncio.Lock()

    @property
    def is_live(self) -> bool:
        return bool(self._api_key)

    def start(self) -> None:
        """Start the tracker (called during app startup)."""
        if self._running:
            return
        self._running = True

        if self._api_key:
            logger.info("VesselTracker starting in LIVE mode (AISstream.io)")
            self._tasks.append(asyncio.ensure_future(self._ais_stream_loop()))
        else:
            logger.info("VesselTracker starting in SIMULATION mode (no API key)")
            self._init_simulated_fleet()
            self._tasks.append(asyncio.ensure_future(self._sim_loop()))

        # Always run the broadcaster
        self._tasks.append(asyncio.ensure_future(self._broadcast_loop()))

    def stop(self) -> None:
        """Stop the tracker (called during app shutdown)."""
        self._running = False
        for task in self._tasks:
            task.cancel()
        self._tasks.clear()
        logger.info("VesselTracker stopped")

    def get_vessels(self) -> List[dict]:
        """Get current snapshot of all tracked vessels."""
        cutoff = time.time() - 300  # 5min stale threshold
        return [
            v.to_dict() for v in self._vessels.values()
            if v.last_update > cutoff
        ]

    def get_stats(self) -> dict:
        """Get tracker statistics."""
        by_type: Dict[str, int] = {}
        for v in self._vessels.values():
            by_type[v.vessel_type] = by_type.get(v.vessel_type, 0) + 1
        return {
            "mode": "live" if self.is_live else "simulation",
            "total_vessels": len(self._vessels),
            "by_type": by_type,
            "routes_active": len(SHIPPING_ROUTES) if not self.is_live else 0,
        }

    # ── AISstream.io live data ──

    async def _ais_stream_loop(self) -> None:
        """Connect to AISstream.io WebSocket and receive real AIS messages."""
        import websockets  # type: ignore

        url = "wss://stream.aisstream.io/v0/stream"
        subscribe_msg = json.dumps({
            "APIKey": self._api_key,
            "BoundingBoxes": [[[-90, -180], [90, 180]]],  # global
            "FilterMessageTypes": ["PositionReport", "ShipStaticData"],
        })

        while self._running:
            try:
                async with websockets.connect(url) as ws:
                    await ws.send(subscribe_msg)
                    logger.info("Connected to AISstream.io WebSocket")

                    async for raw in ws:
                        if not self._running:
                            break
                        try:
                            msg = json.loads(raw)
                            await self._process_ais_message(msg)
                        except Exception as e:
                            logger.debug(f"AIS message parse error: {e}")

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"AISstream connection error: {e}, reconnecting in 10s")
                await asyncio.sleep(10)

    async def _process_ais_message(self, msg: dict) -> None:
        """Process a single AIS message from aisstream.io."""
        msg_type = msg.get("MessageType", "")
        meta = msg.get("MetaData", {})
        mmsi = str(meta.get("MMSI", ""))
        if not mmsi:
            return

        async with self._lock:
            if msg_type == "PositionReport":
                pos_report = msg.get("Message", {}).get("PositionReport", {})
                lat = pos_report.get("Latitude", 0)
                lon = pos_report.get("Longitude", 0)

                if lat == 0 and lon == 0:
                    return  # invalid position

                if mmsi in self._vessels:
                    v = self._vessels[mmsi]
                    v.lat = lat
                    v.lon = lon
                    v.speed_knots = pos_report.get("Sog", v.speed_knots)
                    v.heading = pos_report.get("TrueHeading", pos_report.get("Cog", v.heading))
                    v.last_update = time.time()
                elif len(self._vessels) < self.MAX_VESSELS:
                    ship_name = meta.get("ShipName", f"VESSEL-{mmsi[-4:]}")
                    vtype = self._ais_type_to_gefo(meta.get("ShipType", 0))
                    self._vessels[mmsi] = VesselPosition(
                        mmsi=mmsi,
                        name=ship_name.strip(),
                        vessel_type=vtype,
                        lat=lat,
                        lon=lon,
                        speed_knots=pos_report.get("Sog", 0),
                        heading=pos_report.get("TrueHeading", pos_report.get("Cog", 0)),
                        flag_iso=meta.get("country_iso", ""),
                    )

            elif msg_type == "ShipStaticData":
                static = msg.get("Message", {}).get("ShipStaticData", {})
                if mmsi in self._vessels:
                    v = self._vessels[mmsi]
                    v.name = static.get("Name", v.name).strip()
                    v.destination = static.get("Destination", "").strip()
                    dim = static.get("Dimension", {})
                    if dim:
                        v.length_m = dim.get("A", 0) + dim.get("B", 0)
                        v.draught_m = static.get("MaximumStaticDraught", 0) / 10

    @staticmethod
    def _ais_type_to_gefo(ais_type: int) -> str:
        """Map AIS ship type number to our type categories."""
        if 70 <= ais_type <= 79:
            return "cargo"
        elif 80 <= ais_type <= 89:
            return "tanker"
        elif ais_type in (60, 61, 62, 63, 64, 65, 66, 67, 68, 69):
            return "passenger"
        elif 30 <= ais_type <= 39:
            return "fishing"
        elif 35 <= ais_type <= 39:
            return "military"
        # Container ships are typically type 70-79 but we differentiate by name
        return "cargo"

    # ── Simulation mode ──

    def _init_simulated_fleet(self) -> None:
        """Create a fleet of simulated vessels distributed across routes."""
        mmsi_counter = 200000000

        # Distribute vessels across routes
        route_vessel_counts = {
            "trans_pacific_east": 12, "trans_pacific_west": 10,
            "asia_europe": 14, "europe_asia": 12,
            "trans_atlantic_west": 6, "trans_atlantic_east": 6,
            "gulf_asia": 10, "asia_gulf": 8,
            "brazil_china": 5, "australia_china": 7,
            "cape_route": 4, "intra_asia": 15,
            "panama_east": 6, "mediterranean": 10,
            "north_sea_baltic": 8,
        }

        type_weights = {
            "container": 0.35, "tanker": 0.20, "bulk": 0.15,
            "cargo": 0.15, "lng": 0.08, "passenger": 0.07,
        }
        type_list = list(type_weights.keys())
        type_probs = list(type_weights.values())

        for route_name, count in route_vessel_counts.items():
            waypoints = SHIPPING_ROUTES.get(route_name, [])
            if not waypoints:
                continue

            for i in range(count):
                mmsi_counter += 1
                mmsi = str(mmsi_counter)

                # Pick vessel type (route-aware)
                if "gulf" in route_name:
                    vtype = random.choices(
                        ["tanker", "lng", "cargo", "bulk"],
                        weights=[0.45, 0.25, 0.15, 0.15]
                    )[0]
                elif "brazil" in route_name or "australia" in route_name:
                    vtype = random.choices(
                        ["bulk", "cargo", "tanker"],
                        weights=[0.6, 0.25, 0.15]
                    )[0]
                elif "mediterranean" in route_name:
                    vtype = random.choices(
                        ["container", "passenger", "cargo", "tanker"],
                        weights=[0.3, 0.2, 0.25, 0.25]
                    )[0]
                else:
                    vtype = random.choices(type_list, weights=type_probs)[0]

                name_pool = VESSEL_NAMES.get(vtype, VESSEL_NAMES["cargo"])
                name = random.choice(name_pool)
                # Add unique suffix if needed
                if i > 0:
                    name = f"{name} {random.choice(['I','II','III','IV','V','VI'])}"

                flag = random.choice(FLAG_POOLS)
                base_speed = {
                    "container": random.uniform(16, 22),
                    "tanker": random.uniform(12, 16),
                    "bulk": random.uniform(12, 15),
                    "cargo": random.uniform(13, 17),
                    "lng": random.uniform(17, 20),
                    "passenger": random.uniform(18, 24),
                }.get(vtype, 14)

                length = {
                    "container": random.uniform(280, 400),
                    "tanker": random.uniform(200, 350),
                    "bulk": random.uniform(200, 340),
                    "cargo": random.uniform(120, 250),
                    "lng": random.uniform(260, 345),
                    "passenger": random.uniform(250, 360),
                }.get(vtype, 180)

                # Start at random position along the route
                total_segs = len(waypoints) - 1
                seg = random.randint(0, max(0, total_segs - 1))
                prog = random.random()

                wp_a = waypoints[seg]
                wp_b = waypoints[min(seg + 1, len(waypoints) - 1)]
                lat = wp_a[0] + (wp_b[0] - wp_a[0]) * prog
                lon = wp_a[1] + (wp_b[1] - wp_a[1]) * prog
                heading = self._compute_heading(wp_a[0], wp_a[1], wp_b[0], wp_b[1])

                # Add slight lateral offset to avoid vessel stacking
                lat += random.uniform(-0.3, 0.3)
                lon += random.uniform(-0.3, 0.3)

                dest_wp = waypoints[-1]
                dest_name = self._nearest_port_name(dest_wp[0], dest_wp[1])

                pos = VesselPosition(
                    mmsi=mmsi,
                    name=name,
                    vessel_type=vtype,
                    lat=lat,
                    lon=lon,
                    speed_knots=base_speed + random.uniform(-2, 2),
                    heading=heading,
                    destination=dest_name,
                    flag_iso=flag,
                    length_m=round(length),
                    draught_m=round(random.uniform(8, 16), 1),
                )
                self._vessels[mmsi] = pos
                self._sim_vessels.append(SimulatedVessel(
                    position=pos,
                    route_name=route_name,
                    waypoints=waypoints,
                    current_segment=seg,
                    segment_progress=prog,
                    base_speed=base_speed,
                ))

        logger.info(f"Initialized {len(self._sim_vessels)} simulated vessels across {len(route_vessel_counts)} routes")

    async def _sim_loop(self) -> None:
        """Update simulated vessel positions along their routes."""
        while self._running:
            try:
                now = time.time()
                for sv in self._sim_vessels:
                    self._advance_vessel(sv)
                    sv.position.last_update = now
                await asyncio.sleep(self.SIM_UPDATE_INTERVAL)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Simulation tick error: {e}")
                await asyncio.sleep(5)

    def _advance_vessel(self, sv: SimulatedVessel) -> None:
        """Move a vessel forward along its route."""
        wps = sv.waypoints
        if len(wps) < 2:
            return

        # Current segment
        a = wps[sv.current_segment]
        b = wps[min(sv.current_segment + 1, len(wps) - 1)]

        # Distance of this segment in nautical miles
        seg_dist_nm = self._haversine_nm(a[0], a[1], b[0], b[1])
        if seg_dist_nm < 0.1:
            seg_dist_nm = 0.1

        # Speed varies with conditions (slight random fluctuation)
        speed = sv.base_speed + random.uniform(-0.5, 0.5)
        speed = max(2.0, speed)

        # Distance covered in this tick (nautical miles per second * interval)
        dist_nm = (speed / 3600) * self.SIM_UPDATE_INTERVAL
        progress_delta = dist_nm / seg_dist_nm

        sv.segment_progress += progress_delta

        # If we've passed the end of current segment, move to next
        while sv.segment_progress >= 1.0 and sv.current_segment < len(wps) - 2:
            sv.segment_progress -= 1.0
            sv.current_segment += 1
            a = wps[sv.current_segment]
            b = wps[min(sv.current_segment + 1, len(wps) - 1)]
            new_seg_dist = self._haversine_nm(a[0], a[1], b[0], b[1])
            if new_seg_dist > 0.1:
                sv.segment_progress = sv.segment_progress * seg_dist_nm / new_seg_dist
                seg_dist_nm = new_seg_dist

        # If at the end, loop back to start
        if sv.current_segment >= len(wps) - 2 and sv.segment_progress >= 1.0:
            sv.current_segment = 0
            sv.segment_progress = 0.0
            a = wps[0]
            b = wps[1]

        # Interpolate position
        a = wps[sv.current_segment]
        b = wps[min(sv.current_segment + 1, len(wps) - 1)]
        t = min(1.0, max(0.0, sv.segment_progress))

        sv.position.lat = a[0] + (b[0] - a[0]) * t + random.uniform(-0.02, 0.02)
        sv.position.lon = a[1] + (b[1] - a[1]) * t + random.uniform(-0.02, 0.02)
        sv.position.heading = self._compute_heading(a[0], a[1], b[0], b[1])
        sv.position.speed_knots = round(speed, 1)

    # ── Broadcasting ──

    async def _broadcast_loop(self) -> None:
        """Periodically broadcast vessel positions to WebSocket clients."""
        while self._running:
            try:
                vessels = self.get_vessels()
                if vessels:
                    await manager.broadcast("vessels", {
                        "type": "vessel_positions",
                        "timestamp": time.time(),
                        "count": len(vessels),
                        "vessels": vessels,
                    })
                await asyncio.sleep(self.BROADCAST_INTERVAL)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.debug(f"Broadcast error: {e}")
                await asyncio.sleep(5)

    # ── Helpers ──

    @staticmethod
    def _haversine_nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate distance in nautical miles between two points."""
        R = 3440.065  # Earth radius in nautical miles
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = math.sin(dlat / 2) ** 2 + \
            math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * \
            math.sin(dlon / 2) ** 2
        return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    @staticmethod
    def _compute_heading(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Compute bearing in degrees from point 1 to point 2."""
        dlon = math.radians(lon2 - lon1)
        lat1r = math.radians(lat1)
        lat2r = math.radians(lat2)
        x = math.sin(dlon) * math.cos(lat2r)
        y = math.cos(lat1r) * math.sin(lat2r) - \
            math.sin(lat1r) * math.cos(lat2r) * math.cos(dlon)
        heading = math.degrees(math.atan2(x, y))
        return (heading + 360) % 360

    @staticmethod
    def _nearest_port_name(lat: float, lon: float) -> str:
        """Return the name of the nearest major port to a waypoint."""
        ports = {
            "Shanghai": (31.2, 121.5), "Singapore": (1.3, 103.8),
            "Rotterdam": (51.9, 4.1), "Los Angeles": (33.7, -118.3),
            "New York": (40.5, -74.0), "Dubai": (25.3, 55.3),
            "Hong Kong": (22.3, 114.2), "Tokyo": (35.4, 139.8),
            "Busan": (35.1, 129.0), "Santos": (-23.9, -46.3),
            "Port Hedland": (-20.3, 118.6), "Ras Tanura": (26.5, 50.2),
            "Hamburg": (53.5, 8.0), "Antwerp": (51.3, 4.3),
            "Piraeus": (37.9, 23.6), "Suez": (30.0, 32.6),
            "Panama": (9.0, -79.5), "Gothenburg": (57.7, 12.0),
        }
        best = "Unknown"
        best_dist = float("inf")
        for name, (plat, plon) in ports.items():
            d = (lat - plat) ** 2 + (lon - plon) ** 2
            if d < best_dist:
                best_dist = d
                best = name
        return best


# ── Singleton ──
vessel_tracker = VesselTracker()

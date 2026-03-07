"""
Real-time aircraft tracker using OpenSky Network API.

OpenSky Network provides free, real-time ADS-B aircraft position data:
  - No API key needed (anonymous access)
  - Rate limit: 10 seconds between requests (anonymous)
  - ~5,000–12,000 aircraft visible at any time
  - Coverage: global via ground-based ADS-B receivers

API docs: https://openskynetwork.github.io/opensky-api/rest.html
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import aiohttp

from app.core.websocket_manager import manager

logger = logging.getLogger("gefo.aircraft")


# ── Aircraft category mapping ──

AIRCRAFT_CATEGORIES = {
    0: "other",
    1: "other",         # No ADS-B emitter category info
    2: "light",         # Light (< 15500 lbs)
    3: "small",         # Small (15500-75000 lbs)
    4: "large",         # Large (75000-300000 lbs)
    5: "heavy",         # High Vortex Large
    6: "heavy",         # Heavy (> 300000 lbs)
    7: "rotorcraft",    # Rotorcraft
    8: "other",         # Balloon/blimp
    9: "other",         # Glider/sailplane
    10: "light",        # Ultralight
    11: "other",        # Parachutist
    12: "other",        # Hang glider
    13: "other",        # Reserved
    14: "other",        # UAV
    15: "other",        # Space vehicle
    16: "other",        # Emergency surface vehicle
    17: "other",        # Service surface vehicle
}

CATEGORY_COLORS = {
    "heavy":      "#ef4444",   # red — large jets (A380, B747, etc.)
    "large":      "#f97316",   # orange — medium jets (A320, B737)
    "small":      "#22d3ee",   # cyan — regional/biz jets
    "light":      "#84cc16",   # lime — small prop planes
    "rotorcraft": "#a78bfa",   # purple — helicopters
    "other":      "#94a3b8",   # gray
}


@dataclass
class AircraftPosition:
    """Represents a single aircraft's position and state."""
    icao24: str
    callsign: str
    origin_country: str
    lat: float
    lon: float
    altitude_m: float          # barometric altitude in meters
    velocity_ms: float         # ground speed in m/s
    heading: float             # true track (clockwise from north)
    vertical_rate: float       # vertical rate in m/s
    on_ground: bool
    category: str              # heavy, large, small, light, rotorcraft, other
    last_update: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {
            "icao24": self.icao24,
            "callsign": self.callsign.strip(),
            "origin_country": self.origin_country,
            "lat": round(self.lat, 4),
            "lon": round(self.lon, 4),
            "altitude_m": round(self.altitude_m, 0) if self.altitude_m else 0,
            "altitude_ft": round(self.altitude_m * 3.28084, 0) if self.altitude_m else 0,
            "velocity_knots": round(self.velocity_ms * 1.94384, 1) if self.velocity_ms else 0,
            "velocity_kmh": round(self.velocity_ms * 3.6, 0) if self.velocity_ms else 0,
            "heading": round(self.heading, 1) if self.heading is not None else 0,
            "vertical_rate": round(self.vertical_rate, 1) if self.vertical_rate else 0,
            "on_ground": self.on_ground,
            "category": self.category,
            "last_update": self.last_update,
        }


class AircraftTracker:
    """
    Tracks aircraft positions using airplanes.live API (primary)
    with OpenSky Network as fallback.

    airplanes.live provides free ADS-B data with generous rate limits.
    We query multiple geographic zones to build global coverage.
    """

    POLL_INTERVAL = 30         # seconds between poll cycles
    BROADCAST_INTERVAL = 5     # seconds between WebSocket broadcasts
    STALE_TIMEOUT = 180        # remove aircraft not seen for 3 minutes

    # airplanes.live: /v2/point/{lat}/{lon}/{radius_nm} — max 250 nm radius
    AIRPLANES_LIVE_URL = "https://api.airplanes.live/v2/point"

    # Geographic zones to poll (lat, lon, radius_nm) — covers major flight corridors
    ZONES = [
        (48.86, 2.35, 250),     # Europe West (Paris)
        (51.47, 0.46, 250),     # UK / North Sea
        (52.52, 13.41, 250),    # Europe Central (Berlin)
        (41.90, 12.50, 250),    # Mediterranean (Rome)
        (55.75, 37.62, 250),    # Russia West (Moscow)
        (40.71, -74.01, 250),   # US East (New York)
        (33.94, -118.41, 250),  # US West (Los Angeles)
        (41.88, -87.63, 250),   # US Central (Chicago)
        (29.76, -95.37, 250),   # US South (Houston)
        (25.20, 55.27, 250),    # Middle East (Dubai)
        (1.35, 103.82, 250),    # SE Asia (Singapore)
        (35.68, 139.69, 250),   # East Asia (Tokyo)
        (31.23, 121.47, 250),   # China East (Shanghai)
        (22.31, 114.17, 250),   # China South (Hong Kong)
        (28.61, 77.21, 250),    # India (Delhi)
        (-33.87, 151.21, 250),  # Oceania (Sydney)
        (-23.55, -46.63, 250),  # South America (Sao Paulo)
        (25.05, -77.35, 250),   # Caribbean (Nassau)
        (30.05, 31.24, 250),    # Africa North (Cairo)
        (-1.29, 36.82, 250),    # Africa East (Nairobi)
        (64.13, -21.94, 250),   # North Atlantic (Iceland)
    ]

    OPENSKY_URL = "https://opensky-network.org/api/states/all"

    # Map airplanes.live category codes to our categories
    ALCAT = {
        "A1": "light", "A2": "small", "A3": "large",
        "A4": "heavy", "A5": "heavy", "A6": "heavy", "A7": "rotorcraft",
        "B1": "light", "B2": "other", "B4": "other", "B6": "other",
    }

    # Map registration prefix to country name
    REG_PREFIX = {
        "N": "United States", "C-": "Canada", "G-": "United Kingdom",
        "F-": "France", "D-": "Germany", "I-": "Italy", "EC-": "Spain",
        "PP-": "Brazil", "PT-": "Brazil", "PR-": "Brazil",
        "JA": "Japan", "B-": "China", "VT-": "India",
        "HL": "South Korea", "RA-": "Russia", "SP-": "Poland",
        "TC-": "Turkey", "A6-": "UAE", "9V-": "Singapore",
        "VH-": "Australia", "ZK-": "New Zealand", "9H-": "Malta",
        "HB-": "Switzerland", "OE-": "Austria", "PH-": "Netherlands",
        "OO-": "Belgium", "SE-": "Sweden", "LN-": "Norway",
        "OH-": "Finland", "OY-": "Denmark", "EI-": "Ireland",
        "CS-": "Portugal", "SX-": "Greece", "HA-": "Hungary",
        "OK-": "Czech Republic", "YR-": "Romania", "LZ-": "Bulgaria",
        "UR-": "Ukraine", "SU-": "Egypt", "ZS-": "South Africa",
        "EP-": "Iran", "AP-": "Pakistan", "A7-": "Qatar",
        "HZ-": "Saudi Arabia", "4X-": "Israel", "JY-": "Jordan",
        "XA-": "Mexico", "XB-": "Mexico", "CC-": "Chile",
        "LV-": "Argentina", "HK-": "Colombia", "TG-": "Guatemala",
        "RP-": "Philippines", "HS-": "Thailand", "9M-": "Malaysia",
        "PK-": "Indonesia", "VN-": "Vietnam",
    }

    @staticmethod
    def _reg_to_country(reg: str) -> str:
        """Derive country from aircraft registration prefix."""
        if not reg:
            return ""
        # Try longest prefixes first (3, 2, 1 chars)
        for ln in (3, 2, 1):
            pfx = reg[:ln]
            if pfx in AircraftTracker.REG_PREFIX:
                return AircraftTracker.REG_PREFIX[pfx]
        return ""

    def __init__(self):
        self._aircraft: Dict[str, AircraftPosition] = {}
        self._running = False
        self._tasks: List[asyncio.Task] = []
        self._last_poll_time = 0.0
        self._poll_errors = 0
        self._source = "airplanes.live"
        self._zone_idx = 0  # rotate through zones

    @property
    def is_live(self) -> bool:
        return len(self._aircraft) > 0

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        logger.info("AircraftTracker starting — using airplanes.live + OpenSky fallback")
        self._tasks.append(asyncio.ensure_future(self._poll_loop()))
        self._tasks.append(asyncio.ensure_future(self._broadcast_loop()))
        self._tasks.append(asyncio.ensure_future(self._cleanup_loop()))

    def stop(self) -> None:
        self._running = False
        for task in self._tasks:
            task.cancel()
        self._tasks.clear()
        logger.info("AircraftTracker stopped")

    def get_aircraft(self) -> List[dict]:
        cutoff = time.time() - 90
        return [
            a.to_dict() for a in self._aircraft.values()
            if a.last_update > cutoff and not a.on_ground
        ]

    def get_stats(self) -> dict:
        by_category: Dict[str, int] = {}
        airborne = 0
        on_ground = 0
        for a in self._aircraft.values():
            by_category[a.category] = by_category.get(a.category, 0) + 1
            if a.on_ground:
                on_ground += 1
            else:
                airborne += 1

        by_country: Dict[str, int] = {}
        for a in self._aircraft.values():
            by_country[a.origin_country] = by_country.get(a.origin_country, 0) + 1

        top_countries = sorted(by_country.items(), key=lambda x: -x[1])[:10]

        return {
            "total_tracked": len(self._aircraft),
            "airborne": airborne,
            "on_ground": on_ground,
            "by_category": by_category,
            "top_countries": dict(top_countries),
            "last_poll": self._last_poll_time,
            "poll_errors": self._poll_errors,
            "source": self._source,
        }

    # ── Polling ──

    async def _poll_loop(self) -> None:
        await asyncio.sleep(3)
        while self._running:
            try:
                # Poll 3 zones per cycle to spread load
                for _ in range(3):
                    zone = self.ZONES[self._zone_idx % len(self.ZONES)]
                    self._zone_idx += 1
                    await self._fetch_airplanes_live(*zone)
                    await asyncio.sleep(1)  # small delay between zone requests
            except asyncio.CancelledError:
                break
            except Exception as e:
                self._poll_errors += 1
                logger.warning(f"Aircraft poll error: {e}")

            await asyncio.sleep(self.POLL_INTERVAL)

    async def _fetch_airplanes_live(self, lat: float, lon: float, radius: int) -> None:
        """Fetch aircraft from airplanes.live API for a geographic zone."""
        url = f"{self.AIRPLANES_LIVE_URL}/{lat}/{lon}/{radius}"
        timeout = aiohttp.ClientTimeout(total=15)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url) as resp:
                if resp.status == 429:
                    logger.warning("airplanes.live rate-limited (429) — backing off")
                    await asyncio.sleep(30)
                    return
                if resp.status != 200:
                    logger.debug(f"airplanes.live returned {resp.status}")
                    return
                data = await resp.json()

        aircraft_list = data.get("ac") or []
        now = time.time()
        self._last_poll_time = now
        count = 0

        for ac in aircraft_list:
            icao24 = ac.get("hex", "").strip()
            lat_val = ac.get("lat")
            lon_val = ac.get("lon")
            if not icao24 or lat_val is None or lon_val is None:
                continue

            callsign = (ac.get("flight") or "").strip()
            cat_code = ac.get("category", "")
            category = self.ALCAT.get(cat_code, "other")
            on_ground = ac.get("alt_baro") == "ground"

            alt_baro = ac.get("alt_baro")
            alt_geom = ac.get("alt_geom")
            altitude_ft = 0
            if isinstance(alt_baro, (int, float)):
                altitude_ft = alt_baro
            elif isinstance(alt_geom, (int, float)):
                altitude_ft = alt_geom

            self._aircraft[icao24] = AircraftPosition(
                icao24=icao24,
                callsign=callsign or icao24.upper(),
                origin_country=self._reg_to_country(ac.get("r", "")),
                lat=lat_val,
                lon=lon_val,
                altitude_m=altitude_ft * 0.3048,
                velocity_ms=(ac.get("gs") or 0) * 0.514444,  # knots to m/s
                heading=ac.get("track") or ac.get("mag_heading") or 0,
                vertical_rate=(ac.get("baro_rate") or ac.get("geom_rate") or 0) * 0.00508,  # ft/min to m/s
                on_ground=on_ground,
                category=category,
                last_update=now,
            )
            count += 1

        if count > 0:
            self._source = "airplanes.live"
            logger.info(f"airplanes.live zone ({lat},{lon}): {count} aircraft")

    # ── Cleanup stale entries ──

    async def _cleanup_loop(self) -> None:
        """Remove aircraft not seen recently."""
        while self._running:
            await asyncio.sleep(60)
            cutoff = time.time() - self.STALE_TIMEOUT
            stale = [k for k, v in self._aircraft.items() if v.last_update < cutoff]
            for k in stale:
                del self._aircraft[k]
            if stale:
                logger.debug(f"Removed {len(stale)} stale aircraft")

    # ── WebSocket broadcast ──

    async def _broadcast_loop(self) -> None:
        """Periodically broadcast aircraft positions to WebSocket clients."""
        while self._running:
            await asyncio.sleep(self.BROADCAST_INTERVAL)
            try:
                aircraft = self.get_aircraft()
                if aircraft:
                    await manager.broadcast(
                        {
                            "type": "aircraft",
                            "event": "aircraft_positions",
                            "count": len(aircraft),
                            "aircraft": aircraft,
                        },
                        channel="aircraft",
                    )
            except Exception as e:
                logger.debug(f"Aircraft broadcast error: {e}")


# ── Module-level singleton ──
aircraft_tracker = AircraftTracker()

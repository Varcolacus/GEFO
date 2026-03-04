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
    Tracks aircraft positions via the OpenSky Network REST API.

    Polls every POLL_INTERVAL seconds, maintains an in-memory dict
    of aircraft keyed by ICAO24 hex address, and broadcasts snapshots
    to WebSocket clients.
    """

    POLL_INTERVAL = 15         # seconds between API polls (>10s for anonymous)
    BROADCAST_INTERVAL = 5     # seconds between WebSocket broadcasts
    STALE_TIMEOUT = 120        # remove aircraft not seen for 2 minutes
    MAX_AIRCRAFT = 0           # 0 = no cap

    OPENSKY_URL = "https://opensky-network.org/api/states/all"

    def __init__(self):
        self._aircraft: Dict[str, AircraftPosition] = {}
        self._running = False
        self._tasks: List[asyncio.Task] = []
        self._last_poll_time = 0.0
        self._poll_errors = 0

    @property
    def is_live(self) -> bool:
        return len(self._aircraft) > 0

    def start(self) -> None:
        """Start the tracker (called during app startup)."""
        if self._running:
            return
        self._running = True
        logger.info("AircraftTracker starting — polling OpenSky Network")
        self._tasks.append(asyncio.ensure_future(self._poll_loop()))
        self._tasks.append(asyncio.ensure_future(self._broadcast_loop()))
        self._tasks.append(asyncio.ensure_future(self._cleanup_loop()))

    def stop(self) -> None:
        """Stop the tracker (called during app shutdown)."""
        self._running = False
        for task in self._tasks:
            task.cancel()
        self._tasks.clear()
        logger.info("AircraftTracker stopped")

    def get_aircraft(self) -> List[dict]:
        """Get current snapshot of all tracked aircraft (airborne only)."""
        cutoff = time.time() - 60
        return [
            a.to_dict() for a in self._aircraft.values()
            if a.last_update > cutoff and not a.on_ground
        ]

    def get_stats(self) -> dict:
        """Get tracker statistics."""
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

        # Top 10 countries
        top_countries = sorted(by_country.items(), key=lambda x: -x[1])[:10]

        return {
            "total_tracked": len(self._aircraft),
            "airborne": airborne,
            "on_ground": on_ground,
            "by_category": by_category,
            "top_countries": dict(top_countries),
            "last_poll": self._last_poll_time,
            "poll_errors": self._poll_errors,
        }

    # ── OpenSky polling ──

    async def _poll_loop(self) -> None:
        """Poll the OpenSky Network API at regular intervals."""
        # Small initial delay to let the app start
        await asyncio.sleep(2)

        while self._running:
            try:
                await self._fetch_opensky()
            except asyncio.CancelledError:
                break
            except Exception as e:
                self._poll_errors += 1
                logger.warning(f"OpenSky poll error: {e}")

            await asyncio.sleep(self.POLL_INTERVAL)

    async def _fetch_opensky(self) -> None:
        """Fetch all aircraft states from OpenSky."""
        timeout = aiohttp.ClientTimeout(total=30)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(self.OPENSKY_URL) as resp:
                if resp.status == 429:
                    logger.warning("OpenSky rate limited, backing off 30s")
                    await asyncio.sleep(30)
                    return
                if resp.status != 200:
                    logger.warning(f"OpenSky returned {resp.status}")
                    return

                data = await resp.json()

        states = data.get("states") or []
        now = time.time()
        self._last_poll_time = now
        count = 0

        for s in states:
            # OpenSky state vector fields:
            # [0] icao24, [1] callsign, [2] origin_country, [3] time_position,
            # [4] last_contact, [5] longitude, [6] latitude, [7] baro_altitude,
            # [8] on_ground, [9] velocity, [10] true_track, [11] vertical_rate,
            # [12] sensors, [13] geo_altitude, [14] squawk, [15] spi,
            # [16] position_source, [17] category (optional)

            icao24 = s[0]
            lat = s[6]
            lon = s[5]

            # Skip entries without position
            if lat is None or lon is None:
                continue

            callsign = (s[1] or "").strip()
            category_code = s[17] if len(s) > 17 and s[17] is not None else 0
            category = AIRCRAFT_CATEGORIES.get(category_code, "other")

            self._aircraft[icao24] = AircraftPosition(
                icao24=icao24,
                callsign=callsign or icao24.upper(),
                origin_country=s[2] or "",
                lat=lat,
                lon=lon,
                altitude_m=s[7] or s[13] or 0,  # prefer baro, fallback geo
                velocity_ms=s[9] or 0,
                heading=s[10] or 0,
                vertical_rate=s[11] or 0,
                on_ground=bool(s[8]),
                category=category,
                last_update=now,
            )
            count += 1

        logger.info(f"OpenSky: {count} aircraft with positions "
                    f"({sum(1 for a in self._aircraft.values() if not a.on_ground)} airborne)")

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

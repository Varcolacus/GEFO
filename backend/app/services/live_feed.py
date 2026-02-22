"""
Simulated live-data feed generator.

Produces realistic-looking events for port activity,
geopolitical risk changes, and alert triggers at configurable intervals.
Events are broadcast via the WebSocket ConnectionManager.
"""

from __future__ import annotations

import asyncio
import logging
import random
import time
from typing import Any, Dict, List, Optional

from app.core.websocket_manager import manager

logger = logging.getLogger("gefo.livefeed")

# ─── Reference data used by the simulator ───

CENTROIDS = {
    "USA": (39.8, -98.5), "CHN": (35.86, 104.19), "DEU": (51.16, 10.45),
    "JPN": (36.20, 138.25), "GBR": (55.37, -3.44), "FRA": (46.23, 2.21),
    "IND": (20.59, 78.96), "BRA": (-14.23, -51.92), "KOR": (35.91, 127.77),
    "RUS": (61.52, 105.32), "AUS": (-25.27, 133.78), "SAU": (23.89, 45.08),
    "SGP": (1.35, 103.82), "ARE": (23.42, 53.85), "NGA": (9.08, 8.68),
    "ZAF": (-30.56, 22.94), "EGY": (26.82, 30.80), "MEX": (23.63, -102.55),
    "IDN": (-0.79, 113.92), "NLD": (52.13, 5.29), "TUR": (38.96, 35.24),
    "CAN": (56.13, -106.35), "NOR": (60.47, 8.47), "CHE": (46.82, 8.23),
}

PORTS_LIST = [
    {"name": "Shanghai", "iso": "CHN", "lat": 31.23, "lon": 121.47, "base_teu": 47_300_000},
    {"name": "Singapore", "iso": "SGP", "lat": 1.26, "lon": 103.84, "base_teu": 37_200_000},
    {"name": "Ningbo-Zhoushan", "iso": "CHN", "lat": 29.87, "lon": 121.56, "base_teu": 33_350_000},
    {"name": "Rotterdam", "iso": "NLD", "lat": 51.95, "lon": 4.13, "base_teu": 14_820_000},
    {"name": "Dubai", "iso": "ARE", "lat": 25.01, "lon": 55.06, "base_teu": 14_110_000},
    {"name": "Los Angeles", "iso": "USA", "lat": 33.74, "lon": -118.26, "base_teu": 9_900_000},
    {"name": "Hamburg", "iso": "DEU", "lat": 53.55, "lon": 9.97, "base_teu": 8_700_000},
    {"name": "Busan", "iso": "KOR", "lat": 35.10, "lon": 129.04, "base_teu": 22_070_000},
    {"name": "Santos", "iso": "BRA", "lat": -23.96, "lon": -46.33, "base_teu": 4_200_000},
    {"name": "Ras Tanura", "iso": "SAU", "lat": 26.64, "lon": 50.17, "base_teu": 0},
]

RISK_COUNTRIES = ["RUS", "IRN", "CHN", "SAU", "BLR", "TUR", "IND", "BRA", "NGA", "EGY"]

ALERT_TEMPLATES = [
    {"title": "Trade surplus spike: {iso}", "severity": "warning"},
    {"title": "Port congestion detected: {port}", "severity": "critical"},
    {"title": "Sanctions list update: {iso}", "severity": "info"},
    {"title": "Chokepoint disruption risk: {zone}", "severity": "critical"},
    {"title": "Currency volatility: {iso}", "severity": "warning"},
    {"title": "New tariff imposed: {iso} → {iso2}", "severity": "info"},
    {"title": "Shipping delay: {port}", "severity": "warning"},
    {"title": "Risk score change: {iso}", "severity": "info"},
]

CONFLICT_ZONES = [
    "Ukraine Front", "Red Sea / Houthi", "South China Sea",
    "Gaza Strip", "Sahel Region", "Taiwan Strait", "Strait of Hormuz",
]


class LiveFeedSimulator:
    """Generates and broadcasts simulated live events."""

    def __init__(
        self,
        port_interval: float = 5.0,
        alert_interval: float = 12.0,
        geo_interval: float = 8.0,
        heartbeat_interval: float = 15.0,
    ) -> None:
        self.port_interval = port_interval
        self.alert_interval = alert_interval
        self.geo_interval = geo_interval
        self.heartbeat_interval = heartbeat_interval
        self._tasks: List[asyncio.Task] = []
        self._running = False
        self._event_id = 0

    # ─── Lifecycle ───

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        loop = asyncio.get_event_loop()
        self._tasks = [
            loop.create_task(self._port_loop()),
            loop.create_task(self._alert_loop()),
            loop.create_task(self._geo_loop()),
            loop.create_task(self._heartbeat_loop()),
        ]
        logger.info("Live feed simulator started  (4 loops)")

    def stop(self) -> None:
        self._running = False
        for t in self._tasks:
            t.cancel()
        self._tasks.clear()
        logger.info("Live feed simulator stopped")

    def _next_id(self) -> str:
        self._event_id += 1
        return f"evt-{self._event_id}"

    # ─── Port Activity Events ───

    async def _port_loop(self) -> None:
        while self._running:
            await asyncio.sleep(self.port_interval + random.uniform(-1, 2))
            if manager.client_count == 0:
                continue
            port = random.choice(PORTS_LIST)
            events = ["vessel_arrival", "vessel_departure", "congestion_update", "throughput_update"]
            event = random.choice(events)

            data: Dict[str, Any] = {
                "event": event,
                "id": self._next_id(),
                "port_name": port["name"],
                "country_iso": port["iso"],
                "lat": port["lat"],
                "lon": port["lon"],
            }

            if event in ("vessel_arrival", "vessel_departure"):
                vessel_types = ["Container", "Bulk Carrier", "Tanker", "LNG Carrier", "RoRo"]
                data["vessel_type"] = random.choice(vessel_types)
                data["vessel_name"] = f"MV {random.choice(['Pacific', 'Atlantic', 'Global', 'Orient', 'Nordic', 'Eagle', 'Star'])} {random.choice(['Horizon', 'Pioneer', 'Spirit', 'Venture', 'Express', 'Dawn'])}"
                data["description"] = f"{'🚢 Arrived' if event == 'vessel_arrival' else '⚓ Departed'}: {data['vessel_name']} ({data['vessel_type']}) at {port['name']}"
            elif event == "congestion_update":
                data["wait_days"] = round(random.uniform(0.5, 14), 1)
                data["vessels_waiting"] = random.randint(2, 45)
                data["description"] = f"⏳ {port['name']}: {data['vessels_waiting']} vessels waiting ({data['wait_days']}d avg)"
            else:
                delta = random.uniform(-5, 8)
                data["throughput_change_pct"] = round(delta, 1)
                data["description"] = f"📊 {port['name']} throughput {'+' if delta > 0 else ''}{delta:.1f}%"

            await manager.broadcast("ports", data)

    # ─── Alert Events ───

    async def _alert_loop(self) -> None:
        while self._running:
            await asyncio.sleep(self.alert_interval + random.uniform(-3, 5))
            if manager.client_count == 0:
                continue
            tpl = random.choice(ALERT_TEMPLATES)
            iso = random.choice(RISK_COUNTRIES)
            iso2 = random.choice([c for c in RISK_COUNTRIES if c != iso])
            port = random.choice(PORTS_LIST)
            zone = random.choice(CONFLICT_ZONES)

            title = tpl["title"].format(iso=iso, iso2=iso2, port=port["name"], zone=zone)

            await manager.broadcast("alerts", {
                "event": "alert_triggered",
                "id": self._next_id(),
                "title": title,
                "severity": tpl["severity"],
                "description": title,
            })

    # ─── Geopolitical Events ───

    async def _geo_loop(self) -> None:
        while self._running:
            await asyncio.sleep(self.geo_interval + random.uniform(-2, 3))
            if manager.client_count == 0:
                continue
            events = ["risk_score_change", "conflict_update", "sanctions_update"]
            event = random.choice(events)
            iso = random.choice(RISK_COUNTRIES)
            centroid = CENTROIDS.get(iso, (0, 0))

            data: Dict[str, Any] = {
                "event": event,
                "id": self._next_id(),
                "country_iso": iso,
                "lat": centroid[0],
                "lon": centroid[1],
            }

            if event == "risk_score_change":
                old = round(random.uniform(20, 70), 1)
                delta = round(random.uniform(-8, 12), 1)
                data["old_score"] = old
                data["new_score"] = round(old + delta, 1)
                data["delta"] = delta
                direction = "▲" if delta > 0 else "▼"
                data["description"] = f"Risk {direction} {iso}: {old:.1f} → {old + delta:.1f} ({'+' if delta > 0 else ''}{delta:.1f})"
            elif event == "conflict_update":
                zone = random.choice(CONFLICT_ZONES)
                severity = random.choice(["critical", "high", "moderate"])
                data["zone_name"] = zone
                data["severity"] = severity
                data["description"] = f"🔴 Conflict update: {zone} — severity {severity}"
            else:
                action = random.choice(["entity_added", "entity_removed", "list_updated"])
                data["action"] = action
                data["description"] = f"📋 Sanctions {action.replace('_', ' ')}: {iso}"

            await manager.broadcast("geopolitical", data)

    # ─── Heartbeat ───

    async def _heartbeat_loop(self) -> None:
        while self._running:
            await asyncio.sleep(self.heartbeat_interval)
            await manager.broadcast("system", {
                "event": "heartbeat",
                "clients": manager.client_count,
                "stats": manager.stats(),
            })


# ─── Singleton ───
simulator = LiveFeedSimulator()

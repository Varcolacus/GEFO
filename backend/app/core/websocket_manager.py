"""
WebSocket connection manager for real-time data broadcasting.

Supports channels so clients subscribe only to events they care about:
  - "trade"       → live trade-flow updates
  - "ports"       → port activity / throughput changes
  - "alerts"      → triggered alerts
  - "geopolitical"→ risk-score & conflict-zone changes
  - "system"      → heartbeat, stats
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set

from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

logger = logging.getLogger("gefo.ws")


@dataclass
class ClientInfo:
    """Metadata about a connected WebSocket client."""

    websocket: WebSocket
    client_id: str
    channels: Set[str] = field(default_factory=lambda: {"system"})
    connected_at: float = field(default_factory=time.time)
    messages_sent: int = 0


class ConnectionManager:
    """Manages WebSocket connections, channels, and broadcasting."""

    ALL_CHANNELS = {"trade", "ports", "alerts", "geopolitical", "vessels", "system"}

    def __init__(self) -> None:
        # client_id → ClientInfo
        self._clients: Dict[str, ClientInfo] = {}
        # channel → set of client_ids
        self._channel_subs: Dict[str, Set[str]] = defaultdict(set)
        self._lock = asyncio.Lock()
        self._counter = 0

    # ─── Connect / Disconnect ───

    async def connect(self, ws: WebSocket, client_id: Optional[str] = None) -> ClientInfo:
        await ws.accept()
        async with self._lock:
            self._counter += 1
            cid = client_id or f"client-{self._counter}"
            info = ClientInfo(websocket=ws, client_id=cid)
            self._clients[cid] = info
            self._channel_subs["system"].add(cid)
        logger.info("WS connected: %s  (total: %d)", cid, len(self._clients))
        # Send welcome
        await self._send(info, {
            "type": "system",
            "event": "connected",
            "client_id": cid,
            "channels": list(info.channels),
            "ts": time.time(),
        })
        return info

    async def disconnect(self, client_id: str) -> None:
        async with self._lock:
            info = self._clients.pop(client_id, None)
            if info:
                for ch in list(info.channels):
                    self._channel_subs[ch].discard(client_id)
        logger.info("WS disconnected: %s  (total: %d)", client_id, len(self._clients))

    # ─── Subscriptions ───

    async def subscribe(self, client_id: str, channels: List[str]) -> List[str]:
        async with self._lock:
            info = self._clients.get(client_id)
            if not info:
                return []
            for ch in channels:
                if ch in self.ALL_CHANNELS:
                    info.channels.add(ch)
                    self._channel_subs[ch].add(client_id)
            return list(info.channels)

    async def unsubscribe(self, client_id: str, channels: List[str]) -> List[str]:
        async with self._lock:
            info = self._clients.get(client_id)
            if not info:
                return []
            for ch in channels:
                if ch != "system":  # system always subscribed
                    info.channels.discard(ch)
                    self._channel_subs[ch].discard(client_id)
            return list(info.channels)

    # ─── Broadcasting ───

    async def broadcast(self, channel: str, data: Dict[str, Any]) -> int:
        """Send *data* to every client subscribed to *channel*. Returns count."""
        data.setdefault("ts", time.time())
        data.setdefault("type", channel)

        sent = 0
        async with self._lock:
            cids = list(self._channel_subs.get(channel, set()))

        for cid in cids:
            info = self._clients.get(cid)
            if info:
                ok = await self._send(info, data)
                if ok:
                    sent += 1
        return sent

    async def send_to(self, client_id: str, data: Dict[str, Any]) -> bool:
        info = self._clients.get(client_id)
        if not info:
            return False
        data.setdefault("ts", time.time())
        return await self._send(info, data)

    # ─── Internals ───

    async def _send(self, info: ClientInfo, data: Dict[str, Any]) -> bool:
        try:
            if info.websocket.client_state == WebSocketState.CONNECTED:
                await info.websocket.send_json(data)
                info.messages_sent += 1
                return True
        except Exception:
            logger.debug("Send failed for %s, scheduling disconnect", info.client_id)
            await self.disconnect(info.client_id)
        return False

    # ─── Stats ───

    @property
    def client_count(self) -> int:
        return len(self._clients)

    def stats(self) -> Dict[str, Any]:
        return {
            "total_clients": len(self._clients),
            "channels": {
                ch: len(cids) for ch, cids in self._channel_subs.items() if cids
            },
            "total_messages_sent": sum(c.messages_sent for c in self._clients.values()),
        }


# ─── Singleton ───
manager = ConnectionManager()

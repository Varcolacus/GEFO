"""
WebSocket API router.

Endpoints:
  WS /ws/live   – Real-time event stream (clients send subscribe/unsubscribe JSON)
  GET /api/ws/stats – Connection & channel statistics
"""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.websocket_manager import manager

logger = logging.getLogger("gefo.ws.api")

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/live")
async def websocket_live(ws: WebSocket):
    """
    Real-time event stream.

    After connection, client may send JSON commands:
      {"action": "subscribe",   "channels": ["trade", "ports"]}
      {"action": "unsubscribe", "channels": ["ports"]}
      {"action": "ping"}
    """
    info = await manager.connect(ws)
    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await manager.send_to(info.client_id, {"type": "error", "message": "Invalid JSON"})
                continue

            action = msg.get("action")

            if action == "subscribe":
                channels = msg.get("channels", [])
                current = await manager.subscribe(info.client_id, channels)
                await manager.send_to(info.client_id, {
                    "type": "system",
                    "event": "subscribed",
                    "channels": current,
                })

            elif action == "unsubscribe":
                channels = msg.get("channels", [])
                current = await manager.unsubscribe(info.client_id, channels)
                await manager.send_to(info.client_id, {
                    "type": "system",
                    "event": "unsubscribed",
                    "channels": current,
                })

            elif action == "ping":
                await manager.send_to(info.client_id, {
                    "type": "system",
                    "event": "pong",
                })

            else:
                await manager.send_to(info.client_id, {
                    "type": "error",
                    "message": f"Unknown action: {action}",
                })

    except WebSocketDisconnect:
        await manager.disconnect(info.client_id)
    except Exception as exc:
        logger.exception("WS error for %s: %s", info.client_id, exc)
        await manager.disconnect(info.client_id)


@router.get("/api/ws/stats")
def ws_stats():
    """Return current WebSocket connection & channel statistics."""
    return manager.stats()

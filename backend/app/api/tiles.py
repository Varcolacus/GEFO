"""
Tile proxy for OpenRailwayMap.
OpenRailwayMap blocks direct browser requests (403) but allows
server-side fetches with a proper Referer header.
"""
import httpx
from fastapi import APIRouter, Response
from fastapi.responses import Response as FastAPIResponse

router = APIRouter(prefix="/api/tiles", tags=["Tiles"])

_client = httpx.AsyncClient(
    timeout=10.0,
    headers={
        "Referer": "https://www.openrailwaymap.org/",
        "User-Agent": "Mozilla/5.0 (compatible; GEFO/1.0)",
    },
)

TILE_SERVERS = ["a", "b", "c"]


@router.get("/railroad/{z}/{x}/{y}.png")
async def railroad_tile(z: int, x: int, y: int):
    """Proxy OpenRailwayMap standard tiles."""
    server = TILE_SERVERS[x % len(TILE_SERVERS)]
    url = f"https://{server}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png"
    try:
        resp = await _client.get(url)
        if resp.status_code == 200:
            return Response(
                content=resp.content,
                media_type="image/png",
                headers={
                    "Cache-Control": "public, max-age=86400",
                    "Access-Control-Allow-Origin": "*",
                },
            )
        # Return a transparent 1x1 PNG on error
        return _transparent_png()
    except Exception:
        return _transparent_png()


def _transparent_png() -> Response:
    """Return a 1x1 transparent PNG."""
    # Minimal valid 1x1 transparent PNG (67 bytes)
    data = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
        b"\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
        b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01"
        b"\r\n\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    return Response(
        content=data,
        media_type="image/png",
        headers={
            "Cache-Control": "public, max-age=3600",
            "Access-Control-Allow-Origin": "*",
        },
    )

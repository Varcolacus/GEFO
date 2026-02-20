from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from app.core.config import settings
from app.core.scheduler import start_scheduler, stop_scheduler, get_scheduler_status
from app.core.rate_limit import setup_rate_limiting
from app.api import countries, trade_flows, ports, shipping_density, indicators, intelligence
from app.api import auth, keys, billing, export, alerts, admin, geopolitical
from app.api import websocket as ws_router
from app.core.usage_middleware import UsageTrackingMiddleware
from app.services.live_feed import simulator as live_feed_simulator

# ─── Logging ───
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)-20s | %(levelname)-7s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("gefo.main")


# ─── Lifecycle ───

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    logger.info("GEFO API starting up…")
    start_scheduler()
    live_feed_simulator.start()
    yield
    logger.info("GEFO API shutting down…")
    live_feed_simulator.stop()
    stop_scheduler()


app = FastAPI(
    title="GEFO API",
    description="Global Economic Flow Observatory — Geoeconomic Intelligence Platform",
    version="0.7.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Usage tracking middleware (before rate limiter so it captures all requests)
app.add_middleware(UsageTrackingMiddleware)

# Register routers
app.include_router(admin.router)
app.include_router(auth.router)
app.include_router(keys.router)
app.include_router(billing.router)
app.include_router(export.router)
app.include_router(alerts.router)
app.include_router(countries.router)
app.include_router(trade_flows.router)
app.include_router(ports.router)
app.include_router(shipping_density.router)
app.include_router(indicators.router)
app.include_router(intelligence.router)
app.include_router(geopolitical.router)
app.include_router(ws_router.router)

# Rate limiting
setup_rate_limiting(app)


@app.get("/")
def root():
    return {
        "name": "GEFO API",
        "version": "0.7.0",
        "description": "Global Economic Flow Observatory — Geoeconomic Intelligence Platform",
        "endpoints": {
            "admin": "/api/admin",
            "auth": "/api/auth",
            "keys": "/api/keys",
            "billing": "/api/billing",
            "export": "/api/export",
            "alerts": "/api/alerts",
            "countries": "/api/countries",
            "trade_flows": "/api/trade_flows",
            "ports": "/api/ports",
            "shipping_density": "/api/shipping_density",
            "indicators": "/api/indicators",
            "intelligence": "/api/intelligence",
            "geopolitical": "/api/geopolitical",
            "websocket": "ws://host/ws/live",
            "ws_stats": "/api/ws/stats",
            "docs": "/docs",
        },
    }


@app.get("/health")
def health():
    return {"status": "healthy", "scheduler": get_scheduler_status()}

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api import countries, trade_flows, ports, shipping_density, indicators

app = FastAPI(
    title="GEFO API",
    description="Global Economic Flow Observatory — Geoeconomic Intelligence Platform",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(countries.router)
app.include_router(trade_flows.router)
app.include_router(ports.router)
app.include_router(shipping_density.router)
app.include_router(indicators.router)


@app.get("/")
def root():
    return {
        "name": "GEFO API",
        "version": "0.1.0",
        "description": "Global Economic Flow Observatory",
        "endpoints": {
            "countries": "/api/countries",
            "trade_flows": "/api/trade_flows",
            "ports": "/api/ports",
            "shipping_density": "/api/shipping_density",
            "indicators": "/api/indicators",
            "docs": "/docs",
        },
    }


@app.get("/health")
def health():
    return {"status": "healthy"}

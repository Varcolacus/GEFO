#!/usr/bin/env python3
"""
GEFO – One-command setup script.

Sets up the database schema, seeds all reference data, and verifies the result.
Requires a running PostgreSQL instance with PostGIS (see docker-compose.yml).

Usage
-----
  # From the repo root, with the backend venv activated:
  python setup.py            # full setup (schema + all seeds)
  python setup.py --seed     # re-seed only (skip schema creation)
  python setup.py --check    # verify counts without changing anything
"""

import argparse
import sys
import os
import time
import logging

# Ensure the backend package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("gefo.setup")

# ── helpers ──────────────────────────────────────────────────────────────────

def _timer(label: str):
    """Simple context-manager stopwatch."""
    class Timer:
        def __enter__(self):
            self.t0 = time.perf_counter()
            log.info("Starting: %s …", label)
            return self
        def __exit__(self, *_):
            elapsed = time.perf_counter() - self.t0
            log.info("Done: %s (%.1fs)", label, elapsed)
    return Timer()


def step(number: int, total: int, label: str):
    log.info("─── Step %d/%d: %s ───", number, total, label)


# ── database checks ─────────────────────────────────────────────────────────

def check_postgres():
    """Verify PostgreSQL connectivity and PostGIS availability."""
    from app.core.database import engine
    from sqlalchemy import text

    try:
        with engine.connect() as conn:
            version = conn.execute(text("SELECT version()")).scalar()
            log.info("PostgreSQL connected: %s", version.split(",")[0])
            postgis = conn.execute(
                text("SELECT default_version FROM pg_available_extensions WHERE name='postgis'")
            ).scalar()
            if postgis:
                log.info("PostGIS available (v%s)", postgis)
            else:
                log.warning("PostGIS extension not found – geometry features will fail")
    except Exception as e:
        log.error("Cannot connect to PostgreSQL: %s", e)
        log.error(
            "Make sure PostgreSQL is running. Quick start:\n"
            "  docker compose up -d db\n"
            "  # or install PostgreSQL locally and create the database:\n"
            "  createdb gefo_db"
        )
        sys.exit(1)


def print_counts():
    """Print row counts for all major tables."""
    from app.core.database import SessionLocal
    from app.models.country import Country
    from app.models.trade_flow import TradeFlow
    from app.models.port import Port
    from app.models.airport import Airport
    from app.models.shipping_density import ShippingDensity
    from app.models.commodity import Commodity
    from app.models.geopolitical import SanctionedEntity, ConflictZone, CountryRiskScore

    db = SessionLocal()
    try:
        tables = [
            ("Countries", Country),
            ("Trade Flows", TradeFlow),
            ("Ports", Port),
            ("Airports", Airport),
            ("Shipping Density", ShippingDensity),
            ("Commodities", Commodity),
            ("Sanctioned Entities", SanctionedEntity),
            ("Conflict Zones", ConflictZone),
            ("Country Risk Scores", CountryRiskScore),
        ]
        log.info("──────────────────────────────────")
        log.info("  Table                    Count")
        log.info("──────────────────────────────────")
        for label, model in tables:
            try:
                count = db.query(model).count()
            except Exception:
                count = "N/A"
            log.info("  %-24s %s", label, count)
        log.info("──────────────────────────────────")
    finally:
        db.close()


# ── setup steps ──────────────────────────────────────────────────────────────

TOTAL_STEPS = 8


def run_init_schema():
    step(1, TOTAL_STEPS, "Initialize database schema (tables + PostGIS)")
    with _timer("schema creation"):
        from app.ingestion.init_db import init_db
        init_db()


def run_seed_countries():
    step(2, TOTAL_STEPS, "Seed countries from Natural Earth shapefiles")
    with _timer("countries"):
        from app.ingestion.natural_earth import ingest_natural_earth
        ingest_natural_earth()


def run_seed_ports():
    step(3, TOTAL_STEPS, "Seed world ports")
    with _timer("ports"):
        from app.ingestion.ports_seed import seed_ports
        seed_ports()


def run_seed_airports():
    step(4, TOTAL_STEPS, "Seed world airports")
    with _timer("airports"):
        from app.ingestion.airports_seed import seed_airports
        seed_airports()


def run_seed_shipping():
    step(5, TOTAL_STEPS, "Seed shipping density data")
    with _timer("shipping density"):
        from app.ingestion.shipping_density_seed import seed_shipping_density
        seed_shipping_density()


def run_seed_trade():
    step(6, TOTAL_STEPS, "Seed trade flows (comprehensive gravity model)")
    with _timer("trade flows"):
        from app.ingestion.trade_flows_seed import seed_trade_flows
        seed_trade_flows()
        from app.ingestion.seed_trade_comprehensive import seed_comprehensive_trade
        seed_comprehensive_trade()


def run_seed_commodities():
    step(7, TOTAL_STEPS, "Seed commodities & supply dependencies")
    with _timer("commodities"):
        from app.ingestion.seed_commodities import seed_commodities
        seed_commodities()


def run_seed_geopolitical():
    step(8, TOTAL_STEPS, "Seed geopolitical data (sanctions, conflicts, risk scores)")
    with _timer("geopolitical"):
        from app.ingestion.seed_geopolitical import seed_geopolitical
        seed_geopolitical()


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="GEFO – one-command database setup & seeding",
    )
    parser.add_argument(
        "--seed", action="store_true",
        help="Re-seed data only (skip schema creation)",
    )
    parser.add_argument(
        "--check", action="store_true",
        help="Print current table counts and exit",
    )
    args = parser.parse_args()

    log.info("╔══════════════════════════════════════╗")
    log.info("║       GEFO – Database Setup          ║")
    log.info("╚══════════════════════════════════════╝")

    # Always verify connectivity first
    check_postgres()

    if args.check:
        print_counts()
        return

    t0 = time.perf_counter()

    if not args.seed:
        run_init_schema()

    run_seed_countries()
    run_seed_ports()
    run_seed_airports()
    run_seed_shipping()
    run_seed_trade()
    run_seed_commodities()
    run_seed_geopolitical()

    elapsed = time.perf_counter() - t0
    log.info("")
    log.info("═══ Setup complete in %.1fs ═══", elapsed)
    log.info("")
    print_counts()
    log.info("")
    log.info("Next steps:")
    log.info("  1. Start backend:  cd backend && uvicorn app.main:app --reload")
    log.info("  2. Start frontend: cd frontend && npm run dev")
    log.info("  3. Open http://localhost:3000")


if __name__ == "__main__":
    main()

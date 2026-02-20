"""
Database initialization and table creation script.
Run this once to set up the database schema.
"""
import logging
from sqlalchemy import text

from app.core.database import engine, Base
from app.models.country import Country
from app.models.trade_flow import TradeFlow
from app.models.port import Port
from app.models.shipping_density import ShippingDensity
from app.models.chokepoint import Chokepoint
from app.models.user import User, APIKey
from app.models.alert import AlertRule, Alert, NotificationChannel
from app.models.usage_log import APIUsageLog
from app.models.geopolitical import SanctionedEntity, ConflictZone, CountryRiskScore, SupplyChainRoute
from app.models.analytics import TradeForecast, TradeAnomaly
from app.models.import_job import ImportJob, DataSource

logger = logging.getLogger(__name__)


def init_db():
    """Create all tables and enable PostGIS extension."""
    # Enable PostGIS
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis;"))
        conn.commit()
        logger.info("PostGIS extension enabled")

    # Create all tables
    Base.metadata.create_all(bind=engine)
    logger.info("All tables created successfully")


def drop_all():
    """Drop all tables (use with caution)."""
    Base.metadata.drop_all(bind=engine)
    logger.info("All tables dropped")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    init_db()
    print("Database initialized successfully!")

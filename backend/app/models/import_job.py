"""
Data Pipeline & Import models — Phase 9.

Tracks import jobs: file uploads, API fetches, validation status, error logs.
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, Text, JSON, Boolean
from sqlalchemy.sql import func

from app.core.database import Base


class ImportJob(Base):
    """Tracks each data import — file upload or API fetch."""
    __tablename__ = "import_jobs"

    id = Column(Integer, primary_key=True, index=True)
    # Who initiated
    user_id = Column(Integer, nullable=True)  # null for system/scheduled imports

    # Source info
    source_type = Column(String(20), nullable=False)   # 'csv', 'excel', 'api', 'json'
    source_name = Column(String(500), nullable=False)   # filename or API name
    target_table = Column(String(100), nullable=False)  # 'trade_flows', 'countries', 'ports', etc.

    # Status tracking
    status = Column(String(20), nullable=False, default="pending")
    # pending → validating → importing → completed / failed
    progress_pct = Column(Float, default=0.0)

    # Counts
    total_rows = Column(Integer, default=0)
    valid_rows = Column(Integer, default=0)
    imported_rows = Column(Integer, default=0)
    skipped_rows = Column(Integer, default=0)
    error_rows = Column(Integer, default=0)

    # Column mapping (user-defined or auto-detected)
    column_mapping = Column(JSON, nullable=True)
    # e.g. {"file_col": "db_col", "Exporter": "exporter_iso", ...}

    # Options
    import_mode = Column(String(20), default="append")  # 'append', 'replace', 'upsert'
    year_filter = Column(Integer, nullable=True)  # if replacing for a specific year

    # Errors
    error_log = Column(JSON, nullable=True)
    # [{row: 5, field: "trade_value_usd", error: "not a number"}, ...]
    error_summary = Column(Text, nullable=True)

    # Validation preview (first N rows parsed)
    preview_data = Column(JSON, nullable=True)

    # Timing
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)


class DataSource(Base):
    """Registered external data sources for scheduled refresh."""
    __tablename__ = "data_sources"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False, unique=True)
    source_type = Column(String(20), nullable=False)  # 'comtrade', 'worldbank', 'custom_api'
    url = Column(String(1000), nullable=True)
    api_key = Column(String(500), nullable=True)
    target_table = Column(String(100), nullable=False)
    schedule_cron = Column(String(50), nullable=True)  # e.g. "0 2 * * 0" (weekly)
    is_active = Column(Boolean, default=True)
    last_fetch_at = Column(DateTime(timezone=True), nullable=True)
    last_status = Column(String(20), nullable=True)
    config = Column(JSON, nullable=True)  # source-specific params
    created_at = Column(DateTime(timezone=True), server_default=func.now())

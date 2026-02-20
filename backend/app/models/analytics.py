"""
Analytics & Forecasting models.

Stores computed forecasts and detected anomalies so they can be
served instantly without re-running expensive computations.
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Boolean
from sqlalchemy.sql import func

from app.core.database import Base


class TradeForecast(Base):
    """Stored trade-flow forecast for a country pair or single country."""
    __tablename__ = "trade_forecasts"

    id = Column(Integer, primary_key=True, index=True)
    iso_code = Column(String(3), nullable=False, index=True)
    partner_iso = Column(String(3), nullable=True)          # null = aggregate
    direction = Column(String(10), nullable=False)           # 'export' | 'import' | 'total'
    forecast_year = Column(Integer, nullable=False)
    forecast_month = Column(Integer, nullable=True)          # null = annual
    predicted_value = Column(Float, nullable=False)
    lower_bound = Column(Float, nullable=True)               # 80% CI
    upper_bound = Column(Float, nullable=True)
    model_used = Column(String(50), nullable=False)          # 'linear', 'holt_winters', 'arima'
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class TradeAnomaly(Base):
    """Detected anomaly in trade flows."""
    __tablename__ = "trade_anomalies"

    id = Column(Integer, primary_key=True, index=True)
    iso_code = Column(String(3), nullable=False, index=True)
    partner_iso = Column(String(3), nullable=True)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=True)
    direction = Column(String(10), nullable=False)
    actual_value = Column(Float, nullable=False)
    expected_value = Column(Float, nullable=False)
    z_score = Column(Float, nullable=False)
    anomaly_type = Column(String(20), nullable=False)        # 'spike' | 'drop' | 'structural_break'
    severity = Column(String(10), nullable=False)            # 'low' | 'medium' | 'high' | 'critical'
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    detected_at = Column(DateTime(timezone=True), server_default=func.now())

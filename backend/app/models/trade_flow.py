from sqlalchemy import Column, Integer, String, Float, ForeignKey
from app.core.database import Base


class TradeFlow(Base):
    __tablename__ = "trade_flows"

    id = Column(Integer, primary_key=True, index=True)
    exporter_iso = Column(String(3), ForeignKey("countries.iso_code"), nullable=False, index=True)
    importer_iso = Column(String(3), ForeignKey("countries.iso_code"), nullable=False, index=True)
    year = Column(Integer, nullable=False, index=True)
    month = Column(Integer, nullable=True)
    commodity_code = Column(String(10), nullable=True)
    commodity_description = Column(String(500), nullable=True)
    trade_value_usd = Column(Float, nullable=False)
    weight_kg = Column(Float, nullable=True)
    flow_type = Column(String(10), nullable=False)  # 'export' or 'import'

    def __repr__(self):
        return f"<TradeFlow({self.exporter_iso} -> {self.importer_iso}, ${self.trade_value_usd:,.0f})>"

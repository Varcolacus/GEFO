from sqlalchemy import Column, Integer, String, Float, UniqueConstraint, Index
from app.core.database import Base


class RailFreight(Base):
    __tablename__ = "rail_freight"

    id = Column(Integer, primary_key=True, index=True)
    origin_iso = Column(String(3), nullable=False, index=True)
    destination_iso = Column(String(3), nullable=False, index=True)
    year = Column(Integer, nullable=False, index=True)
    tonnes = Column(Float, nullable=True)          # thousand tonnes
    tonne_km = Column(Float, nullable=True)         # million tonne-km (if available)

    __table_args__ = (
        UniqueConstraint("origin_iso", "destination_iso", "year", name="uq_rail_freight_od_year"),
        Index("ix_rail_freight_year", "year"),
    )

    def __repr__(self):
        return f"<RailFreight({self.origin_iso}->{self.destination_iso}, {self.year}, {self.tonnes}kt)>"

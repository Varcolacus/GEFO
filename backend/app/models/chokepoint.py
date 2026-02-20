"""
Chokepoint model — strategic maritime chokepoints monitored for traffic stress.
Phase 2: Intelligence Layer.
"""
from sqlalchemy import Column, Integer, String, Float
from app.core.database import Base


class Chokepoint(Base):
    __tablename__ = "chokepoints"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    baseline_density = Column(Float, nullable=False)       # 5-year average density
    baseline_std = Column(Float, nullable=False)            # 5-year standard deviation
    current_density = Column(Float, nullable=True)          # latest observed density
    stress_score = Column(Float, nullable=True)             # z-score: (current - baseline) / std
    stress_level = Column(String(20), nullable=True)        # low / elevated / high / critical
    capacity_estimate = Column(Float, nullable=True)        # max daily vessel transits
    year = Column(Integer, nullable=True)
    quarter = Column(Integer, nullable=True)
    region = Column(String(100), nullable=True)
    description = Column(String(500), nullable=True)
    # Energy corridor relevance (% of global oil/LNG transiting)
    oil_share_pct = Column(Float, nullable=True)
    lng_share_pct = Column(Float, nullable=True)

    def __repr__(self):
        return f"<Chokepoint({self.name}, stress={self.stress_level})>"

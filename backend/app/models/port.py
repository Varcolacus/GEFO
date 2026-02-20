from sqlalchemy import Column, Integer, String, Float
from app.core.database import Base


class Port(Base):
    __tablename__ = "ports"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    country_iso = Column(String(3), nullable=False, index=True)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    port_type = Column(String(50), nullable=True)  # container, bulk, oil, etc.
    throughput_teu = Column(Float, nullable=True)  # TEU for container ports
    throughput_tons = Column(Float, nullable=True)  # Metric tons
    year = Column(Integer, nullable=True)
    unlocode = Column(String(10), nullable=True, unique=True)

    def __repr__(self):
        return f"<Port(name={self.name}, country={self.country_iso})>"

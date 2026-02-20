from sqlalchemy import Column, Integer, String, Float
from geoalchemy2 import Geometry
from app.core.database import Base


class ShippingDensity(Base):
    __tablename__ = "shipping_density"

    id = Column(Integer, primary_key=True, index=True)
    region_name = Column(String(255), nullable=True)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    year = Column(Integer, nullable=False, index=True)
    month = Column(Integer, nullable=False, index=True)
    density_value = Column(Float, nullable=False)
    vessel_type = Column(String(50), nullable=True)  # cargo, tanker, bulk, all
    grid_cell = Column(Geometry("POLYGON", srid=4326), nullable=True)

    def __repr__(self):
        return f"<ShippingDensity(lat={self.lat}, lon={self.lon}, density={self.density_value})>"

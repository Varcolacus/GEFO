from sqlalchemy import Column, Integer, String, Float, Text, Boolean
from geoalchemy2 import Geometry
from app.core.database import Base


class Country(Base):
    __tablename__ = "countries"

    id = Column(Integer, primary_key=True, index=True)
    iso_code = Column(String(3), unique=True, nullable=False, index=True)
    iso_code_2 = Column(String(2), unique=True, nullable=True)
    name = Column(String(255), nullable=False)
    name_local = Column(String(255), nullable=True)  # Name in local language (from globe)
    region = Column(String(100))
    sub_region = Column(String(100))
    capital = Column(String(255), nullable=True)
    flag_emoji = Column(String(10), nullable=True)
    income_group = Column(String(50), nullable=True)  # World Bank classification
    gdp = Column(Float, nullable=True)
    gdp_per_capita = Column(Float, nullable=True)
    trade_balance = Column(Float, nullable=True)
    current_account = Column(Float, nullable=True)
    export_value = Column(Float, nullable=True)
    import_value = Column(Float, nullable=True)
    population = Column(Float, nullable=True)
    geometry = Column(Geometry("MULTIPOLYGON", srid=4326), nullable=True)
    centroid_lat = Column(Float, nullable=True)
    centroid_lon = Column(Float, nullable=True)

    def __repr__(self):
        return f"<Country(iso_code={self.iso_code}, name={self.name})>"

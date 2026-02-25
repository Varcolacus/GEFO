from sqlalchemy import Column, Integer, String, Float
from app.core.database import Base


class Airport(Base):
    __tablename__ = "airports"

    id = Column(Integer, primary_key=True, index=True)
    iata = Column(String(3), nullable=True, index=True, unique=True)
    icao = Column(String(4), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    city = Column(String(255), nullable=True)
    country_iso = Column(String(3), nullable=False, index=True)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    elevation_ft = Column(Integer, nullable=True)
    airport_type = Column(String(50), nullable=True)       # large_airport, medium_airport, small_airport
    pax_annual = Column(Float, nullable=True)               # annual passengers (millions)
    runways = Column(Integer, nullable=True)
    continent = Column(String(2), nullable=True)            # AF, AN, AS, EU, NA, OC, SA

    def __repr__(self):
        return f"<Airport(iata={self.iata}, name={self.name}, country={self.country_iso})>"

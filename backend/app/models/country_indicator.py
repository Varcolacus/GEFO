from sqlalchemy import Column, Integer, String, Float, UniqueConstraint, Index
from app.core.database import Base


class CountryIndicator(Base):
    __tablename__ = "country_indicators"

    id = Column(Integer, primary_key=True, index=True)
    iso_code = Column(String(3), nullable=False, index=True)
    year = Column(Integer, nullable=False, index=True)
    indicator = Column(String(100), nullable=False, index=True)
    value = Column(Float, nullable=True)

    __table_args__ = (
        UniqueConstraint("iso_code", "year", "indicator", name="uq_country_year_indicator"),
        Index("ix_country_indicator_lookup", "indicator", "year"),
    )

    def __repr__(self):
        return f"<CountryIndicator({self.iso_code}, {self.year}, {self.indicator}={self.value})>"

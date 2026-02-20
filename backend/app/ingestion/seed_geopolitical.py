"""Seed sanctions, conflict zones, and supply chain route data."""
import sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from datetime import date
from sqlalchemy.orm import Session
from app.core.database import SessionLocal, engine, Base
from app.models.geopolitical import SanctionedEntity, ConflictZone, CountryRiskScore, SupplyChainRoute

# Ensure tables exist
from app.models.country import Country
from app.models.trade_flow import TradeFlow
from app.models.port import Port
from app.models.shipping_density import ShippingDensity
from app.models.chokepoint import Chokepoint
from app.models.user import User, APIKey
from app.models.alert import AlertRule, Alert, NotificationChannel
from app.models.usage_log import APIUsageLog
Base.metadata.create_all(bind=engine)

SANCTIONED_ENTITIES = [
    # Russia
    {"entity_type": "country", "name": "Russian Federation", "country_iso": "RUS",
     "sanctioning_body": "EU", "programme": "EU Russia Sanctions",
     "reason": "Military aggression against Ukraine", "date_listed": date(2022, 2, 25)},
    {"entity_type": "country", "name": "Russian Federation", "country_iso": "RUS",
     "sanctioning_body": "US_OFAC", "programme": "Russia-related Sanctions",
     "reason": "Invasion of Ukraine", "date_listed": date(2022, 2, 24)},
    {"entity_type": "country", "name": "Russian Federation", "country_iso": "RUS",
     "sanctioning_body": "UK_OFSI", "programme": "Russia Sanctions Regime",
     "reason": "Territorial aggression", "date_listed": date(2022, 2, 24)},
    {"entity_type": "entity", "name": "Rosneft Oil Company", "country_iso": "RUS",
     "sanctioning_body": "US_OFAC", "programme": "SSI Directive 4",
     "reason": "Russian energy sector", "date_listed": date(2014, 7, 16)},
    {"entity_type": "entity", "name": "Gazprom", "country_iso": "RUS",
     "sanctioning_body": "EU", "programme": "EU Energy Sanctions",
     "reason": "State-owned energy company weaponising gas supplies", "date_listed": date(2022, 10, 6)},
    {"entity_type": "vessel", "name": "SCF Primorye (tanker)", "country_iso": "RUS",
     "sanctioning_body": "US_OFAC", "programme": "Shadow Fleet Designations",
     "reason": "Transporting Russian crude above price cap", "date_listed": date(2023, 11, 16)},

    # North Korea
    {"entity_type": "country", "name": "Democratic People's Republic of Korea", "country_iso": "PRK",
     "sanctioning_body": "UN", "programme": "DPRK Sanctions (UNSCR 1718)",
     "reason": "Nuclear weapons programme", "date_listed": date(2006, 10, 14)},
    {"entity_type": "country", "name": "Democratic People's Republic of Korea", "country_iso": "PRK",
     "sanctioning_body": "US_OFAC", "programme": "North Korea Sanctions",
     "reason": "WMD proliferation", "date_listed": date(2008, 6, 26)},
    {"entity_type": "entity", "name": "Korea Mining Development Trading Corp (KOMID)", "country_iso": "PRK",
     "sanctioning_body": "UN", "programme": "UNSCR 1718",
     "reason": "Arms dealer and WMD proliferator", "date_listed": date(2009, 4, 24)},

    # Iran
    {"entity_type": "country", "name": "Islamic Republic of Iran", "country_iso": "IRN",
     "sanctioning_body": "US_OFAC", "programme": "Iran Sanctions",
     "reason": "Nuclear programme and support for terrorism", "date_listed": date(2012, 2, 6)},
    {"entity_type": "country", "name": "Islamic Republic of Iran", "country_iso": "IRN",
     "sanctioning_body": "EU", "programme": "EU Iran Sanctions",
     "reason": "Nuclear proliferation concerns", "date_listed": date(2012, 1, 23)},
    {"entity_type": "entity", "name": "National Iranian Oil Company (NIOC)", "country_iso": "IRN",
     "sanctioning_body": "US_OFAC", "programme": "Iran-EO13846",
     "reason": "Iranian petroleum sector", "date_listed": date(2018, 11, 5)},
    {"entity_type": "entity", "name": "Islamic Revolutionary Guard Corps (IRGC)", "country_iso": "IRN",
     "sanctioning_body": "US_OFAC", "programme": "Iran-IRGC",
     "reason": "Designated Foreign Terrorist Organization", "date_listed": date(2019, 4, 15)},

    # Syria
    {"entity_type": "country", "name": "Syrian Arab Republic", "country_iso": "SYR",
     "sanctioning_body": "US_OFAC", "programme": "Syria Sanctions",
     "reason": "Human rights abuses and civil war", "date_listed": date(2011, 8, 18)},
    {"entity_type": "country", "name": "Syrian Arab Republic", "country_iso": "SYR",
     "sanctioning_body": "EU", "programme": "EU Syria Sanctions",
     "reason": "Violent repression of civilian population", "date_listed": date(2011, 5, 9)},

    # Venezuela
    {"entity_type": "country", "name": "Bolivarian Republic of Venezuela", "country_iso": "VEN",
     "sanctioning_body": "US_OFAC", "programme": "Venezuela Sanctions",
     "reason": "Democratic backsliding and human rights", "date_listed": date(2017, 8, 25)},
    {"entity_type": "entity", "name": "Petróleos de Venezuela S.A. (PDVSA)", "country_iso": "VEN",
     "sanctioning_body": "US_OFAC", "programme": "Venezuela-EO13850",
     "reason": "State oil company controlled by Maduro regime", "date_listed": date(2019, 1, 28)},

    # Myanmar
    {"entity_type": "country", "name": "Republic of the Union of Myanmar", "country_iso": "MMR",
     "sanctioning_body": "US_OFAC", "programme": "Burma Sanctions",
     "reason": "Military coup and human rights abuses", "date_listed": date(2021, 2, 11)},
    {"entity_type": "country", "name": "Republic of the Union of Myanmar", "country_iso": "MMR",
     "sanctioning_body": "EU", "programme": "EU Myanmar Sanctions",
     "reason": "Military coup", "date_listed": date(2021, 3, 22)},

    # Belarus
    {"entity_type": "country", "name": "Republic of Belarus", "country_iso": "BLR",
     "sanctioning_body": "EU", "programme": "EU Belarus Sanctions",
     "reason": "Complicity in invasion of Ukraine and election fraud", "date_listed": date(2020, 10, 2)},
    {"entity_type": "country", "name": "Republic of Belarus", "country_iso": "BLR",
     "sanctioning_body": "US_OFAC", "programme": "Belarus Sanctions",
     "reason": "Enabling Russian military operations", "date_listed": date(2022, 2, 24)},

    # Cuba
    {"entity_type": "country", "name": "Republic of Cuba", "country_iso": "CUB",
     "sanctioning_body": "US_OFAC", "programme": "Cuba Sanctions",
     "reason": "Authoritarian governance and human rights", "date_listed": date(1962, 2, 7)},
]

CONFLICT_ZONES = [
    {
        "name": "Ukraine-Russia War Zone",
        "zone_type": "armed_conflict",
        "severity": "critical",
        "lat": 48.5,
        "lon": 37.5,
        "radius_km": 600,
        "affected_countries": ["UKR", "RUS", "BLR"],
        "affected_chokepoints": ["Turkish Straits"],
        "start_date": date(2022, 2, 24),
        "source": "ACLED / UN OCHA",
    },
    {
        "name": "Red Sea / Bab el-Mandeb (Houthi Attacks)",
        "zone_type": "piracy",
        "severity": "critical",
        "lat": 13.5,
        "lon": 42.5,
        "radius_km": 350,
        "affected_countries": ["YEM", "SAU", "ERI", "DJI"],
        "affected_chokepoints": ["Bab el-Mandeb", "Suez Canal"],
        "start_date": date(2023, 11, 19),
        "source": "UKMTO / IMB",
    },
    {
        "name": "South China Sea Territorial Disputes",
        "zone_type": "territorial_dispute",
        "severity": "high",
        "lat": 12.0,
        "lon": 114.0,
        "radius_km": 800,
        "affected_countries": ["CHN", "PHL", "VNM", "TWN", "MYS", "BRN"],
        "affected_chokepoints": ["Strait of Malacca"],
        "start_date": date(2013, 1, 1),
        "source": "CSIS AMTI",
    },
    {
        "name": "Gaza Conflict Zone",
        "zone_type": "armed_conflict",
        "severity": "critical",
        "lat": 31.4,
        "lon": 34.4,
        "radius_km": 80,
        "affected_countries": ["PSE", "ISR", "EGY"],
        "affected_chokepoints": ["Suez Canal"],
        "start_date": date(2023, 10, 7),
        "source": "UN OCHA",
    },
    {
        "name": "Sahel Insurgency Belt",
        "zone_type": "armed_conflict",
        "severity": "high",
        "lat": 14.0,
        "lon": 2.0,
        "radius_km": 1200,
        "affected_countries": ["MLI", "BFA", "NER", "NGA", "TCD"],
        "affected_chokepoints": [],
        "start_date": date(2012, 1, 1),
        "source": "ACLED",
    },
    {
        "name": "Taiwan Strait Tensions",
        "zone_type": "territorial_dispute",
        "severity": "high",
        "lat": 24.0,
        "lon": 119.5,
        "radius_km": 300,
        "affected_countries": ["TWN", "CHN"],
        "affected_chokepoints": ["Strait of Malacca"],
        "start_date": date(2022, 8, 1),
        "source": "CSIS / DoD",
    },
    {
        "name": "Gulf of Guinea Piracy Zone",
        "zone_type": "piracy",
        "severity": "moderate",
        "lat": 4.0,
        "lon": 3.0,
        "radius_km": 500,
        "affected_countries": ["NGA", "GHA", "CMR", "GNQ"],
        "affected_chokepoints": [],
        "start_date": date(2018, 1, 1),
        "source": "IMB Piracy Reporting Centre",
    },
    {
        "name": "Horn of Africa / Somalia",
        "zone_type": "piracy",
        "severity": "moderate",
        "lat": 5.0,
        "lon": 48.0,
        "radius_km": 600,
        "affected_countries": ["SOM", "ETH", "KEN", "DJI"],
        "affected_chokepoints": ["Bab el-Mandeb"],
        "start_date": date(2008, 1, 1),
        "source": "IMB / EU NAVFOR",
    },
    {
        "name": "Strait of Hormuz Tensions",
        "zone_type": "territorial_dispute",
        "severity": "high",
        "lat": 26.5,
        "lon": 56.5,
        "radius_km": 200,
        "affected_countries": ["IRN", "OMN", "ARE", "SAU"],
        "affected_chokepoints": ["Strait of Hormuz"],
        "start_date": date(2019, 5, 1),
        "source": "CENTCOM / Lloyd's List",
    },
    {
        "name": "Sudan Civil War",
        "zone_type": "civil_unrest",
        "severity": "high",
        "lat": 15.6,
        "lon": 32.5,
        "radius_km": 500,
        "affected_countries": ["SDN", "TCD", "SSD", "EGY"],
        "affected_chokepoints": ["Suez Canal"],
        "start_date": date(2023, 4, 15),
        "source": "ACLED / UN OCHA",
    },
]


def seed_geopolitical():
    db: Session = SessionLocal()
    try:
        # --- Sanctions ---
        existing_sanctions = db.query(SanctionedEntity).count()
        if existing_sanctions == 0:
            for s in SANCTIONED_ENTITIES:
                # Verify country exists
                from app.models.country import Country
                country = db.query(Country).filter(Country.iso_code == s["country_iso"]).first()
                if not country:
                    print(f"  ⚠ Skipping sanction for {s['country_iso']} — country not in DB")
                    continue
                entity = SanctionedEntity(**s, is_active=True)
                db.add(entity)
            db.commit()
            count = db.query(SanctionedEntity).count()
            print(f"  ✓ Seeded {count} sanctioned entities")
        else:
            print(f"  → {existing_sanctions} sanctioned entities already exist, skipping")

        # --- Conflict Zones ---
        existing_zones = db.query(ConflictZone).count()
        if existing_zones == 0:
            for cz in CONFLICT_ZONES:
                cz_copy = dict(cz)
                cz_copy["affected_countries"] = json.dumps(cz_copy.get("affected_countries", []))
                cz_copy["affected_chokepoints"] = json.dumps(cz_copy.get("affected_chokepoints", []))
                zone = ConflictZone(**cz_copy, is_active=True)
                db.add(zone)
            db.commit()
            count = db.query(ConflictZone).count()
            print(f"  ✓ Seeded {count} conflict zones")
        else:
            print(f"  → {existing_zones} conflict zones already exist, skipping")

        print("Geopolitical seed complete.")
    except Exception as e:
        db.rollback()
        print(f"Error seeding geopolitical data: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_geopolitical()

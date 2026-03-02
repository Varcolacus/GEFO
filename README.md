# GEFO – Global Economic Flow Observatory

Real-time 3D globe for monitoring international trade flows, vessel tracking, port activity, and geopolitical risk.

## Quick Start

### Prerequisites

| Dependency | Version | Notes |
|---|---|---|
| **PostgreSQL** | 14+ | With PostGIS extension |
| **Python** | 3.10+ | Backend |
| **Node.js** | 18+ | Frontend |

### Option A: Docker (recommended)

```bash
docker compose up -d
```

This starts PostgreSQL + PostGIS, the backend, frontend, and nginx. Open http://localhost:3000.

### Option B: Local Development

```bash
# 1. Start PostgreSQL (or use Docker for just the database)
docker compose up -d db

# 2. Backend setup
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # Linux/macOS
pip install -r requirements.txt

# 3. Frontend setup
cd ../frontend
npm install

# 4. Database setup & seeding (one command!)
cd ..
python setup.py

# 5. Start servers
cd backend && uvicorn app.main:app --reload &
cd frontend && npm run dev &
```

Open http://localhost:3000.

### Database Setup

The globe needs seeded data to display countries, trade flows, ports, etc. Run: 

```bash
python setup.py           # Full setup: schema + all seed data
python setup.py --seed    # Re-seed only (schema already exists)
python setup.py --check   # Print current table counts
```

This populates ~266 countries, ~500 trade corridors, ~50 ports, ~95 airports, shipping density grids, commodities, and geopolitical data (sanctions, conflict zones, risk scores).

### Environment Variables

Copy and adjust as needed:

```bash
# backend/.env
DATABASE_URL=postgresql://gefo_user:gefo_password@localhost:5432/gefo_db
AISSTREAM_API_KEY=           # Free: https://aisstream.io
AISHUB_USERNAME=             # Optional: https://www.aishub.net

# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Architecture

```
backend/        FastAPI + SQLAlchemy + PostGIS
frontend/       Next.js + CesiumJS (3D globe)
data/           Shapefiles & raw data
deploy/         nginx config, deploy scripts
setup.py        One-command DB setup & seeding
```

## API

Backend runs on http://localhost:8000. Key endpoints:

- `GET /api/countries` – all countries with geometry
- `GET /api/trade_flows/aggregated` – bilateral trade data
- `GET /api/ports` – world ports
- `GET /api/vessels/positions` – live AIS vessel positions
- `WS  /ws/live` – real-time event stream

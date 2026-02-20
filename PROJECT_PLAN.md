# GLOBAL ECONOMIC FLOW OBSERVATORY (GEFO)

**Project Execution Blueprint**  
*Created: February 20, 2026*

---

## 0️⃣ STRATEGIC OBJECTIVE

Build a web-based 3D geoeconomic intelligence platform that:

1. Visualizes global economic flows on a 3D globe
2. Integrates macroeconomic + physical flow data
3. Produces analytical insights (reports + indicators)
4. Can scale into institutional-grade platform

---

## 1️⃣ PHASE STRUCTURE OVERVIEW

| Phase   | Goal                                    | Duration    | Budget            |
| ------- | --------------------------------------- | ----------- | ----------------- |
| Phase 1 | Functional MVP (static + delayed data)  | 3–4 months  | ~0–30€/month      |
| Phase 2 | Analytical engine + original indicators | 3–6 months  | minimal           |
| Phase 3 | Monetization layer                      | 6–12 months | funded by revenue |
| Phase 4 | Selective real-time feeds               | Year 2+     | revenue-funded    |

---

## 2️⃣ PHASE 1 — CORE MVP BUILD

### 2.1 Frontend Stack

Technologies:
- **CesiumJS** — 3D globe rendering
- **React** or **Next.js** — UI framework
- **Tailwind CSS** — Light UI styling

**Deliverable:** Interactive 3D globe with data layers toggle panel.

---

### 2.2 Backend Stack

Technologies:
- **Python** — Core language
- **FastAPI** — REST API framework
- **PostgreSQL** — Primary database
- **PostGIS** — Spatial extension
- **Basic REST API endpoints**

**Constraints:**
- No microservices
- No Kubernetes
- No cloud complexity

**Deployment:** Cheap VPS (Hetzner / OVH / DigitalOcean)

---

### 2.3 Data Sources (Free Only)

#### A) Trade Data
- UN Comtrade API
- World Bank API
- IMF datasets (delayed acceptable)

#### B) Shipping (Delayed)
- Public AIS samples
- Kaggle maritime datasets
- Open AIS research datasets

#### C) Geography
- OpenStreetMap
- Natural Earth shapefiles

---

### 2.4 MVP Features (Strict Scope)

#### 1. Country Macro Coloring
- GDP
- Trade balance
- Current account
- Export intensity

#### 2. Animated Trade Flows
- Bilateral trade lines
- Thickness proportional to trade value
- Directional animation

#### 3. Port Layer
- Major ports
- Static markers
- Throughput data (if available)

#### 4. Shipping Density Heatmap (Delayed Data OK)
- Regional aggregation
- Monthly average density

#### 5. Layer Control Panel
User toggles:
- Trade flows
- Ports
- Shipping density
- Macro indicators

**Note:** No AI yet. No predictions yet.

---

## 3️⃣ DATA ARCHITECTURE SPECIFICATION

### Data Pipeline Structure

1. **Raw ingestion scripts** — Fetch from public APIs
2. **Normalization layer** — Standardize formats
3. **Aggregation layer** — Create analytical datasets
4. **API output** — Serve to frontend

### Update Schedule
- Cron jobs
- Monthly updates

### Storage Requirements
All datasets stored with:
- Time dimension
- Geographic reference
- ISO country codes

---

## 4️⃣ PHASE 2 — INTELLIGENCE LAYER

Build after MVP validation.

### 4.1 Derived Indicators

#### 1. Trade Flow Intensity Index (TFII)
Shipping density vs export value correlation.

#### 2. Port Stress Indicator
Deviation from historical shipping averages.

#### 3. Energy Corridor Exposure Index
Map oil/gas flows across chokepoints.

---

### 4.2 Geopolitical Chokepoint Module

Predefine monitoring for:
- Strait of Hormuz
- Suez Canal
- Panama Canal
- Strait of Malacca
- Bab el-Mandeb

For each:
- Measure traffic density
- Compare vs historical average
- Output stress score

---

## 5️⃣ PHASE 3 — MONETIZATION STRUCTURE

### Public Tier
- Delayed data
- Monthly updates
- Limited layers

### Pro Tier
- Extended history
- Custom dashboards
- Downloadable CSV
- API access

### Institutional Tier
- Custom indicators
- Dedicated reports
- Early alert system

---

## 6️⃣ INFRASTRUCTURE PLAN (LOW COST)

### Initial Deployment
- 1 VPS (4GB RAM)
- PostgreSQL + API + frontend (single server)
- Nginx reverse proxy

### Expected Cost
20–40€/month

**Constraint:** No AWS complexity initially.

---

## 7️⃣ CONTENT STRATEGY (CRITICAL)

Parallel to development, publish:
- Monthly global trade analysis
- Port congestion review
- Energy route risk report
- Shipping vs trade divergence analysis

**Platform becomes:** Visualization support for intellectual output.

---

## 8️⃣ YEAR 2 SCALING DECISION

Only after revenue, consider purchasing:
- Regional AIS feeds
- Commodity-specific maritime data
- Aviation flow subsets

**DO NOT buy global real-time feeds early.**

---

## 9️⃣ COMPETITIVE POSITIONING

### DO NOT market as:
- MarineTraffic clone
- FlightRadar24 clone

### Market as:
**"Geoeconomic Intelligence Platform"**

Core value proposition:
> You sell interpretation. Not tracking.

---

## 🔟 SUCCESS METRICS

### Phase 1 Success
- Stable globe rendering
- 5+ working data layers
- Monthly data updates functioning

### Phase 2 Success
- At least 2 proprietary indicators deployed
- 3 published analytical reports

### Phase 3 Success
- First paying subscriber
- Institutional interest/inquiry

---

## 11️⃣ BIG RISKS

Avoid:
- ❌ Overengineering infrastructure
- ❌ Premature AI integration
- ❌ Expensive data contracts
- ❌ Global real-time obsession

---

## 12️⃣ WHAT MAKES THIS WORK

**Your competitive edge:**

✅ Macro understanding + spatial visualization  
✅ NOT raw data ownership  
✅ NOT infrastructure scale  
✅ NOT tech complexity  

---

## 📋 PROJECT STRUCTURE

```
GEFO/
├── PROJECT_PLAN.md          (this file)
├── frontend/                (React/Next.js + CesiumJS)
├── backend/                 (FastAPI + Python)
├── data/                    (Data ingestion pipelines)
└── docs/                    (Technical documentation)
```

---

## 🚀 NEXT STEPS

1. Initialize project directory structure
2. Set up frontend scaffold (React + CesiumJS)
3. Set up backend scaffold (FastAPI + PostgreSQL)
4. Create first data ingestion pipeline
5. Integrate data sources
6. Build MVP visualization

---

**Status:** Planning Phase  
**Last Updated:** February 20, 2026

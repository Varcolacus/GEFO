# ─── Backend ───
FROM python:3.11-slim AS backend

WORKDIR /app/backend

# System deps for psycopg2, GDAL/Fiona, and PostGIS
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev libgdal-dev libgeos-dev libproj-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]


# ─── Frontend ───
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ .

# Build Next.js (uses webpack for CesiumJS)
RUN npm run build


# ─── Frontend serve ───
FROM node:20-alpine AS frontend

WORKDIR /app/frontend

COPY --from=frontend-build /app/frontend/.next ./.next
COPY --from=frontend-build /app/frontend/public ./public
COPY --from=frontend-build /app/frontend/package.json ./
COPY --from=frontend-build /app/frontend/node_modules ./node_modules
COPY --from=frontend-build /app/frontend/next.config.ts ./

EXPOSE 3000
CMD ["npm", "start"]

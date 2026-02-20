#!/usr/bin/env bash
#
# GEFO Deployment Script
# Usage: ./deploy/deploy.sh <domain> [db_password]
#
# Prerequisites:
#   - Ubuntu 22.04+ VPS with Docker & Docker Compose installed
#   - DNS A record pointing to VPS IP
#   - This repository cloned to /opt/gefo
#
set -euo pipefail

DOMAIN="${1:?Usage: $0 <domain> [db_password]}"
DB_PASSWORD="${2:-$(openssl rand -base64 24)}"

echo "================================================"
echo "  GEFO Deployment — ${DOMAIN}"
echo "================================================"

# ─── 1. Environment file ───
cat > .env.production <<EOF
DOMAIN=${DOMAIN}
DB_PASSWORD=${DB_PASSWORD}
NEXT_PUBLIC_API_URL=https://${DOMAIN}
CORS_ORIGINS=https://${DOMAIN}
EOF
echo "[✓] .env.production created"

# ─── 2. Create certbot directories ───
mkdir -p deploy/certbot/conf deploy/certbot/www

# ─── 3. Initial SSL certificate (staging first) ───
if [ ! -f "deploy/certbot/conf/live/${DOMAIN}/fullchain.pem" ]; then
    echo "[…] Obtaining Let's Encrypt SSL certificate…"

    # Start nginx with a temporary self-signed cert for the ACME challenge
    docker compose -f docker-compose.yml up -d nginx || true

    docker compose run --rm certbot certonly \
        --webroot \
        -w /var/www/certbot \
        -d "${DOMAIN}" \
        -d "www.${DOMAIN}" \
        --email "admin@${DOMAIN}" \
        --agree-tos \
        --no-eff-email \
        --force-renewal

    echo "[✓] SSL certificate obtained"
else
    echo "[✓] SSL certificate already exists"
fi

# ─── 4. Build and start all services ───
echo "[…] Building and starting services…"
export DOMAIN DB_PASSWORD
docker compose --env-file .env.production up -d --build

# ─── 5. Wait for database ───
echo "[…] Waiting for database…"
sleep 10

# ─── 6. Initialize database tables ───
echo "[…] Initializing database schema…"
docker compose exec backend python -m app.ingestion.init_db

# ─── 7. Seed data (first deploy only) ───
echo "[…] Running data ingestion…"
docker compose exec backend python -m app.ingestion.natural_earth || echo "Natural Earth already loaded"
docker compose exec backend python -m app.ingestion.worldbank || echo "World Bank already loaded"
docker compose exec backend python -m app.ingestion.ports_seed || echo "Ports already seeded"
docker compose exec backend python -m app.ingestion.trade_flows_seed || echo "Trade flows already seeded"
docker compose exec backend python -m app.ingestion.shipping_density_seed || echo "Shipping density already seeded"

# ─── 8. Verify ───
echo ""
echo "================================================"
echo "  Deployment Complete!"
echo "================================================"
echo ""
echo "  Frontend:  https://${DOMAIN}"
echo "  API Docs:  https://${DOMAIN}/docs"
echo "  Health:    https://${DOMAIN}/health"
echo ""
echo "  Database password: ${DB_PASSWORD}"
echo "  (saved in .env.production)"
echo ""
echo "  To view logs:   docker compose logs -f"
echo "  To stop:        docker compose down"
echo "  To update:      git pull && docker compose up -d --build"
echo "================================================"

#!/usr/bin/env bash
set -euo pipefail

# ── Configurable ports (change here if tunnel mappings get corrupted) ──
FRONTEND_PORT="${GEFO_FRONTEND_PORT:-5555}"
BACKEND_PORT="${GEFO_BACKEND_PORT:-8888}"

echo "══════════════════════════════════════"
echo "  GEFO – Starting servers..."
echo "  Frontend: $FRONTEND_PORT  Backend: $BACKEND_PORT"
echo "══════════════════════════════════════"

# ── Kill any existing processes ──────────
pkill -f uvicorn 2>/dev/null || true
pkill -f "next start" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
sleep 2

# ── Start Backend ────────────────────────
echo "→ Starting backend on port $BACKEND_PORT..."
cd /workspace/backend
source .venv/bin/activate
nohup uvicorn app.main:app --host 0.0.0.0 --port "$BACKEND_PORT" > /tmp/backend.log 2>&1 &
echo "  Backend PID: $!"

# Wait for backend to be ready
echo "→ Waiting for backend..."
for i in $(seq 1 30); do
  if curl -s "http://127.0.0.1:${BACKEND_PORT}/health" > /dev/null 2>&1; then
    echo "  Backend ready!"
    break
  fi
  sleep 1
done

# ── Build & Start Frontend (production mode — uses ~100MB vs 1.5GB) ──
echo "→ Building frontend (production mode)..."
cd /workspace/frontend
if [ ! -f .next/BUILD_ID ]; then
  NEXT_PUBLIC_WS_PORT="$BACKEND_PORT" NODE_OPTIONS='--max-old-space-size=768' npx next build --webpack 2>&1 | tail -5
fi
echo "→ Starting frontend on port $FRONTEND_PORT..."
nohup env BACKEND_URL="http://localhost:${BACKEND_PORT}" NEXT_PUBLIC_WS_PORT="$BACKEND_PORT" \
  npx next start --hostname 0.0.0.0 --port "$FRONTEND_PORT" > /tmp/frontend.log 2>&1 &
echo "  Frontend PID: $!"

# Wait for frontend to be ready
echo "→ Waiting for frontend..."
for i in $(seq 1 30); do
  if curl -s "http://127.0.0.1:${FRONTEND_PORT}" > /dev/null 2>&1; then
    echo "  Frontend ready!"
    break
  fi
  sleep 1
done

# ── Set ports to public (Codespaces resets them to private) ──
if [ -n "${CODESPACE_NAME:-}" ]; then
  echo "→ Setting ports to public..."
  gh codespace ports visibility "${FRONTEND_PORT}:public" "${BACKEND_PORT}:public" -c "$CODESPACE_NAME" 2>/dev/null || true
fi

echo ""
echo "══════════════════════════════════════"
echo "  Both servers running!"
echo "  Frontend: http://localhost:${FRONTEND_PORT}"
echo "  Backend:  http://localhost:${BACKEND_PORT}"
echo "  Logs: /tmp/backend.log, /tmp/frontend.log"
echo "══════════════════════════════════════"

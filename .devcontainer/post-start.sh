#!/usr/bin/env bash
set -euo pipefail

echo "══════════════════════════════════════"
echo "  GEFO – Starting servers..."
echo "══════════════════════════════════════"

# ── Start Backend ────────────────────────
echo "→ Starting backend on port 8000..."
cd /workspace/backend
source .venv/bin/activate
nohup uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 > /tmp/backend.log 2>&1 &
echo "  Backend PID: $!"

# Wait for backend to be ready
echo "→ Waiting for backend..."
for i in $(seq 1 30); do
  if curl -s http://127.0.0.1:8000/docs > /dev/null 2>&1; then
    echo "  Backend ready!"
    break
  fi
  sleep 1
done

# ── Start Frontend ───────────────────────
echo "→ Starting frontend on port 3000..."
cd /workspace/frontend
nohup npx next dev --hostname 0.0.0.0 --port 3000 > /tmp/frontend.log 2>&1 &
echo "  Frontend PID: $!"

# Wait for frontend to be ready
echo "→ Waiting for frontend..."
for i in $(seq 1 30); do
  if curl -s http://127.0.0.1:3000 > /dev/null 2>&1; then
    echo "  Frontend ready!"
    break
  fi
  sleep 1
done

echo ""
echo "══════════════════════════════════════"
echo "  Both servers running!"
echo "  Logs: /tmp/backend.log, /tmp/frontend.log"
echo "══════════════════════════════════════"

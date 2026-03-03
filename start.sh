#!/bin/bash
# Auto-restart script for GEFO frontend + backend

# Start backend if not running
if ! lsof -i :8000 | grep -q LISTEN 2>/dev/null; then
  echo "[GEFO] Starting backend..."
  cd /workspace/backend && source .venv/bin/activate
  uvicorn app.main:app --host 0.0.0.0 --port 8000 &
  sleep 3
fi

# Keep frontend alive with auto-restart
echo "[GEFO] Starting frontend (production mode, auto-restart)..."
cd /workspace/frontend
while true; do
  echo "[GEFO] $(date): Starting next start on port 3000..."
  npx next start --port 3000
  EXIT_CODE=$?
  echo "[GEFO] $(date): Frontend exited with code $EXIT_CODE, restarting in 3s..."
  sleep 3
done

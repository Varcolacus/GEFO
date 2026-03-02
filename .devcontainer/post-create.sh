#!/usr/bin/env bash
set -euo pipefail

echo "══════════════════════════════════════"
echo "  GEFO Codespace – Setting up..."
echo "══════════════════════════════════════"

# ── Backend ──────────────────────────────
echo "→ Installing Python dependencies..."
cd /workspace/backend
python -m venv .venv
source .venv/bin/activate
pip install --upgrade pip -q
pip install -r requirements.txt -q

# ── Frontend ─────────────────────────────
echo "→ Installing Node.js dependencies..."
cd /workspace/frontend
npm install --silent

# ── Database seed ────────────────────────
echo "→ Seeding database (this takes ~30s)..."
cd /workspace
python setup.py

echo ""
echo "══════════════════════════════════════"
echo "  Setup complete!"
echo ""
echo "  Start backend:  cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0"
echo "  Start frontend: cd frontend && npm run dev"
echo "══════════════════════════════════════"

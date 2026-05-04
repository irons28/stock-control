#!/usr/bin/env bash
# ── Stock Control — production start ─────────────────────────────────────────
# Usage:  ./start.sh
# Builds the frontend, then starts the backend which serves it on PORT (default 3001).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$ROOT/.env"

# ── Check .env exists ─────────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env not found. Copy .env.example and fill in the values:"
  echo "  cp .env.example .env"
  exit 1
fi

# ── Load .env for the PORT value used in the banner ──────────────────────────
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
PORT="${PORT:-3001}"

echo ""
echo "  Stock Control — deployment start"
echo "  ─────────────────────────────────"

# ── Install dependencies ──────────────────────────────────────────────────────
echo "  [1/3] Installing backend dependencies…"
cd "$ROOT/backend" && npm install --omit=dev --silent

echo "  [2/3] Installing frontend dependencies and building…"
cd "$ROOT/frontend" && npm install --silent && npm run build

# ── Start backend (serves built frontend) ────────────────────────────────────
echo "  [3/3] Starting backend on port $PORT…"
echo ""
cd "$ROOT/backend" && node server.js

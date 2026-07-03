#!/usr/bin/env bash
# Stops all local dev processes started by dev-up.sh. Postgres/Redis data persists.
set -uo pipefail

echo "Stopping app processes..."
pkill -f "tsx watch src/index.ts" 2>/dev/null && echo "  server stopped"
pkill -f "tsx watch src/worker.ts" 2>/dev/null && echo "  worker stopped"
pkill -f "node_modules/.bin/vite" 2>/dev/null && echo "  web stopped"

echo "Stopping ngrok..."
pkill -f "ngrok http 4000" 2>/dev/null && echo "  ngrok stopped"

if [ "${1:-}" = "--all" ]; then
  echo "Stopping Postgres + Redis (--all passed)..."
  redis-cli -p 6379 shutdown nosave 2>/dev/null && echo "  redis stopped"
  pg_ctl -D "$HOME/.local/share/wadash-pgdata" stop -m fast 2>/dev/null && echo "  postgres stopped"
else
  echo "Postgres + Redis left running (pass --all to stop them too)."
fi

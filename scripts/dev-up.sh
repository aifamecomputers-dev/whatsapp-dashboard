#!/usr/bin/env bash
# Starts local dev infra + app processes in the background and detaches them,
# so they survive the terminal/session closing. Logs go to /tmp/dashboard-*.log.
# Safe to re-run: skips anything already running/listening.
set -euo pipefail
cd "$(dirname "$0")/.."

PGDATA="$HOME/.local/share/wadash-pgdata"
PGRUN="$HOME/.local/share/wadash-run"

echo "== Postgres =="
mkdir -p "$PGRUN"
if pg_isready -h "$PGRUN" -p 5432 >/dev/null 2>&1; then
  echo "already running"
else
  if [ ! -d "$PGDATA" ]; then
    echo "no existing PGDATA at $PGDATA -- run initdb manually first (see RESUME.md)"
    exit 1
  fi
  nohup postgres -D "$PGDATA" -p 5432 -k "$PGRUN" >/tmp/dashboard-postgres.log 2>&1 &
  disown
  sleep 2
fi

echo "== Redis =="
if redis-cli -p 6379 ping >/dev/null 2>&1; then
  echo "already running"
else
  nohup redis-server --port 6379 >/tmp/dashboard-redis.log 2>&1 &
  disown
  sleep 1
fi

echo "== ngrok tunnel (:4000) =="
if curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null | grep -q public_url; then
  echo "already running -- current URL:"
  curl -s http://127.0.0.1:4040/api/tunnels | grep -o '"public_url":"[^"]*"' | head -1
else
  nohup ngrok http 4000 --log=stdout >/tmp/dashboard-ngrok.log 2>&1 &
  disown
  sleep 2
  echo "started -- new URL (update PUBLIC_BASE_URL in .env AND Meta App webhook config):"
  curl -s http://127.0.0.1:4040/api/tunnels | grep -o '"public_url":"[^"]*"' | head -1
fi

echo "== API server (:4000) =="
if curl -s http://localhost:4000/healthz >/dev/null 2>&1; then
  echo "already running"
else
  nohup npm run dev:server >/tmp/dashboard-server.log 2>&1 &
  disown
fi

echo "== BullMQ worker =="
if pgrep -f "tsx watch src/worker.ts" >/dev/null 2>&1; then
  echo "already running"
else
  nohup npm run dev:worker >/tmp/dashboard-worker.log 2>&1 &
  disown
fi

echo "== Web (:5173) =="
if curl -s http://localhost:5173/ >/dev/null 2>&1; then
  echo "already running"
else
  nohup npm run dev:web >/tmp/dashboard-web.log 2>&1 &
  disown
fi

sleep 2
echo
echo "== Status =="
echo -n "server  : "; curl -s http://localhost:4000/healthz || echo "DOWN"
echo
echo -n "web     : "; curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:5173/
echo -n "ngrok   : "; curl -s http://127.0.0.1:4040/api/tunnels | grep -o '"public_url":"[^"]*"' | head -1
echo
echo "Logs: /tmp/dashboard-{server,worker,web,postgres,redis,ngrok}.log"

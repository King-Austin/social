#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

if [ -f "$DIR/venv/bin/activate" ]; then
    source "$DIR/venv/bin/activate"
fi

PORT="${PORT:-8055}"
HOST="${HOST:-0.0.0.0}"

echo "Starting Self-Hosted yt-dlp Backend API on http://$HOST:$PORT ..."
exec uvicorn app.main:app --host "$HOST" --port "$PORT" --workers 1

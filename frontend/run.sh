#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

PORT="${PORT:-5173}"
HOST="${HOST:-0.0.0.0}"

echo "Starting SocialDL Frontend dev server on http://$HOST:$PORT ..."
exec npm run dev -- --host "$HOST" --port "$PORT"

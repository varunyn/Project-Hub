#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

if [ ! -f ./app.pid ]; then
  echo "No running Project Hub instance found"
  exit 0
fi

PID=$(cat ./app.pid)
rm -f ./app.pid

if ! ps -p "$PID" > /dev/null 2>&1; then
  echo "Project Hub was not running (stale PID file)"
  exit 0
fi

echo "Stopping Project Hub (PID: $PID)..."
kill "$PID"
echo "Project Hub stopped" 
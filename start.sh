#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

if [ -f ./app.pid ]; then
  PID=$(cat ./app.pid)
  if ps -p "$PID" > /dev/null 2>&1; then
    echo "Project Hub is already running (PID: $PID)"
    echo "Visit http://localhost:3030"
    exit 0
  fi
  rm -f ./app.pid
fi

pnpm run build && nohup pnpm run start:3030 > ./logs.txt 2>&1 &
echo $! > ./app.pid

echo "Project Hub started (PID: $!)"
echo "Visit http://localhost:3030"
echo "Logs: ./logs.txt — Stop: ./stop.sh" 
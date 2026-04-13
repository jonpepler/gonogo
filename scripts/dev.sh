#!/bin/sh
set -e

watch_proxy() {
  last=$(find packages/proxy/src -type f -exec cksum {} \; 2>/dev/null | sort)
  while true; do
    sleep 2
    current=$(find packages/proxy/src -type f -exec cksum {} \; 2>/dev/null | sort)
    if [ "$current" != "$last" ]; then
      last="$current"
      echo "[proxy] source changed — rebuilding container…"
      podman compose up -d --build proxy
    fi
  done
}

cleanup() {
  kill "$WATCH_PID" 2>/dev/null
  podman compose down
}
trap cleanup EXIT

podman compose up -d --build
watch_proxy &
WATCH_PID=$!
turbo dev --filter='!@gonogo/proxy'

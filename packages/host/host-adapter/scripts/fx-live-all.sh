#!/bin/sh
set -eu
FX="$1"
ROOT="$2"
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR/.."
timeout 180 "$FX" js scripts/fx-live-check.mjs
sh scripts/fx-ws-check.sh "$FX"
timeout 180 "$FX" js --permission-mode yolo scripts/fx-reload-check.mjs
sh scripts/fx-agent-check.sh "$FX" "$ROOT"
node test/adapter.js
node test/fx-table.js
echo FX_LIVE_ALL_OK

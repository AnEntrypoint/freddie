#!/bin/sh
set -u
FX="$1"
ROOT="$2"
DIR="$(cd "$(dirname "$0")" && pwd)"
W=/workspace/tmp/freddie/agent-check
rm -rf "$W"
mkdir -p "$W/home/.fx" "$W/work"
echo '{}' > "$W/home/.fx/settings.json"
sed "s|__FX_ROOT__|$ROOT|" "$DIR/fake-gateway.ts" > "$W/gateway.ts"
GATEWAY_INFO="$W/info.txt" timeout 300 bun "$W/gateway.ts" > "$W/gateway.out" 2>&1 &
GW=$!
i=0
while [ ! -s "$W/info.txt" ] && [ $i -lt 30 ]; do sleep 1; i=$((i + 1)); done
BASE=$(sed -n 1p "$W/info.txt")
CHAT=$(sed -n 2p "$W/info.txt")
cd "$W/work" || exit 1
export PATH="$(dirname "$FX"):$PATH" HOME="$W/home" AI_GATEWAY_API_KEY=fake-agent-key FX_AUTO_UPGRADE=0 FX_PERMISSION_MODE=auto FX_GATEWAY_BASE_URL="$BASE" FX_GATEWAY_CHAT_URL="$CHAT" FX_TEST_GATEWAY_CHAT_URL="$CHAT" FX_TEST_GATEWAY_MODELS_URL="$BASE/coding-agent/v1/"
timeout 180 "$FX" js --permission-mode yolo "$DIR/fx-agent-check.mjs"
CHECK=$?
timeout 180 "$FX" js --permission-mode yolo "$DIR/fx-agent-read.mjs"
READ=$?
kill "$GW" 2>/dev/null
wait "$GW" 2>/dev/null
[ "$CHECK" -eq 0 ] && [ "$READ" -eq 0 ]

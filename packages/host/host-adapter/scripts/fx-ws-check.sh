#!/bin/sh
set -u
FX="$1"
DIR="$(cd "$(dirname "$0")" && pwd)"
timeout 60 "$FX" js "$DIR/ws-echo-server.mjs" > "$DIR/.ws-server.out" 2>&1 &
SERVER=$!
sleep 2
"$FX" js "$DIR/ws-echo-client.mjs"
CLIENT=$?
wait "$SERVER"
rm -f "$DIR/.ws-server.out"
exit "$CLIENT"

#!/usr/bin/env bash
set -euo pipefail
API="${API_URL:-http://localhost:4001}"
curl -sf "$API/health"; echo
SEED=$(curl -sf -X POST "$API/api/v1/networks/seed-demo")
NID=$(echo "$SEED" | python3 -c "import sys,json; print(json.load(sys.stdin)['networkId'])")
curl -sf "$API/api/v1/networks/$NID/validate"; echo
echo "OK e2e network=$NID"

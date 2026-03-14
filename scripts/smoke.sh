#!/bin/bash
# Quick end-to-end smoke test — verifies the full pipeline works.
set -e
SOCK="$HOME/.local/share/bodhi/bodhi.sock"

echo "=== Bodhi Smoke Test ==="

if [ ! -S "$SOCK" ]; then
  echo "ERROR: Daemon not running. Start with: bun run dev"
  exit 1
fi

echo "→ Health check..."
HEALTH=$(curl -sf --unix-socket "$SOCK" http://localhost/health)
echo "  $HEALTH"
echo "$HEALTH" | grep -q '"ok":true' || { echo "FAIL: health check failed"; exit 1; }

EID="smoke-$(date +%s)"
echo "→ Ingesting test event (event_id: $EID)..."
RESULT=$(curl -sf --unix-socket "$SOCK" -X POST http://localhost/events \
  -H 'Content-Type: application/json' \
  -d "{\"event_id\":\"$EID\",\"type\":\"shell.command.executed\",\"metadata\":{\"command\":\"echo smoke-test\",\"exit_code\":0,\"duration_ms\":1,\"cwd\":\"/tmp\"}}")
echo "  $RESULT"
echo "$RESULT" | grep -q '"id"' || { echo "FAIL: event ingest failed"; exit 1; }

echo "→ Testing idempotency..."
curl -sf --unix-socket "$SOCK" -X POST http://localhost/events \
  -H 'Content-Type: application/json' \
  -d "{\"event_id\":\"$EID\",\"type\":\"shell.command.executed\",\"metadata\":{\"command\":\"echo smoke-test\",\"exit_code\":0,\"duration_ms\":1,\"cwd\":\"/tmp\"}}" >/dev/null

echo "→ Searching for event..."
SEARCH=$(curl -sf --unix-socket "$SOCK" -X POST http://localhost/query \
  -H 'Content-Type: application/json' \
  -d '{"query":"smoke-test"}')
echo "  Found: $(echo "$SEARCH" | grep -c 'smoke-test' || echo '0') matches"

echo "→ Storing a test fact..."
FACT=$(curl -sf --unix-socket "$SOCK" -X POST http://localhost/facts \
  -H 'Content-Type: application/json' \
  -d '{"key":"smoke_test","value":"passed"}')
echo "  $FACT"
echo "$FACT" | grep -q '"created_by":"api"' || { echo "FAIL: fact created_by should be '\''api'\''"; exit 1; }

echo ""
echo "=== All smoke tests passed ==="

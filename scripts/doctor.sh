#!/bin/bash
# Bodhi system diagnostics — run to check health of development environment
if ! command -v bun >/dev/null 2>&1; then
  export PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH"
fi

echo "=== Bodhi Doctor ==="
echo ""
echo "--- Runtime ---"
bun --version 2>/dev/null || echo "ERROR: bun not installed"
echo ""
echo "--- Dependencies ---"
[ -d node_modules ] && echo "node_modules: OK" || echo "node_modules: MISSING (run: bun install)"
echo ""
echo "--- Type Check ---"
bun run typecheck 2>&1 | tail -5
echo ""
echo "--- Lint ---"
bun run lint 2>&1 | tail -5
echo ""
echo "--- Tests ---"
bun test --bail 2>&1 | tail -10
echo ""
echo "--- Daemon ---"
SOCK="$HOME/.local/share/bodhi/bodhi.sock"
if [ -S "$SOCK" ]; then
  echo "Daemon: RUNNING"
  curl -s --unix-socket "$SOCK" http://localhost/health 2>/dev/null || echo "Daemon: SOCKET EXISTS BUT NOT RESPONDING"
else
  echo "Daemon: NOT RUNNING"
fi
echo ""
echo "--- Database ---"
DB="$HOME/.local/share/bodhi/bodhi.db"
if [ -f "$DB" ]; then
  echo "Database: EXISTS ($(du -h "$DB" | cut -f1))"
  echo "Events: $(sqlite3 "$DB" 'SELECT COUNT(*) FROM events;' 2>/dev/null || echo 'ERROR')"
  echo "Facts: $(sqlite3 "$DB" 'SELECT COUNT(*) FROM facts;' 2>/dev/null || echo 'ERROR')"
else
  echo "Database: NOT CREATED (start daemon first)"
fi
echo ""
echo "--- Environment ---"
[ -n "$ANTHROPIC_API_KEY" ] && echo "ANTHROPIC_API_KEY: SET" || echo "ANTHROPIC_API_KEY: NOT SET (intel + agent will be disabled)"

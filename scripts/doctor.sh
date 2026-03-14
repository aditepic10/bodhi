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
  if command -v bodhi >/dev/null 2>&1 && bodhi status >/tmp/bodhi-doctor-status.txt 2>/dev/null; then
    sed -n '1,4p' /tmp/bodhi-doctor-status.txt
    rm -f /tmp/bodhi-doctor-status.txt
  elif bun run --filter @bodhi/daemon cli -- status >/tmp/bodhi-doctor-status.txt 2>/dev/null; then
    sed -n '1,4p' /tmp/bodhi-doctor-status.txt
    rm -f /tmp/bodhi-doctor-status.txt
  else
    rm -f /tmp/bodhi-doctor-status.txt
    curl -s --unix-socket "$SOCK" http://localhost/health 2>/dev/null || echo "Daemon: SOCKET EXISTS BUT NOT RESPONDING"
  fi
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
  echo "AI Prompts: $(sqlite3 "$DB" 'SELECT COUNT(*) FROM ai_prompt_events;' 2>/dev/null || echo 'ERROR')"
  echo "AI Tool Calls: $(sqlite3 "$DB" 'SELECT COUNT(*) FROM ai_tool_call_events;' 2>/dev/null || echo 'ERROR')"
  echo "Git Events: $(sqlite3 "$DB" "SELECT COUNT(*) FROM events WHERE type LIKE 'git.%';" 2>/dev/null || echo 'ERROR')"
else
  echo "Database: NOT CREATED (start daemon first)"
fi
echo ""
echo "--- Environment ---"
[ -n "$ANTHROPIC_API_KEY" ] && echo "ANTHROPIC_API_KEY: SET" || echo "ANTHROPIC_API_KEY: NOT SET (intel + agent will be disabled)"

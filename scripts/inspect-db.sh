#!/bin/bash
# Inspect Bodhi's SQLite database. Usage: scripts/inspect-db.sh [query]
DB="$HOME/.local/share/bodhi/bodhi.db"
if [ ! -f "$DB" ]; then echo "No database found. Start the daemon first."; exit 1; fi
if [ -n "$1" ]; then
  sqlite3 -header -column "$DB" "$1"
else
  echo "=== Schema ==="
  sqlite3 "$DB" ".schema"
  echo ""
  echo "=== Counts ==="
  echo "Events: $(sqlite3 "$DB" 'SELECT COUNT(*) FROM events;')"
  echo "Facts: $(sqlite3 "$DB" 'SELECT COUNT(*) FROM facts WHERE status = \"active\" AND valid_to IS NULL;')"
  echo "Conversations: $(sqlite3 "$DB" 'SELECT COUNT(*) FROM conversations;')"
  echo ""
  echo "=== Recent Events (last 5) ==="
  sqlite3 -header -column "$DB" 'SELECT id, type, substr(json_extract(metadata, "$.command"), 1, 60) as command, created_at FROM events ORDER BY created_at DESC LIMIT 5;'
  echo ""
  echo "=== Active Facts ==="
  sqlite3 -header -column "$DB" 'SELECT id, key, value, created_by, status FROM facts WHERE status = "active" AND valid_to IS NULL ORDER BY created_at DESC LIMIT 10;'
fi

#!/bin/bash
# Inspect Bodhi's SQLite database. Usage: scripts/inspect-db.sh [query]

DB="$HOME/.local/share/bodhi/bodhi.db"

if [ ! -f "$DB" ]; then
  echo "No database found. Start the daemon first."
  exit 1
fi

if [ -n "$1" ]; then
  sqlite3 -header -column "$DB" "$1"
  exit 0
fi

echo "=== Schema ==="
sqlite3 "$DB" ".schema"

echo ""
echo "=== Counts ==="
echo "Events: $(sqlite3 "$DB" 'SELECT COUNT(*) FROM events;')"
echo "Facts: $(sqlite3 "$DB" 'SELECT COUNT(*) FROM facts WHERE status = "active" AND valid_to IS NULL;')"
echo "Conversations: $(sqlite3 "$DB" 'SELECT COUNT(*) FROM conversations;')"
echo "AI prompts: $(sqlite3 "$DB" 'SELECT COUNT(*) FROM ai_prompt_events;')"
echo "AI tool calls: $(sqlite3 "$DB" 'SELECT COUNT(*) FROM ai_tool_call_events;')"
echo "Git commits: $(sqlite3 "$DB" 'SELECT COUNT(*) FROM git_commit_events;')"
echo "Git checkouts: $(sqlite3 "$DB" 'SELECT COUNT(*) FROM git_checkout_events;')"
echo "Git merges: $(sqlite3 "$DB" 'SELECT COUNT(*) FROM git_merge_events;')"
echo "Git rewrites: $(sqlite3 "$DB" 'SELECT COUNT(*) FROM git_rewrite_events;')"

echo ""
echo "=== Recent Events (last 10) ==="
sqlite3 -header -column "$DB" '
SELECT
  e.type,
  datetime(e.created_at, "unixepoch") AS created_at,
  COALESCE(ec.tool, e.source) AS tool,
  COALESCE(ec.branch, "-") AS branch,
  COALESCE(ec.relative_cwd, ec.cwd, "-") AS path,
  CASE
    WHEN e.type IN ("shell.command.executed", "shell.command.started") THEN sce.command
    WHEN e.type = "git.commit.created" THEN gce.message
    WHEN e.type = "git.checkout" THEN
      gce2.checkout_kind || " " || COALESCE(gce2.from_branch, gce2.from_sha, "?") || " -> " || COALESCE(gce2.to_branch, gce2.to_sha, "?")
    WHEN e.type = "git.merge" THEN gme.merge_commit_sha
    WHEN e.type = "git.rewrite" THEN gre.rewrite_type || " " || CAST(gre.rewritten_commit_count AS TEXT)
    WHEN e.type = "ai.prompt" THEN ape.content
    WHEN e.type = "ai.tool_call" THEN atce.tool_name || " " || COALESCE(atce.target, "")
    WHEN e.type = "note.created" THEN ne.content
    ELSE e.search_text
  END AS summary
FROM events e
LEFT JOIN event_contexts ec ON ec.event_id = e.id
LEFT JOIN shell_command_events sce ON sce.event_id = e.id
LEFT JOIN git_commit_events gce ON gce.event_id = e.id
LEFT JOIN git_checkout_events gce2 ON gce2.event_id = e.id
LEFT JOIN git_merge_events gme ON gme.event_id = e.id
LEFT JOIN git_rewrite_events gre ON gre.event_id = e.id
LEFT JOIN ai_prompt_events ape ON ape.event_id = e.id
LEFT JOIN ai_tool_call_events atce ON atce.event_id = e.id
LEFT JOIN note_events ne ON ne.event_id = e.id
ORDER BY e.created_at DESC
LIMIT 10;
'

echo ""
echo "=== Recent AI Prompts ==="
sqlite3 -header -column "$DB" '
SELECT
  datetime(e.created_at, "unixepoch") AS created_at,
  COALESCE(ec.tool, "-") AS tool,
  COALESCE(ec.thread_id, "-") AS thread,
  COALESCE(ec.branch, "-") AS branch,
  substr(ape.content, 1, 120) AS content
FROM ai_prompt_events ape
JOIN events e ON e.id = ape.event_id
LEFT JOIN event_contexts ec ON ec.event_id = e.id
ORDER BY e.created_at DESC
LIMIT 10;
'

echo ""
echo "=== Recent AI Tool Calls ==="
sqlite3 -header -column "$DB" '
SELECT
  datetime(e.created_at, "unixepoch") AS created_at,
  COALESCE(ec.tool, "-") AS tool,
  COALESCE(ec.thread_id, "-") AS thread,
  COALESCE(ec.branch, "-") AS branch,
  atce.tool_name,
  COALESCE(atce.target, "-") AS target,
  COALESCE(atce.description, "-") AS description
FROM ai_tool_call_events atce
JOIN events e ON e.id = atce.event_id
LEFT JOIN event_contexts ec ON ec.event_id = e.id
ORDER BY e.created_at DESC
LIMIT 10;
'

echo ""
echo "=== Recent Git Activity ==="
sqlite3 -header -column "$DB" '
SELECT
  e.type,
  datetime(e.created_at, "unixepoch") AS created_at,
  COALESCE(ec.branch, "-") AS branch,
  CASE
    WHEN e.type = "git.commit.created" THEN gce.message
    WHEN e.type = "git.checkout" THEN gce2.checkout_kind || " " || COALESCE(gce2.from_branch, gce2.from_sha, "?") || " -> " || COALESCE(gce2.to_branch, gce2.to_sha, "?")
    WHEN e.type = "git.merge" THEN gme.merge_commit_sha
    WHEN e.type = "git.rewrite" THEN gre.rewrite_type || " " || CAST(gre.rewritten_commit_count AS TEXT)
  END AS summary
FROM events e
LEFT JOIN event_contexts ec ON ec.event_id = e.id
LEFT JOIN git_commit_events gce ON gce.event_id = e.id
LEFT JOIN git_checkout_events gce2 ON gce2.event_id = e.id
LEFT JOIN git_merge_events gme ON gme.event_id = e.id
LEFT JOIN git_rewrite_events gre ON gre.event_id = e.id
WHERE e.type IN ("git.commit.created", "git.checkout", "git.merge", "git.rewrite")
ORDER BY e.created_at DESC
LIMIT 10;
'

echo ""
echo "=== Active Facts ==="
sqlite3 -header -column "$DB" '
SELECT
  id,
  key,
  value,
  created_by,
  status
FROM facts
WHERE status = "active" AND valid_to IS NULL
ORDER BY created_at DESC
LIMIT 10;
'

# ADR-035: Spool Replay Through the Pipeline

## Status
Accepted

## Context
Spooled events are raw shell-side JSON and can contain unvalidated or unredacted data.

## Decision
Replay spool files through the same validate/redact/enrich pipeline as live ingest.

## Consequences
Security and enrichment behavior stays consistent. Replay code cannot take shortcut insert paths.

## Ground Truth
Reliable ingest design, redaction-at-boundary discipline.

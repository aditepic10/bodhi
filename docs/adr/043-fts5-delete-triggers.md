# ADR-043: FTS5 Delete Triggers

## Status
Accepted

## Context
Deleting rows without updating FTS state leaves stale searchable content behind.

## Decision
Maintain FTS5 index consistency with delete triggers.

## Consequences
Search correctness survives deletion and purge work. FTS schema setup is more complex.

## Ground Truth
SQLite FTS5 external-content table requirements.

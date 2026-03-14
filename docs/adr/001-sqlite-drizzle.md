# ADR-001: SQLite + Drizzle

## Status
Accepted

## Context
Bodhi needs local storage with zero external services, strong SQLite support, and an escape hatch for raw FTS5 SQL.

## Decision
Use `bun:sqlite` as the runtime driver and Drizzle ORM for typed schema work where raw SQL is not required.

## Consequences
Storage stays embedded and operationally simple. FTS5 and PRAGMA-heavy areas still require hand-written SQL.

## Ground Truth
OpenCode, Bun's built-in SQLite runtime, SQLite FTS5.

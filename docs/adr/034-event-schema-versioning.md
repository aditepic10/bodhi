# ADR-034: Event Schema Versioning

## Status
Accepted

## Context
Persisted events need a migration story before multiple versions exist on disk.

## Decision
Store `schema_version` and `producer_version` with events from day one.

## Consequences
Future migrations are tractable. Event writes carry a small amount of extra metadata.

## Ground Truth
Schema-evolution practices for append-only records.

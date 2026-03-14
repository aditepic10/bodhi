# ADR-044: Fact Schema Versioning

## Status
Accepted

## Context
Facts evolve too, and they need the same migration safety events have.

## Decision
Store `schema_version` on facts from the start.

## Consequences
Future fact migrations are tractable. Every fact insert includes version metadata.

## Ground Truth
Symmetric schema-evolution practices across persisted entities.

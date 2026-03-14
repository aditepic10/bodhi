# ADR-004: Activity Log, Not Event Sourcing

## Status
Accepted

## Context
Bodhi stores immutable activity events but also needs mutable, manually editable facts.

## Decision
Treat events as an append-only activity log and facts as derived or user-created entities with provenance.

## Consequences
The system stays simple and queryable without forcing pure event sourcing semantics onto mutable facts.

## Ground Truth
Memory systems such as Mem0 and Graphiti, plus the Bodhi fact model itself.

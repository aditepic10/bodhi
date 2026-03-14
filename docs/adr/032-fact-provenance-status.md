# ADR-032: Fact Provenance and Status

## Status
Accepted

## Context
Derived facts need traceability and trust boundaries, especially when they come from LLM extraction.

## Decision
Store `created_by`, `source_event_id`, `status`, and supersession metadata with facts.

## Consequences
Memory poisoning and debugging are more manageable. Fact writes become richer than simple inserts.

## Ground Truth
Mem0, Graphiti, trust-gated memory systems.

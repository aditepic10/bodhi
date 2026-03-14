# ADR-012: Orchestrator Chains, Store Never Emits

## Status
Accepted

## Context
Store-level emissions can create hidden re-entrant loops and unclear side effects.

## Decision
Keep orchestration in `daemon.ts`; the store persists, and the orchestrator decides when to emit bus events.

## Consequences
Data flow is explicit and easier to reason about. Daemon wiring remains a critical integration point.

## Ground Truth
Event-driven orchestrator patterns, lessons from re-entrant store/event designs.

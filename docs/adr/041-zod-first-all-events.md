# ADR-041: Zod-First Event Schemas

## Status
Accepted

## Context
Bodhi needs one source of truth for runtime validation and TypeScript inference.

## Decision
Define every event type through Zod-backed discriminated unions.

## Consequences
Schema evolution is more disciplined. Event additions must pass through schema work first.

## Ground Truth
Zod-first TypeScript design, AI SDK tool-schema expectations.

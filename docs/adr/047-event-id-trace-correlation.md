# ADR-047: `event_id` as Correlation ID

## Status
Accepted

## Context
Operators need to trace one event across ingest, storage, intel, and agent-related logs.

## Decision
Use `event_id` as the shared correlation field throughout the event lifecycle.

## Consequences
Tracing remains simple and grep-friendly. Logging must preserve `event_id` consistently.

## Ground Truth
Correlation-ID patterns, event-centric debugging.

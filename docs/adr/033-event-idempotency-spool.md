# ADR-033: Event Idempotency via Spool + `event_id`

## Status
Accepted

## Context
Shell capture must survive daemon downtime and retries without duplicating events.

## Decision
Use client-generated `event_id`s, a uniqueness constraint, and per-PID spool files for at-least-once delivery.

## Consequences
Ingestion is robust across restarts and transient failures. Spool replay becomes a first-class reliability surface.

## Ground Truth
At-least-once delivery patterns, idempotent event ingestion.

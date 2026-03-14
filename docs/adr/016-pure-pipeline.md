# ADR-016: Pure Pipeline, Orchestrator Persists

## Status
Accepted

## Context
Transforms need to be testable, deterministic, and safe to run during live ingest and spool replay.

## Decision
Keep pipeline transforms pure; persistence happens after the pipeline returns a transformed event.

## Consequences
Testing stays simple and side effects remain explicit. Pipeline code cannot quietly reach into storage or network services.

## Ground Truth
Functional transform pipelines, OpenTelemetry-style sync processing constraints.

# ADR-040: Daily Extraction Limit

## Status
Accepted

## Context
Always-on shell capture can create cost and rate spikes if extraction is unconstrained.

## Decision
Cap daily LLM extractions with a configurable budget.

## Consequences
Cold-path cost becomes predictable. Some events may remain unprocessed on busy days.

## Ground Truth
Usage-budget controls for metered external APIs.

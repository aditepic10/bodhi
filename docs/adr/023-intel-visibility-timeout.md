# ADR-023: Intel Visibility Timeout

## Status
Accepted

## Context
An extraction job can hang or die mid-flight, leaving events neither processed nor clearly retryable.

## Decision
Track `started_at` and use a visibility timeout before events are considered eligible for retry.

## Consequences
Cold-path recovery is more resilient after crashes. Queue bookkeeping is slightly more complex.

## Ground Truth
Amazon SQS visibility timeout pattern, queue recovery practices.

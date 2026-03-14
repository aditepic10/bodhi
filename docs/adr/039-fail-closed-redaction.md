# ADR-039: Fail-Closed Redaction

## Status
Accepted

## Context
Redaction failures should never result in unsafe data being stored.

## Decision
Drop events when redaction throws unexpectedly instead of passing them through.

## Consequences
Capture can lose an event during a redaction fault, but secrets do not silently reach storage.

## Ground Truth
Security-first data handling, fail-closed design.

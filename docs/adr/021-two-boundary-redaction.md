# ADR-021: Two-Boundary Redaction

## Status
Accepted

## Context
Secrets may have entered storage before a better redaction rule existed, and external LLM calls create a second leak boundary.

## Decision
Redact both on ingestion and again before egress to external models.

## Consequences
Security posture improves against retroactive leaks. Some data is processed twice.

## Ground Truth
Datadog Agent-style scrubber thinking, local-to-external LLM boundaries.

# ADR-045: Component-Level Health Check

## Status
Accepted

## Context
A daemon can be partially broken while still technically "up."

## Decision
Expose health as subsystem status, queue state, circuit breaker state, spool count, and disk information.

## Consequences
Operators get useful diagnostics. Health responses become richer than a flat boolean.

## Ground Truth
Operational health-check practice for long-running daemons.

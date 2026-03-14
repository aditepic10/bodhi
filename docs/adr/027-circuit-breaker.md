# ADR-027: Circuit Breaker for LLM Calls

## Status
Accepted

## Context
Repeated upstream failures can burn quota and waste time while giving users no benefit.

## Decision
Use a time-windowed circuit breaker around external LLM extraction calls.

## Consequences
The daemon degrades more predictably during outages. The health model becomes more nuanced than simply "enabled or disabled."

## Ground Truth
Common circuit-breaker patterns, monotonic-clock guidance for failure windows.

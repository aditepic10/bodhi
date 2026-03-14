# ADR-022: Structured Tool Parameters

## Status
Accepted

## Context
Agent tools need temporal and typed filters, not ad hoc query strings.

## Decision
Design tool inputs as structured objects rather than raw query fragments.

## Consequences
Tool use stays safer and easier to validate. More explicit schemas are required up front.

## Ground Truth
AI SDK tool schemas, query planner ergonomics.

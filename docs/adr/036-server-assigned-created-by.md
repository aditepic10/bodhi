# ADR-036: Server-Assigned `created_by`

## Status
Accepted

## Context
Fact provenance is a trust boundary and must not be forgeable by request bodies.

## Decision
Assign `created_by` in route or tool context, never from client input.

## Consequences
Trust levels remain meaningful. API handlers own one more piece of data normalization.

## Ground Truth
Trust-boundary design, server-side provenance assignment.

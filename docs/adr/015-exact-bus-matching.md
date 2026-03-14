# ADR-015: Exact Bus Matching

## Status
Accepted

## Context
Wildcard event matching is ambiguous and easy to misunderstand in a small typed system.

## Decision
Use exact event names and explicit arrays instead of glob-like subscriptions.

## Consequences
Subscriptions stay unambiguous and typed. Some fan-out code is a little more explicit.

## Ground Truth
Typed event systems, glob pitfalls in event routing.

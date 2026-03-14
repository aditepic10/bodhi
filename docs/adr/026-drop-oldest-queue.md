# ADR-026: Drop-Oldest Queue Overflow

## Status
Accepted

## Context
When the intel queue overflows, Bodhi should preserve recency rather than stale backlog.

## Decision
Drop the oldest queued intel work first.

## Consequences
Recent context is favored for a personal assistant. Historical completeness can degrade under prolonged outages.

## Ground Truth
Single-user assistant prioritization, bounded-queue recency tradeoffs.

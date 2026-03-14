# ADR-046: Disk Space Protection

## Status
Accepted

## Context
SQLite behaves poorly when the host disk is nearly full, and laptops routinely encounter low-space conditions.

## Decision
Check disk space at startup and during runtime, warning or degrading behavior before corruption scenarios.

## Consequences
The daemon becomes safer under resource pressure. Runtime health and capture behavior need disk awareness.

## Ground Truth
SQLite operational guidance, laptop-local daemon failure modes.

# ADR-029: `BEGIN IMMEDIATE` for Writes

## Status
Accepted

## Context
SQLite write contention behaves better when the write lock is acquired up front.

## Decision
Use `BEGIN IMMEDIATE` for write transactions.

## Consequences
Concurrency behavior is more predictable under contention. Transaction helpers need to enforce this consistently.

## Ground Truth
SQLite locking behavior, `busy_timeout` and transaction-upgrade caveats.

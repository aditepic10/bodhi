# ADR-017: Bounded Intel Queue

## Status
Accepted

## Context
Background extraction cannot create unlimited concurrent LLM calls or unbounded memory growth.

## Decision
Use a bounded queue with serial processing for the intel service.

## Consequences
Cold-path behavior is predictable under failure. Some events may be dropped or delayed under sustained pressure.

## Ground Truth
Single-user daemon workload expectations, queue backpressure patterns.

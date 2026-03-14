# ADR-024: No I/O in Pipeline Transforms

## Status
Accepted

## Context
The hot path must stay low-latency and deterministic.

## Decision
Forbid filesystem, network, or database I/O inside pipeline transforms.

## Consequences
Transforms remain predictable and easy to test. Enrichment that needs I/O must happen elsewhere.

## Ground Truth
Hot-path latency discipline, synchronous processing patterns.

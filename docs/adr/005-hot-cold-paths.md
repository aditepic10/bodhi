# ADR-005: Hot/Cold Path Separation

## Status
Accepted

## Context
Capture and query latency cannot depend on external LLM availability or queue backlogs.

## Decision
Keep ingest/query/streaming on the hot path and move extraction and analytics onto an asynchronous cold path.

## Consequences
The daemon remains usable during provider outages. Cross-path coordination requires explicit queueing and health tracking.

## Ground Truth
OpenCode-style local daemon architecture, queue-backed background processing patterns.

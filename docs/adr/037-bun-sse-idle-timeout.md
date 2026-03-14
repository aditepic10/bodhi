# ADR-037: Bun SSE Idle Timeout Override

## Status
Accepted

## Context
Long-running agent responses can outlast default idle timeouts and silently drop streams.

## Decision
Disable Bun's default idle timeout for the streaming server path and use heartbeat comments.

## Consequences
SSE remains stable during slow reasoning or tool calls. Streaming infrastructure must explicitly manage liveliness.

## Ground Truth
Bun HTTP server behavior, SSE heartbeat patterns.

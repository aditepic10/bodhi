# ADR-011: SSE for Streaming

## Status
Accepted

## Context
Bodhi streams one-way daemon output to clients and does not need bidirectional sockets for the MVP.

## Decision
Use Server-Sent Events for agent streaming and event broadcast.

## Consequences
Streaming stays HTTP-native and debuggable. Long-lived connections require heartbeat and timeout handling.

## Ground Truth
OpenCode, Hono SSE support, standard HTTP streaming patterns.

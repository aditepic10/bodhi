# ADR-008: Hono Server

## Status
Accepted

## Context
Bodhi needs a lightweight Bun-native HTTP layer that supports JSON APIs and SSE.

## Decision
Use Hono as the daemon's HTTP router.

## Consequences
The API layer stays small and standards-oriented. The codebase follows Hono's middleware and routing model.

## Ground Truth
OpenCode, Hono, Bun HTTP runtime.

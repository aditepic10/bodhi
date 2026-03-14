# ADR-003: Bun Workspaces with Two Packages

## Status
Accepted

## Context
Bodhi already has a separation between shared contracts and runtime implementation, and future clients will need the contracts package.

## Decision
Use a Bun workspace monorepo with `@bodhi/types` and `@bodhi/daemon`.

## Consequences
Shared contracts stay importable without over-packaging early. Workspace boundaries must be kept clean.

## Ground Truth
OpenCode, Bun workspaces, JIT-style internal packages.

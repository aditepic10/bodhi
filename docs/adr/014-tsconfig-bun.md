# ADR-014: `@tsconfig/bun` as the Base

## Status
Accepted

## Context
Bodhi runs on Bun and benefits from Bun-aligned TypeScript defaults.

## Decision
Extend `@tsconfig/bun` instead of inventing a custom baseline.

## Consequences
The project inherits Bun-friendly compiler defaults. Deviations should stay minimal and justified.

## Ground Truth
OpenCode, Bun TypeScript guidance.

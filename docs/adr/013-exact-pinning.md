# ADR-013: Exact Version Pinning

## Status
Accepted

## Context
Bodhi wants reproducible installs and explicit dependency upgrades.

## Decision
Pin dependencies exactly and centralize shared tooling versions through Bun catalog entries where appropriate.

## Consequences
Builds are deterministic. Dependency updates are more explicit and slightly more manual.

## Ground Truth
OpenCode, reproducible JS workspace practices.

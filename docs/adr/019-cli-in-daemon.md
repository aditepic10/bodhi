# ADR-019: CLI in the Daemon Package

## Status
Accepted

## Context
The CLI is a thin client over daemon APIs and does not yet justify a separate package.

## Decision
Keep the CLI inside `@bodhi/daemon` and expose it through the package `bin`.

## Consequences
The package count stays small and onboarding stays simple. CLI growth may eventually justify internal submodules or a future split.

## Ground Truth
Thin client patterns, the current Bun `bin` workflow.

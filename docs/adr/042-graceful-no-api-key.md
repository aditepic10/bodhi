# ADR-042: Graceful Degradation Without API Key

## Status
Accepted

## Context
Bodhi should be installable and useful before a user configures external LLM access.

## Decision
Allow the daemon to run without provider credentials, disabling only agent/intel paths that require them.

## Consequences
Onboarding improves. Status and API routes must communicate degraded state clearly.

## Ground Truth
Local-first product onboarding, gradual capability unlock.

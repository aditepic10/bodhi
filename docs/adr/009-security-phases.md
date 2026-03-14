# ADR-009: Security in Phases

## Status
Accepted

## Context
Bodhi must ship a usable local-first MVP without pretending phase-two hardening is already complete.

## Decision
Use env vars and local file permissions now, with keychain and stronger hardening planned later.

## Consequences
The MVP remains simple to install. Some protections are explicitly deferred and documented rather than hand-waved.

## Ground Truth
OpenCode, common local-daemon rollout patterns.

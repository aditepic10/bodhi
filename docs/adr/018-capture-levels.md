# ADR-018: Three Capture Levels

## Status
Accepted

## Context
Users need to trade off usefulness against sensitivity depending on context and machine.

## Decision
Support `metadata`, `command`, and `full`, with `command` as the default.

## Consequences
The product stays useful by default while offering explicit security downgrades and upgrades.

## Ground Truth
Local engineering-tool capture patterns, the Bodhi threat model.

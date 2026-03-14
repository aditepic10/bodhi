# ADR-048: Silent-on-Success Hooks

## Status
Accepted

## Context
Hook output that always streams into the coding-agent context creates noise and degrades focus.

## Decision
Configure hooks to stay silent on success and surface output only on failure.

## Consequences
Successful edits keep the working context clean. Hook authors must encode failure states explicitly.

## Ground Truth
HumanLayer research on harness engineering for coding agents.

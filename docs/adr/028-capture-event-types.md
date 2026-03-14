# ADR-028: CaptureSource Declares Its Event Types

## Status
Accepted

## Context
Manually maintaining a central event-type registry for sources is error-prone.

## Decision
Require each capture source to declare the event types it produces.

## Consequences
Wiring stays local to the source implementation. Source authors must keep declarations accurate.

## Ground Truth
Interface-driven extension design, source self-description patterns.

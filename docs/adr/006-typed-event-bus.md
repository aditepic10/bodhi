# ADR-006: Typed Event Bus

## Status
Accepted

## Context
Bodhi needs module decoupling without introducing an external broker.

## Decision
Use a typed in-process event bus as the daemon's coordination backbone.

## Consequences
Modules stay loosely coupled and testable. Event shape discipline becomes part of the architectural contract.

## Ground Truth
Home Assistant's event-bus pattern, typed TypeScript contracts.

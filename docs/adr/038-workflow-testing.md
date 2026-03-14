# ADR-038: Workflow Testing

## Status
Accepted

## Context
High method-level coverage with heavy mocking would not prove that Bodhi actually works end to end.

## Decision
Test workflows with real SQLite, real store, real pipeline, and real bus. Mock only external LLM calls.

## Consequences
Tests are higher-confidence and closer to production behavior. Some tests are slower and require better fixtures.

## Ground Truth
System-level testing experience, local-daemon reliability testing.

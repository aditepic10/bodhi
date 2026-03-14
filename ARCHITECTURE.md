# Bodhi Architecture

## Purpose

Bodhi is a local-first memory daemon for engineers. It captures typed activity events, stores them durably, derives facts asynchronously, and exposes recall and query APIs to thin clients.

## Seven Invariants

1. Events are append-only, facts are mutable entities with provenance.
2. Hot and cold paths stay separated.
3. Modules communicate through the typed event bus.
4. Extensions happen through interfaces, not architectural rewrites.
5. Streaming is the default interaction model.
6. Security is a first-class concern.
7. The dependency graph stays acyclic.

These invariants are the contract for refactors. If a change weakens one, it is probably the wrong change.

## System Shape

### Hot Path

Capture source or API request:
- validate and redact through the pure pipeline
- persist to SQLite
- emit onto the event bus
- serve query and agent responses over HTTP/SSE

The hot path must stay available even when the LLM provider is slow or unavailable.

### Cold Path

Stored events enqueue into the intel service:
- bounded serial queue
- LLM-based fact extraction
- deterministic fact supersession
- health and circuit-breaker tracking

The cold path is allowed to degrade. The hot path is not.

## Package Boundaries

### `@bodhi/types`

Shared schemas and contracts:
- event and fact types
- config schema
- store interface

This package should remain dependency-light and runtime-agnostic.

### `@bodhi/daemon`

Runtime implementation:
- `api/`: Hono routes and HTTP boundary
- `agent/`: recall loop, system prompt, providers
- `capture/`: shell hook generation and future capture sources
- `intel/`: background extraction service
- `pipeline/`: validate/redact/enrich transforms
- `query/`: search orchestration
- `store/`: SQLite persistence and FTS
- `daemon.ts`: top-level wiring and orchestration
- `cli.ts`: thin command surface over the daemon

## Module Contracts

- Capture sources produce typed events.
- Pipeline transforms are pure and may drop invalid or unsafe events.
- Store owns persistence details and FTS concerns.
- Bus owns cross-module signaling.
- API owns trust boundaries and transport concerns.
- Daemon orchestration wires pipeline, store, bus, API, and intel together.

## Extension Seams

The architecture is intentionally optimized for these future changes:

- new capture sources without rewriting ingestion
- new LLM providers without rewriting the agent or intel flows
- new CLI commands without changing daemon internals
- new query modes without rewriting storage
- new clients without changing the daemon contract

The lowest-friction seams today are:
- provider registration
- tool registry
- capture source interface
- Hono route registration
- pipeline transforms

The tightest coupling today is the SQLite layer. That is acceptable because SQLite + FTS5 is a deliberate core choice, not an accidental implementation detail.

## Maintainability Notes

The current codebase is maintainable because the boundaries are real, but several large files should eventually be split along their existing seams:

- `packages/daemon/src/cli.ts`
- `packages/daemon/src/lifecycle.ts`
- `packages/daemon/src/store/sqlite.ts`

Those refactors should stay behavior-preserving and should not change external contracts.

## Start Here

New contributors should read in this order:

1. [README.md](/Users/aditpareek/Documents/bodhi/README.md)
2. [ARCHITECTURE.md](/Users/aditpareek/Documents/bodhi/ARCHITECTURE.md)
3. [docs/testing.md](/Users/aditpareek/Documents/bodhi/docs/testing.md)
4. [docs/adr/README.md](/Users/aditpareek/Documents/bodhi/docs/adr/README.md)
5. [ROADMAP.md](/Users/aditpareek/Documents/bodhi/ROADMAP.md)

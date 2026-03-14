# Bodhi Roadmap

## Status

### Implemented

Week 1 MVP is complete:
- monorepo scaffold and tooling
- shared types and config schemas
- SQLite store with FTS5 and spool replay
- pure pipeline and security redaction
- Hono API over Unix socket
- query endpoint
- streaming agent recall
- intel extraction service
- daemon orchestration
- shell hook scaffolding
- CLI entrypoint

### Immediate Follow-Up

- typed relational event storage
- shared activity context model
- Drizzle-first migration baseline
- `import-history` for day-one value
- repo- and branch-scoped retrieval

## Non-Goals Right Now

- multi-process or microservice split
- remote sync
- pluggable storage backend
- UI-heavy clients before core daemon hardening
- speculative plugin architecture

## Phase Dependencies

- Operational hardening depends on the current daemon/API/CLI contracts remaining stable.
- Advanced intelligence features depend on the current hot/cold path separation staying intact.
- New clients depend on the Unix socket API and SSE contracts remaining explicit and tested.

## Week 2

Foundation:
- typed relational storage on `events` + `event_contexts` + child tables
- Drizzle migration baseline and runtime migration path
- `ActivityContext` on event envelopes
- shell context enrichment
- `import-history`
- FTS on derived `search_text`

## Week 3

Capture and retrieval:
- repo- and branch-scoped retrieval filters
- richer git capture: commits, checkout, merge, rewrite
- terminal AI capture: prompts and tool calls
- intel pre-filter for low-signal activity

## Week 4

First workflows:
- `bodhi standup`
- `bodhi resume [branch]`
- facts review workflow
- export path
- `bodhi doctor` improvements

## Week 5+

Operational hardening and extensions:
- launchd/systemd integration
- rotated structured logs
- retention and purge
- terminal output capture policy
- embeddings and richer retrieval
- reciprocal rank fusion
- selective fact retrieval
- multi-model routing
- MCP exposure
- LLM egress audit log
- local LLM support
- browser/calendar/Slack capture sources
- cross-session error correlation
- extraction metadata
- semantic fact conflict resolution
- recent facts visibility
- conversation retention
- compiled shell hook helper
- token rotation
- `/metrics` endpoint
- error taxonomy
- privacy-grade secure purge
- peer credential checking
- intel queue deduplication
- security advisory monitoring
- log and backup redaction
- configurable intel scope
- scheduler subsystem
- database encryption
- OS keychain integration
- interactive TUI
- graph visualization
- generated SDKs
- fact consolidation

## Suggested Next Work

1. Land the typed storage and migration foundation.
2. Make repo and branch first-class retrieval dimensions.
3. Add the minimum richer capture needed for credible standup and resume workflows.
4. Harden operations after the substrate and workflows are proven.

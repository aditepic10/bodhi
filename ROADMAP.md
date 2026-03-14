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

- documentation baseline in repo
- maintainability refactor of oversized files
- terminal transcript capture ADR and privacy model
- terminal output capture policy with redaction and size limits
- Section 14 operational hardening items

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

Hardening, security, and richer capture:
- terminal chat capture from interactive terminal AI tools
- terminal response capture for AI assistant output in terminal sessions
- bounded command output capture with truncation, redaction, and opt-in controls
- git capture source
- entropy-based secret scanning
- extraction metadata
- facts review CLI
- semantic fact conflict resolution
- recent facts visibility
- conversation retention
- event schema migration strategy
- compiled shell hook helper
- token rotation
- `/metrics` endpoint
- event retention and purge
- rotated structured logs
- `bodhi doctor`
- export path
- error taxonomy
- privacy-grade secure purge
- peer credential checking
- intel queue deduplication
- security advisory monitoring
- log and backup redaction

## Week 3

Intelligence and security hardening:
- embeddings pipeline
- reciprocal rank fusion
- selective fact retrieval
- multi-model routing
- MCP exposure
- LLM egress audit log
- launchd/systemd integration

## Week 4

Clients and scale:
- web dashboard
- configurable intel scope
- scheduler subsystem
- database encryption
- OS keychain integration

## Week 5+

Extensions and ecosystem:
- local LLM support
- browser/calendar/Slack capture sources
- interactive TUI
- graph visualization
- cross-session error correlation
- generated SDKs
- fact consolidation

## Suggested Next Work

1. Documentation complete and kept current.
2. Behavior-preserving refactor of large files around existing seams.
3. Operational concerns from Section 14:
   - service installation
   - file logging and rotation
   - backup/export
   - retention/purge
   - vacuum and disk hygiene
4. Week 2 hardening features.

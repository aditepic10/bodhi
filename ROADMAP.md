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

## Phase 2

Typed substrate and scoped retrieval:
- typed relational storage on `events` + `event_contexts` + child tables
- Drizzle migration baseline and runtime migration path
- `ActivityContext` on event envelopes
- shell context enrichment
- FTS on derived `search_text`
- repo- and branch-scoped retrieval filters

## Phase 3

Git lifecycle capture:
- detailed implementation blueprint in [git-lifecycle-blueprint.md](/Users/aditpareek/Documents/bodhi/docs/implementation/git-lifecycle-blueprint.md)
- authoritative git events from hooks:
  - `git.commit.created`
  - `git.checkout`
  - `git.merge`
  - `git.rewrite`
- richer commit metadata:
  - file paths
  - insertions/deletions
  - commit ancestry signals where useful
- real workflow tests with temp repos, worktrees, merges, rebases, and detached `HEAD`

## Phase 4

Terminal AI capture:
- prompt capture as typed `ai.prompt` events
- tool-call capture as typed `ai.tool_call` events
- no raw assistant transcript storage by default
- shared repo/branch/worktree/tool/thread context on AI events
- detailed implementation blueprint in [ai-capture-blueprint.md](/Users/aditpareek/Documents/bodhi/docs/implementation/ai-capture-blueprint.md)
- first-class support via supported official seams
  - Claude Code
  - OpenCode
- Codex support only if a stable supported seam exists

## Phase 5

Retrieval and intel quality:
- detailed implementation blueprint in [retrieval-v2-blueprint.md](/Users/aditpareek/Documents/bodhi/docs/implementation/retrieval-v2-blueprint.md)
- improve ranking across shell, git, and AI events
- tighten repo/branch/tool/thread-aware retrieval behavior
- intel pre-filter for low-signal activity
- fact extraction quality improvements for git and AI activity
- maintain bounded retrieval and hot/cold path separation
- establish the workflow-retrieval layer that later insight and semantic layers build on

## Phase 6

Persistent CLI chat:
- expose the existing session-capable agent backend through `bodhi chat`
- keep session continuity in the current `conversations` store
- prove chat/session UX before building a TUI

## Phase 7

First workflows and clients:
- `bodhi standup`
- `bodhi resume [branch]`
- `bodhi chat`
- TUI once chat and retrieval feel trustworthy
- facts review workflow
- export path
- `bodhi doctor` improvements
- `import-history` when it strengthens day-one usefulness without distracting from core capture

## Phase 8

Derived memory and insight layer:
- pattern detection across time and repos
- recurring-problem and open-loop tracking
- broader summaries beyond immediate workflow recall
- hybrid or semantic retrieval only if and when the workflow layer proves insufficient

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

1. Finish Git lifecycle capture as the first authoritative post-shell signal layer.
2. Add terminal AI prompts and tool calls as the next major intent signal.
3. Improve retrieval and intel quality before packaging workflows.
4. Expose persistent CLI chat before building a TUI.
5. Build `standup` and `resume` only after shell + git + AI capture are flowing together.
6. Harden operations after the substrate and workflows are proven.

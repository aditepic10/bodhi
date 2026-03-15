# Foundation Blueprint

This document is the implementation blueprint for Bodhi's typed activity substrate. It is intentionally concrete and file-scoped so the rewrite can land without reopening architecture decisions in the middle of implementation.

## Goal

Build the storage and capture foundation required for:

- repo- and branch-scoped recall
- richer git and terminal-AI capture
- workflow-grade `standup` and `resume`

## Canonical Model

### Event families

- `shell.command.executed`
- `shell.command.started` if retained by concrete workflow need
- `git.commit.created`
- `git.checkout`
- `git.merge`
- `git.rewrite`
- `ai.prompt`
- `ai.tool_call`
- `note.created`

### Envelope table

`events` stores:

- ids
- type
- source
- machine identity
- schema versions
- timestamps
- `search_text`
- intel processing markers

### Shared context table

`event_contexts` stores:

- `repo_id`
- `worktree_root`
- `branch`
- `head_sha`
- `git_state`
- `cwd`
- `relative_cwd`
- `terminal_session`
- `tool`
- `thread_id`

### Typed payload tables

- `shell_command_events`
- `git_commit_events`
- `git_commit_files`
- `git_checkout_events`
- `git_merge_events`
- `git_rewrite_events`
- `ai_prompt_events`
- `ai_tool_call_events`
- `note_events`

## File-By-File Worklist

### Types

- [packages/types/src/events.ts](/Users/aditpareek/Documents/bodhi/packages/types/src/events.ts)
  - add `ActivityContextSchema`
  - add new event types
  - drop `fact.extracted` and `conversation.message` from the activity model
- [packages/types/src/entities.ts](/Users/aditpareek/Documents/bodhi/packages/types/src/entities.ts)
  - update `StoredEvent` to reflect hydrated stored events with optional context
- [packages/types/src/store.ts](/Users/aditpareek/Documents/bodhi/packages/types/src/store.ts)
  - add context-aware event filters

### Store schema

- [packages/daemon/src/store/events.sql.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/store/events.sql.ts)
  - reduce to envelope + `search_text`
- new files:
  - [event-contexts.sql.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/store/event-contexts.sql.ts)
  - [shell-command-events.sql.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/store/shell-command-events.sql.ts)
  - [git-commit-events.sql.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/store/git-commit-events.sql.ts)
  - [git-commit-files.sql.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/store/git-commit-files.sql.ts)
  - [git-checkout-events.sql.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/store/git-checkout-events.sql.ts)
  - [git-merge-events.sql.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/store/git-merge-events.sql.ts)
  - [git-rewrite-events.sql.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/store/git-rewrite-events.sql.ts)
  - [ai-prompt-events.sql.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/store/ai-prompt-events.sql.ts)
  - [ai-tool-call-events.sql.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/store/ai-tool-call-events.sql.ts)
  - [note-events.sql.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/store/note-events.sql.ts)

### Store runtime

- [packages/daemon/src/store/sqlite/runtime.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/store/sqlite/runtime.ts)
  - stop owning canonical schema creation
  - keep open, pragmas, bootstrap, migrate
- new file:
  - [packages/daemon/src/store/sqlite/migrate.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/store/sqlite/migrate.ts)

### Store implementation

- [packages/daemon/src/store/sqlite/repository.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/store/sqlite/repository.ts)
  - decompose envelope, context, and typed payload on write
  - hydrate discriminated unions on read
- split support files as needed:
  - [packages/daemon/src/store/sqlite/helpers.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/store/sqlite/helpers.ts)
  - [packages/daemon/src/store/sqlite/types.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/store/sqlite/types.ts)
  - `event-handlers.ts`
  - `hydrate.ts`
  - `search-text.ts`

### Retrieval and agent rendering

- [packages/daemon/src/retrieval/types.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/retrieval/types.ts)
- [packages/daemon/src/retrieval/planner.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/retrieval/planner.ts)
- [packages/daemon/src/retrieval/service.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/retrieval/service.ts)
- [packages/daemon/src/agent/system-prompt.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/agent/system-prompt.ts)

### Capture

- [packages/daemon/src/capture/shell.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/capture/shell.ts)
  - add cached context derivation
- new files:
  - [packages/daemon/src/capture/git.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/capture/git.ts)
  - [packages/daemon/src/capture/claude-code.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/capture/claude-code.ts)

### CLI

- new files:
  - [packages/daemon/src/cli/import-history.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/cli/import-history.ts)
  - [packages/daemon/src/cli/standup.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/cli/standup.ts)
  - [packages/daemon/src/cli/resume.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/cli/resume.ts)
  - [packages/daemon/src/cli/facts.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/cli/facts.ts)
- [packages/daemon/src/cli/commands.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/cli/commands.ts)
  - remain a thin dispatcher

## Ordered Execution

1. ADRs and roadmap/docs
2. type schemas and contracts
3. Drizzle schema files
4. baseline migration
5. store decomposition and hydration
6. retrieval and agent rendering updates
7. shell context enrichment
8. git lifecycle capture
9. terminal AI prompt and tool-call capture
10. retrieval and intel quality pass
11. `standup`
12. `resume` and fact review
13. `import-history` when it improves first-run usefulness without delaying core capture quality

## Next Capture Plan

### Git lifecycle capture

Authoritative events should come from Git hooks, not shell parsing.

See the dedicated implementation plan in [git-lifecycle-blueprint.md](/Users/aditpareek/Documents/bodhi/docs/implementation/git-lifecycle-blueprint.md).

Summary:

- `post-commit` -> `git.commit.created`
- `post-checkout` -> `git.checkout`
- `post-merge` -> `git.merge`
- `post-rewrite` -> `git.rewrite`

Initial git payload scope:

- `git.commit.created`
  - commit SHA
  - message
  - file paths in `git_commit_files`
  - `files_changed`
  - `insertions`
  - `deletions`
- `git.checkout`
  - `from_sha`
  - `to_sha`
  - `from_branch?`
  - `to_branch?`
  - `checkout_kind`
- `git.merge`
  - merge commit SHA
  - parent count
  - squash flag
- `git.rewrite`
  - rewrite type
  - rewritten commit count
  - old/new rewrite mappings if needed for archaeology

Shared context should be populated on every git event:

- `repo_id`
- `worktree_root`
- `branch`
- `head_sha`
- `git_state`
- `cwd`
- `relative_cwd`
- `tool = "git.hook"`

Git workflow validation should cover:

- normal commit creation
- branch switches
- worktree creation and activity inside the worktree
- merge completion
- amend
- rebase
- detached `HEAD`

### Terminal AI capture

This is the next capture phase after Git, not a parallel distraction.

See the dedicated implementation plan in [ai-capture-blueprint.md](/Users/aditpareek/Documents/bodhi/docs/implementation/ai-capture-blueprint.md).

Initial AI payload scope:

- `ai.prompt`
  - user-authored prompt text
- `ai.tool_call`
  - tool name
  - target
  - optional short description

Constraints:

- no raw assistant transcript storage by default
- retain shared repo/branch/worktree/tool/thread context
- optimize for intent and actions, not transcript exhaust

### Retrieval and intel quality

Do this before packaging workflows:

- implement the dedicated retrieval plan in [retrieval-v2-blueprint.md](/Users/aditpareek/Documents/bodhi/docs/implementation/retrieval-v2-blueprint.md)
- improve ranking across shell, git, and AI evidence
- ensure repo/branch/tool/thread filters remain structural
- add low-signal intel pre-filtering
- improve extraction prompts for git and AI activity
- keep retrieval bounded and deterministic

This retrieval phase is the workflow layer. It should make recent, structured activity reliably retrievable without trying to solve the later derived-memory or semantic-retrieval layers too early.

### Persistent CLI chat

After AI capture and retrieval/intel refinement, expose the existing session-capable agent backend through a persistent CLI chat surface before building a TUI.

See the dedicated implementation plan in [cli-chat-blueprint.md](/Users/aditpareek/Documents/bodhi/docs/implementation/cli-chat-blueprint.md).
The next foundation step beyond that surface is [chat-substrate-blueprint.md](/Users/aditpareek/Documents/bodhi/docs/implementation/chat-substrate-blueprint.md).

Phase 1 goal:

- bare `bodhi` starts a new interactive session
- exiting prints `bodhi --resume <session-id>`
- `bodhi --resume <session-id>` resumes an exact session
- session-aware streaming responses
- a dedicated session metadata layer on top of the existing `/agent` route and `conversations` store

The TUI should come after the stronger chat substrate is implemented:

- explicit recall vs chat split
- history-aware chat requests
- message-oriented chat storage/runtime contract
- TUI-friendly chat streaming semantics

The next UI phase should follow the dedicated plan in [tui-phase-1-blueprint.md](/Users/aditpareek/Documents/bodhi/docs/implementation/tui-phase-1-blueprint.md):

- bare `bodhi` launches a full-screen TUI in interactive terminals
- `bodhi --plain` remains the fallback/debug path
- the TUI is a client over `/chat` and `/chat/sessions`, not a new backend
- built-in tool renderers and session UX are part of phase 1, not later polish

### Later derived memory and insights

After workflow retrieval is strong, Bodhi should add broader higher-level value on top of the same substrate:

- pattern detection
- recurring-problem detection
- open-loop tracking
- longer-horizon summaries
- later hybrid or semantic retrieval if needed

Those later layers should build on the typed substrate and retrieval layer rather than replacing them.

## Workflow Validation Gates

The rewrite is not complete until these workflows pass:

1. shell event with context persists and hydrates through the typed store
2. repo- and branch-scoped retrieval works without metadata JSON parsing
3. import-history ingests into the same pipeline as live events
4. git commit + checkout events support `standup`
5. shell + git + AI prompt capture support `resume`

Required workflow suites:

- schema and migration workflows
  - baseline migration creates all event, context, FTS, fact, and conversation tables
  - startup migration path does not silently retain obsolete schema
  - foreign-key cascades remove context and payload rows when an event is deleted
- typed store workflows
  - append event writes envelope, context, payload, and FTS projection
  - hydrated reads return the same discriminated union shape expected by callers
  - context-filtered reads work across multiple event families
- retrieval workflows
  - repo-scoped recall
  - branch-scoped recall
  - bounded time-window plus repo or branch filters
- capture workflows
  - shell hooks add context in git repos and omit it safely outside repos
  - git and AI hook payloads map to the expected typed events
- end-to-end workflows
  - shell + git + AI capture support `standup`
  - shell + git + AI capture support `resume`

## Performance Gates

- context-filtered query at 50K events should be comfortably sub-second
- shell hooks must remain quiet and low-latency
- FTS rebuild should not run unconditionally on every startup

## Explicit Deferrals

Not part of this foundation pass:

- raw AI response storage
- general terminal stdout/stderr capture
- browser/calendar/Slack capture
- embeddings
- MCP server
- web dashboard

## Preserved Backlog

These remain useful and are intentionally preserved even though they are not part of the immediate substrate rewrite:

- `import-history` for day-one value
- terminal output capture policy with truncation, redaction, and opt-in controls
- extraction metadata
- semantic fact conflict resolution
- recent facts visibility
- conversation retention
- compiled shell hook helper
- token rotation
- `/metrics` endpoint
- event retention and purge
- rotated structured logs
- error taxonomy
- privacy-grade secure purge
- peer credential checking
- intel queue deduplication
- security advisory monitoring
- log and backup redaction
- reciprocal rank fusion
- selective fact retrieval
- multi-model routing
- LLM egress audit log
- launchd/systemd integration
- configurable intel scope
- scheduler subsystem
- database encryption
- OS keychain integration
- interactive TUI
- graph visualization
- generated SDKs
- fact consolidation

# CLI Chat Blueprint

This document defines the next Bodhi product layer after retrieval v2: an interactive terminal chat surface built on the existing daemon, `/agent` route, retrieval service, and conversation storage.

It is intentionally specific about product semantics before implementation. The goal is to avoid inventing chat behavior ad hoc during coding.

## Goal

Make `bodhi` itself the primary interactive interface, while preserving a clean path to a future TUI.

This phase is successful when:

- bare `bodhi` starts a new interactive chat session
- exiting prints an exact resume command
- `bodhi --resume <session-id>` resumes one exact prior session
- `bodhi sessions` lists sessions with enough metadata to choose the right one
- chat is built on the current daemon/session architecture, not a new backend
- the session model is ready to power a TUI later without semantic rewrites

## Validated External Patterns

These behaviors are grounded in real tools, not invented from scratch.

### Bare command as the primary entrypoint

- OpenCode uses bare `opencode` to launch its primary interface.
- Codex uses bare `codex` as the primary terminal entrypoint.

This validates `bodhi` as the main interactive command rather than forcing `bodhi chat` as the core UX.

Sources:

- https://opencode.ai/docs/cli/
- https://opencode.ai/docs/tui/
- https://github.com/openai/codex

### Exact resume by session id

- Claude Code shows `claude --resume <session-id>` on exit.
- OpenCode shows `opencode -s <session-id>` as the exact continuation command.

This validates exact resume by id as a standard, low-ambiguity pattern.

Sources:

- user-observed Claude Code behavior
- user-observed OpenCode behavior
- https://platform.claude.com/docs/en/agent-sdk/sessions
- https://opencode.ai/docs/cli/

### Sessions are not just message rows

- Claude SDK exposes first-class session APIs, including `resume`, `continue`, `fork`, and session listing.
- Gemini CLI stores project-specific sessions and provides session browsing.
- Goose exposes explicit session management and recommends new sessions for new tasks.

This validates treating sessions as first-class product objects, not merely implicit message collections.

Sources:

- https://platform.claude.com/docs/en/agent-sdk/sessions
- https://geminicli.com/docs/cli/session-management/
- https://block.github.io/goose/docs/guides/sessions/session-management/

### Workspace/project relevance matters

- Claude SDK `continue: true` resumes the most recent session in the current directory.
- Gemini sessions are explicitly project-specific.
- Codex users are explicitly asking for workspace-scoped resume behavior because global resume is confusing.

This validates storing workspace metadata on sessions, even if Bodhi does not auto-resume by policy in phase 1.

Sources:

- https://platform.claude.com/docs/en/agent-sdk/sessions
- https://geminicli.com/docs/cli/session-management/
- https://github.com/openai/codex/issues/3856

## Bodhi Product Semantics

These are the product decisions for phase 1.

### `bodhi`

- starts a new interactive chat session
- does not silently resume anything
- streams replies live from the existing `/agent` route

This is a deliberate choice. Bodhi should not guess session intent yet.

### Exit behavior

On graceful exit, Bodhi prints:

```text
Resume this session with:
bodhi --resume <session-id>
```

This mirrors the strong exact-resume pattern seen in Claude Code and OpenCode.

### `bodhi --resume <session-id>`

- resumes exactly one prior session
- fails clearly if the session does not exist
- does not infer or guess alternatives

### `bodhi sessions`

- lists previous sessions
- prioritizes sessions that match the current workspace
- still shows non-matching sessions, but lower in the list

Phase 1 does not need interactive fuzzy-pick UI. A clean tabular list is enough.

### No phase-1 policy resume

Do not ship these yet:

- `bodhi --resume` with no id
- `bodhi --continue`
- automatic “resume latest”

These commands require policy decisions we do not yet believe in strongly enough.

## Workspace Semantics

Session metadata should still carry workspace context.

This is for:

- sorting `bodhi sessions`
- future TUI grouping and filtering
- showing relevant context in session lists
- future resume policies if real usage proves they are useful

It is not for silent auto-resume in phase 1.

### Workspace identity priority

For session metadata and session-list sorting:

1. `repo_id`
2. `worktree_root`
3. `cwd` fallback when outside a repo

This matches Bodhi’s architecture and use cases, which are repo/worktree-centric.

## Required Data Model Changes

The current `conversations` table stores message rows, but not enough first-class session metadata to support good UX.

Add a dedicated session metadata table.

### New table: `chat_sessions`

Minimum fields:

- `session_id`
- `created_at`
- `updated_at`
- `repo_id`
- `worktree_root`
- `cwd`
- `branch`
- `title`
- `last_user_message_preview`

Notes:

- `title` can start nullable or derived lazily from the first user message
- `last_user_message_preview` should be short and bounded
- shared workspace fields may be nullable outside repos
- `session_id` is the primary key and stable external resume handle

### Keep `conversations`

Do not replace `conversations`.

Use:

- `chat_sessions` for session-level metadata
- `conversations` for ordered message rows

This is the right relational split and will scale better into future TUI and analytics needs.

Relationship:

- one `chat_sessions` row has many `conversations` rows
- `conversations.session_id` references `chat_sessions.session_id`
- `conversations.session_id` should be indexed
- deleting a chat session should cascade to its message rows

## Runtime Behavior

### Starting a new chat

1. create a new `session_id`
2. create the matching `chat_sessions` row immediately
3. initialize workspace metadata on that row before the first prompt
4. enter input loop
5. stream replies from `/agent`
6. keep `updated_at` fresh as messages are appended
7. derive `title` from the first user message once one exists
8. update `last_user_message_preview` on each user message using sanitized bounded text

This is a deliberate product decision: session creation happens on entry, not after the first successful round trip.

### Resuming an exact session

1. validate session exists
2. load session metadata
3. enter the same input loop using that `session_id`
4. continue appending user and assistant messages into `conversations`
5. update `updated_at`

### Exit and interruption behavior

- normal exit prints `bodhi --resume <session-id>`
- Ctrl+C after session creation also prints the exact resume command
- transport failure after session creation should still preserve the session

### Listing sessions

Show:

- short session id
- updated time
- repo/workspace hint
- optional branch
- title or preview

Sort:

1. sessions matching current workspace
2. newest first

Current-workspace priority means:

1. same `repo_id`
2. then same `worktree_root`
3. then same `cwd` when outside a repo
4. then all other sessions by recency

## CLI Surface

Phase 1 commands:

- `bodhi`
- `bodhi --resume <session-id>`
- `bodhi sessions`

Optional compatibility alias:

- `bodhi chat`

If `bodhi chat` remains, it should be an alias to bare `bodhi`, not a separate semantic path.

## Implementation Shape

Keep the CLI layer thin.

### Reuse existing backend

- existing `/agent` route
- existing retrieval and agent loop
- existing `conversations` storage

### Add focused CLI modules

Recommended files:

- `packages/daemon/src/cli/chat.ts`
  - interactive loop entrypoint
- `packages/daemon/src/cli/chat-session.ts`
  - session creation, lookup, listing
- `packages/daemon/src/cli/chat-render.ts`
  - terminal output formatting

Keep [commands.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/cli/commands.ts) as a dispatcher.

### Store changes

Add a small session-oriented store module rather than bloating the existing conversation store.

Recommended files:

- `packages/daemon/src/store/chat-sessions.sql.ts`
- `packages/daemon/src/store/sqlite/chat-session-store.ts`

## Migration Policy

- forward-only migration
- generated through Drizzle
- do not edit prior migrations

This phase should add a new migration for `chat_sessions` and any indexes required for session listing.

Retention rules:

- pruning should operate on `chat_sessions`
- deleting a session should cascade to `conversations`
- no orphaned conversation rows should remain

## Testing Bar

Tests are first-class. This phase is not done without workflow coverage.

### Happy path

- bare `bodhi` starts a new session
- exiting prints `bodhi --resume <id>`
- `bodhi --resume <id>` resumes the exact session
- `bodhi sessions` shows current-workspace sessions first

### Failure path

- resume unknown session id -> clear error
- daemon disconnect mid-stream -> clear error, session remains valid
- no API key -> clear behavior
- interrupted response does not corrupt prior conversation rows

### Structural tests

- `chat_sessions` row is created immediately on entering chat
- `updated_at` changes as chat continues
- workspace metadata is persisted correctly
- `conversations.session_id` references `chat_sessions.session_id`
- session list query is bounded and correctly ordered

### TUI-readiness tests

The phase should preserve a clean later upgrade path:

- session metadata contains enough information for future grouping/filtering
- no CLI-only semantics are baked into the store layer
- no duplicate chat backend is introduced

## Out Of Scope

Not in this phase:

- full-screen TUI
- automatic session resume policy
- session forking
- interactive session picker UI
- slash commands beyond what is required for clean exit/resume semantics
- finish-reason analytics

These can come later once the basic chat substrate is proven.

## Why This Fits Bodhi

This design matches Bodhi’s roadmap and architecture because:

- it reuses the current daemon and retrieval stack
- it keeps the system local-first and typed
- it treats sessions as first-class without over-automating product behavior
- it creates the right substrate for a future TUI instead of baking UI assumptions into storage or agent logic

## Approval Questions

Before implementation, these should remain true:

1. bare `bodhi` starts a new session by default
2. exact resume is `bodhi --resume <session-id>`
3. no automatic resume policy ships in phase 1
4. sessions get a dedicated metadata table
5. `bodhi sessions` is the only listing/browsing command in phase 1

If those remain approved, implementation can proceed cleanly and an ADR should be added after the blueprint is accepted.

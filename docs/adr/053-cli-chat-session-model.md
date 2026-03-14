# ADR-053: CLI chat session model

## Status
Accepted

## Context

Bodhi is moving from one-shot `recall` queries toward persistent interactive chat. The daemon already supports sessioned agent interactions and stores message rows in `conversations`, but it does not yet define first-class product semantics for:

- how interactive chat starts
- how a prior chat is resumed
- how sessions are listed and organized
- how session metadata relates to message history
- how the future TUI should build on the same semantics

Without explicit decisions here, chat behavior would become ad hoc and harder to evolve safely.

## Decision

Bodhi will use the following phase-1 chat model:

- bare `bodhi` starts a new interactive session
- Bodhi creates the session immediately on entry
- on exit, Bodhi prints `bodhi --resume <session-id>`
- `bodhi --resume <session-id>` resumes one exact prior session
- Bodhi does not ship automatic resume policy in phase 1
- `bodhi sessions` lists prior sessions and prioritizes those matching the current workspace

Storage model:

- `chat_sessions` is the parent table
- `conversations` remains the child message table
- `chat_sessions.session_id` is the primary key and stable external resume handle
- `conversations.session_id` references `chat_sessions.session_id`
- deleting a session cascades to its message rows

Session metadata:

- `repo_id`
- `worktree_root`
- `cwd`
- `branch`
- `created_at`
- `updated_at`
- `title`
- `last_user_message_preview`

Workspace priority for listing:

1. same `repo_id`
2. then same `worktree_root`
3. then same `cwd` fallback
4. then all others by recency

Product decisions intentionally deferred:

- `bodhi --resume` without an id
- `bodhi --continue`
- automatic resume of the “latest” session
- session forking
- interactive session picker UI

## Consequences

What becomes easier:

- exact and unambiguous resume semantics
- session lists grouped by current engineering context
- a clean TUI upgrade path without changing backend semantics
- session retention/pruning as a first-class concern
- future repo/worktree-aware chat browsing

What becomes harder:

- an extra table and migration are required
- session metadata must be kept current as chat proceeds
- future policy-based resume commands will need a separate explicit decision

## Ground Truth

This decision is based on real tool behavior plus Bodhi-specific product constraints.

Validated external patterns:

- OpenCode uses bare `opencode` as the main interface and exposes exact session continuation handles
- Claude session APIs expose explicit `resume`, `continue`, `fork`, and session listing
- Gemini CLI uses project-specific sessions and explicit session browsing
- Goose treats sessions as first-class and recommends new sessions for new tasks
- Codex feedback shows that global or ambiguous resume behavior is confusing in practice

Sources:

- https://opencode.ai/docs/cli/
- https://opencode.ai/docs/tui/
- https://platform.claude.com/docs/en/agent-sdk/sessions
- https://geminicli.com/docs/cli/session-management/
- https://block.github.io/goose/docs/guides/sessions/session-management/
- https://github.com/openai/codex/issues/3856

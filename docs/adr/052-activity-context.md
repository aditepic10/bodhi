# ADR-052: Shared Activity Context On Events

## Status
Accepted

## Context
Bodhi needs to answer questions like:

- what was I doing in this repo yesterday?
- what did I last do on `feature/auth`?
- what did I ask Claude Code while working in `packages/daemon`?

The current event model does not carry a consistent, queryable notion of repo identity, worktree location, branch, session, or tool. Those fields are either missing or embedded inconsistently in event-specific payloads.

## Decision
Add an optional shared `context` object to the event envelope and persist it in a dedicated `event_contexts` table.

Canonical context fields:

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

Definitions:

- `repo_id` is the canonical repository identity, stable across worktrees
- `worktree_root` is the current checkout root for the event
- `cwd` and `relative_cwd` describe the working location of the activity
- `terminal_session`, `tool`, and `thread_id` support session- and tool-scoped recall

Shared context belongs in `event_contexts`, not repeated in child payload tables, unless a field is semantically part of the payload itself.

## Consequences
What gets better:

- repo-, branch-, tool-, and thread-scoped queries become first-class
- future capture sources share one context vocabulary
- worktree-aware recall is supported without source-specific hacks

What gets harder:

- capture sources must explicitly populate context where possible
- shell and git hooks must derive context cheaply and consistently
- migrations are required when context shape changes

Guardrails:

- context is optional and events must still ingest when context cannot be derived
- metadata redaction remains primary, but context is still eligible for generic secret-pattern redaction if needed
- server-side enrichment should not invent repo or branch context that capture sources did not observe

## Ground Truth
This decision is correct if:

- events from multiple worktrees of the same repo can be grouped by `repo_id`
- `resume` and `standup` can filter by repo and branch without JSON parsing
- new capture sources can map into the same context model without changing retrieval semantics

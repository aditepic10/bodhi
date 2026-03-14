# ADR-051: Typed Relational Event Storage

## Status
Accepted

## Context
Bodhi currently stores event payloads in a single `events.metadata` JSON blob. That makes the write path simple, but it breaks down against the product direction:

- repo-, branch-, and tool-scoped recall should use typed filters, not FTS accidents
- event-family fields such as `exit_code`, `hash`, and `tool_name` should be indexed
- the storage layer should follow Drizzle schema + migration discipline
- FTS should index derived search text, not raw JSON structure

Keeping payloads in JSON would preserve short-term flexibility at the cost of unsafe casts, weak queryability, and schema drift.

## Decision
Store activity events using a typed relational model:

- `events` remains the append-only envelope table
- `event_contexts` stores shared developer activity context in a 1:1 row keyed by `events.id`
- typed child tables store event-family payloads
- `events.search_text` stores derived FTS projection text

The API and pipeline boundary stay on the Zod discriminated union. Decomposition into envelope, context, and payload happens inside the store after validation and redaction.

The initial typed payload tables are:

- `shell_command_events`
- `git_commit_events`
- `git_commit_files`
- `git_checkout_events`
- `git_merge_events`
- `git_rewrite_events`
- `ai_prompt_events`
- `ai_tool_call_events`
- `note_events`

The activity event model drops `fact.extracted` and `conversation.message`. Facts remain entities. Conversations remain agent working memory.

## Consequences
What gets better:

- typed, indexed queries for repo, branch, tool, status, and event-family fields
- FTS quality improves because only derived `search_text` is indexed
- storage and migrations become explicit and reviewable through Drizzle
- shared context is queryable across event types without JSON extraction

What gets harder:

- each new event family needs schema, migration, decomposition, hydration, and search-text support
- polymorphic reads require batch hydration by event family
- tests must cover relational decomposition and reconstruction workflows

What stays the same:

- pipeline transforms remain pure and storage-agnostic
- the append-only event invariant remains intact
- callers still consume `StoredEvent` as a discriminated union

## Ground Truth
This decision is correct if:

- no event payload is stored as raw JSON metadata
- no read path depends on `JSON.parse(row.metadata) as ...`
- repo- and branch-scoped recall uses typed filters
- FTS indexes only derived event text
- schema changes flow through Drizzle migrations

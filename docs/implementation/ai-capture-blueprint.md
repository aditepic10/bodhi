# AI Capture Blueprint

This document is the implementation blueprint for Bodhi's terminal AI capture phase. It defines the phase goal, the definition of done, the adapter model, and the workflow-first test strategy. The capture work is not complete when adapters exist. It is complete when the tests prove Bodhi safely and usefully captures assistant activity as part of the same typed activity substrate as shell and Git.

## Goal

After this phase, Bodhi should reliably capture high-signal terminal AI activity as typed events, with privacy-safe defaults, across the assistants that expose stable supported integration seams.

The practical result should be:

- `ai.prompt` and `ai.tool_call` become first-class retrieval inputs
- recall quality improves with user intent and assistant action context
- the backend is ready for persistent session-aware CLI chat
- no raw assistant transcript storage is introduced by default

## Non-Goals

- raw assistant response transcript capture by default
- a full-screen TUI
- a parallel conversation backend separate from the existing agent route
- speculative plugin architecture for arbitrary assistant tools
- brittle scraping of unsupported internal files or TTY streams

## Phase Order

This phase comes after Git lifecycle capture and before workflow packaging such as `standup`, `resume`, or a TUI.

The correct order is:

1. AI capture blueprint and test plan
2. type schemas and typed storage support
3. Claude Code contract and workflow tests
4. Claude Code adapter
5. OpenCode contract and workflow tests
6. OpenCode adapter
7. Codex support only if a stable supported capture seam exists
8. retrieval and intel quality pass
9. persistent CLI chat
10. TUI phase 1

## Definition Of Done

This phase is complete only when all of the following are true:

- prompts are captured as typed `ai.prompt` events
- tool executions are captured as typed `ai.tool_call` events
- shared `ActivityContext` fields are populated consistently when derivable
- raw assistant response text is still not stored by default
- retrieval can use AI events structurally as part of mixed shell/git/AI recall
- install and uninstall flows are idempotent and preserve existing user config
- capture failures do not block the user assistant workflow
- workflow tests cover real end-to-end capture behavior
- privacy-boundary and corruption-boundary tests pass

## Canonical Event Model

### `ai.prompt`

Payload:

- `content`

Shared context:

- `repo_id`
- `worktree_root`
- `branch`
- `head_sha`
- `git_state`
- `cwd`
- `relative_cwd`
- `tool`
- `thread_id`

### `ai.tool_call`

Payload:

- `tool_name`
- `target`
- `description`

Shared context:

- `repo_id`
- `worktree_root`
- `branch`
- `head_sha`
- `git_state`
- `cwd`
- `relative_cwd`
- `tool`
- `thread_id`

## Privacy Defaults

Default on:

- user-authored prompts
- assistant tool calls
- shared repo/branch/worktree/session context

Default off:

- raw assistant responses
- transcript history dumps
- arbitrary stdout or stderr capture from assistant subprocesses

The rule for this phase is:

- capture intent and actions
- do not capture transcript exhaust

## Adapter Model

Create a small assistant capture layer under `packages/daemon/src/capture/ai/`.

Each adapter should implement the same thin contract:

- `sourceName`
- `defaultScope`
- `supportsCurrentMachine()`
- `install(scope)`
- `uninstall(scope)`
- `mapInput(raw)`

Adapters emit normal Bodhi events into `/events`. They do not define assistant-specific storage or retrieval paths.

Default install behavior should be conservative:

- assistant integrations install globally by default
- project-level install must be explicit
- `bodhi start` never mutates assistant config
- `bodhi init` owns installation

Transport should stay centralized:

- adapters call one Bodhi ingest seam
- that seam may use single-event `POST /events` now
- future batching is allowed behind the same seam without changing adapters

## Assistant Strategy

### Claude Code

Use official hooks.

Phase 1 mapping:

- `UserPromptSubmit` -> `ai.prompt`
- `PostToolUse` -> `ai.tool_call`

Later, only if useful:

- `SessionStart`
- `SessionEnd`

This is first-class support.

### OpenCode

Use an official plugin.

Phase 1 mapping:

- user-authored prompt updates -> `ai.prompt`
- tool execution completion -> `ai.tool_call`

Later, only if useful:

- session lifecycle events

This is also first-class support.

### Codex

Support Codex only through a stable, supported capture seam.

If a stable official capture surface is not available, Codex support should be marked experimental or deferred rather than implemented via brittle scraping.

This is the decision rule:

- supported official seam -> in scope
- unsupported scraping or terminal interception -> out of scope

## File-By-File Worklist

### Types

- [packages/types/src/events.ts](/Users/aditpareek/Documents/bodhi/packages/types/src/events.ts)
  - finalize `ai.prompt` and `ai.tool_call` schemas

### Store

- [packages/daemon/src/store/ai-prompt-events.sql.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/store/ai-prompt-events.sql.ts)
  - keep payload focused on prompt content only
- [packages/daemon/src/store/ai-tool-call-events.sql.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/store/ai-tool-call-events.sql.ts)
  - keep payload focused on tool/action fields only
- migration files
  - generated via Drizzle only

### Capture

- new directory:
  - [packages/daemon/src/capture/ai/](/Users/aditpareek/Documents/bodhi/packages/daemon/src/capture/ai/)
- new files:
  - `types.ts`
  - `helpers.ts`
  - `claude-code.ts`
  - `opencode.ts`
  - `codex.ts` only if supportable
  - `index.ts`

### CLI

- [packages/daemon/src/cli/commands.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/cli/commands.ts)
  - `init` should install supported assistant integrations alongside shell and Git

### Retrieval and agent rendering

- [packages/daemon/src/retrieval/planner.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/retrieval/planner.ts)
- [packages/daemon/src/retrieval/service.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/retrieval/service.ts)
- [packages/daemon/src/agent/system-prompt.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/agent/system-prompt.ts)

These should learn to treat AI prompts and tool calls as high-signal evidence rather than transcript noise.

## Test-First Plan

Tests define this phase. Implement adapters only to satisfy these tests.

### 1. Contract tests

Each adapter must prove:

- it emits valid `ai.prompt` events
- it emits valid `ai.tool_call` events
- it sets `tool` and `thread_id` correctly
- it maps repo and branch context when available
- it never stores raw assistant response text by default

### 2. Workflow tests

Each first-class adapter must prove:

- install is idempotent
- uninstall removes only Bodhi-managed config
- prompt submission results in a stored `ai.prompt`
- tool execution results in a stored `ai.tool_call`
- mixed shell + git + AI recall gets better, not noisier
- repo- and branch-scoped recall can include AI intent

### 3. Failure tests

Each adapter must prove:

- missing tool installation is detected cleanly
- malformed inbound event payloads fail safely
- daemon unavailable does not break the assistant workflow
- duplicate delivery remains idempotent
- partial context still results in valid minimal events when possible

### 3.1 Idempotency hardening follow-up

Phase 1 may temporarily ship with Bodhi-generated event ids where an upstream tool does not expose a stable official event id.

That is acceptable only as an internal alpha tradeoff. The production hardening bar is:

- prefer official upstream event ids when available
- otherwise derive deterministic ids from stable payload fields
- duplicate prompt or tool-hook delivery must not create duplicate stored events

### 4. Worst-case tests

These are mandatory:

- prompt contains secrets or credentials
- very large prompt payload
- tool target contains quotes, newlines, or path edge cases
- unknown tool names
- multiple sessions active in the same repo
- detached `HEAD`
- worktree cwd
- non-git cwd
- pre-existing user hook or plugin config

## Required Workflow Suites

### Claude Code

- prompt capture via official hook
- tool-call capture via official hook
- idempotent install into user config
- uninstall preserves non-Bodhi config
- repo-aware prompt recall after shell + git + Claude activity

### OpenCode

- prompt capture via plugin/event bridge
- tool-call capture via plugin/event bridge
- idempotent install into user config
- uninstall preserves non-Bodhi plugin config
- repo-aware prompt recall after shell + git + OpenCode activity

### Codex

Only add this suite if a stable supported seam exists.

If not, explicitly defer with a documented rationale.

## Completion Review

Before calling the phase complete, verify alignment with:

- [ARCHITECTURE.md](/Users/aditpareek/Documents/bodhi/ARCHITECTURE.md)
- [ROADMAP.md](/Users/aditpareek/Documents/bodhi/ROADMAP.md)
- [USE_CASES.md](/Users/aditpareek/Documents/bodhi/USE_CASES.md)
- [foundation-blueprint.md](/Users/aditpareek/Documents/bodhi/docs/implementation/foundation-blueprint.md)
- [ADR-030](/Users/aditpareek/Documents/bodhi/docs/adr/030-prompt-injection-defense.md)
- [ADR-050](/Users/aditpareek/Documents/bodhi/docs/adr/050-bounded-retrieval-planning.md)
- [ADR-051](/Users/aditpareek/Documents/bodhi/docs/adr/051-typed-relational-event-storage.md)
- [ADR-052](/Users/aditpareek/Documents/bodhi/docs/adr/052-activity-context.md)

The review questions are:

- does this keep capture local-first and privacy-native?
- does this keep the event model typed and assistant-agnostic?
- does this improve retrieval quality without transcript sprawl?
- does this keep persistent chat as an additive CLI surface, not a parallel system?
- does this set up a future TUI cleanly?

# Git Lifecycle Blueprint

This document is the implementation blueprint for Bodhi's first authoritative Git capture phase.

## Goal

Capture the local Git state transitions that shell commands alone cannot prove:

- commits that actually landed
- branch and `HEAD` transitions that actually happened
- merges that completed
- history rewrites that completed

This phase exists to make later recall, `standup`, `resume`, and commit archaeology materially more useful than shell-history narration.

## Principles

- Git hooks provide truth. Shell capture provides intent.
- Capture small, typed, durable facts instead of diffs or reflog exhaust.
- Preserve existing user hooks. Do not take over Git globally.
- Keep the model generic enough for Graphite and other Git-compatible tools.
- Default to privacy-safe local metadata. Do not capture patch text by default.

## Scope

Phase 1 Git lifecycle capture includes:

- `git.commit.created`
- `git.checkout`
- `git.merge`
- `git.rewrite`

Phase 1 does not include structured events for:

- `push`
- `fetch`
- `pull`
- `stash`
- `tag`
- `reset`
- PR creation or submission
- raw diffs or patch text

Those remain visible through shell intent until there is a strong reason to model them structurally.

## Why `push` Is Deferred

Git provides `pre-push`, but not a reliable client-side `post-push` hook for confirmed completion. That makes `push` materially weaker than `post-commit`, `post-checkout`, `post-merge`, and `post-rewrite` as an authoritative event source.

For now, Bodhi should rely on shell capture for `git push`, `gt submit`, and related publish flows. A structured publish-state layer can come later if shell intent proves insufficient.

## Hook Strategy

Use the native client hooks that reflect completed local state transitions:

- `post-commit` -> `git.commit.created`
- `post-checkout` -> `git.checkout`
- `post-merge` -> `git.merge`
- `post-rewrite` -> `git.rewrite`

These hooks should emit a single Bodhi event payload each, using the same Unix socket ingest path as other local capture.

## Hook Installation

Do not install a global `core.hooksPath`.

Instead:

- install repo-scoped hook shims under the repo's common Git hooks directory
- preserve existing hook content
- wrap Bodhi-managed sections in clear begin/end markers
- uninstall only Bodhi-managed sections when requested

For worktrees, install into the repository's common Git directory so all worktrees share the same hook set.

This keeps Bodhi compatible with:

- existing local hooks
- worktree-heavy workflows
- Graphite and other Git-compatible CLIs

## Shared Context

Every Git lifecycle event should populate shared context through the same `ActivityContext` model used by shell and AI capture:

- `repo_id`
- `worktree_root`
- `branch`
- `head_sha`
- `git_state`
- `cwd`
- `relative_cwd`
- `tool = "git.hook"`

`terminal_session` and `thread_id` are optional and should only be populated when the invoking environment actually provides them.

## Event Contracts

### `git.commit.created`

Authoritative source:

- `post-commit`

Capture:

- `commit_sha`
- `message`
- `parent_count`
- `files_changed`
- `insertions`
- `deletions`

Store changed file paths in `git_commit_files`, not as JSON text.

This event proves that a commit actually exists, which shell history alone cannot do.

### `git.checkout`

Authoritative source:

- `post-checkout`

Capture:

- `from_sha`
- `to_sha`
- `from_branch` when derivable
- `to_branch` when derivable
- `checkout_kind`

`checkout_kind` should start with a small, typed set:

- `branch-switch`
- `detached-head`
- `file-checkout`
- `initial-clone`

This event proves repository state movement, not just the attempted command.

### `git.merge`

Authoritative source:

- `post-merge`

Capture:

- `merge_commit_sha`
- `parent_count`
- `is_squash`

Do not require `merged_branch` unless it can be derived reliably. Incorrect branch inference is worse than omission.

### `git.rewrite`

Authoritative source:

- `post-rewrite`

Capture:

- `rewrite_type`
- `rewritten_commit_count`

And add a typed mapping table for old-to-new commit rewrites:

- `git_rewrite_mappings`
  - `rewrite_event_id`
  - `old_commit_sha`
  - `new_commit_sha`

This is worth modeling up front because it makes rebases, amends, and stacked-branch workflows much easier to reason about later.

## Graphite and Other Git-Compatible Tools

Phase 1 should not introduce a Graphite-specific capture architecture.

Graphite remains legible through:

- shell intent from `gt ...` commands
- authoritative Git lifecycle events from hooks
- shared repo/branch/worktree context

This covers the important outcomes:

- new branch creation
- branch switching
- commit creation
- history rewrites from restacks or amends

If a later need emerges, Graphite can get lightweight shell-command enrichment without changing the core event model.

## Retrieval Impact

Git lifecycle events should become first-class recall evidence, not a side channel.

Immediate retrieval goals after this phase:

- repo- and branch-scoped recall should use Git lifecycle events as anchors
- rewrite events should be rendered distinctly from shell command text
- commit events should expose file paths and diff stats in summaries
- retrieval ranking should prefer authoritative Git outcomes over raw shell commands when both exist

## Workflow Test Matrix

Workflow tests should use real temporary repositories and real hooks.

Required cases:

- commit creation
- branch switch
- detached `HEAD`
- merge completion
- amend
- rebase
- worktree creation plus commands executed inside the worktree
- existing hook preservation during install
- hook uninstall removing only Bodhi-managed sections

Tests should assert:

- the right event type is stored
- shared context is populated correctly
- commit file paths and rewrite mappings are queryable
- no hook path breaks when the repo is not in a normal single-worktree state

## File-By-File Implementation Plan

### Types

- [packages/types/src/events.ts](/Users/aditpareek/Documents/bodhi/packages/types/src/events.ts)
  - refine Git event schemas where needed
- [packages/types/src/entities.ts](/Users/aditpareek/Documents/bodhi/packages/types/src/entities.ts)
  - reflect hydrated Git payloads and rewrite mappings

### Store Schema

- [packages/daemon/src/store/git-commit-events.sql.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/store/git-commit-events.sql.ts)
  - keep commit payload typed and minimal
- [packages/daemon/src/store/git-commit-files.sql.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/store/git-commit-files.sql.ts)
  - use typed commit file rows
- [packages/daemon/src/store/git-checkout-events.sql.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/store/git-checkout-events.sql.ts)
  - add `checkout_kind`
- [packages/daemon/src/store/git-merge-events.sql.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/store/git-merge-events.sql.ts)
  - keep merge payload outcome-focused
- add:
  - [packages/daemon/src/store/git-rewrite-mappings.sql.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/store/git-rewrite-mappings.sql.ts)

### Capture

- add:
  - [packages/daemon/src/capture/git.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/capture/git.ts)
- update:
  - [packages/daemon/src/cli/commands.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/cli/commands.ts)
  - [packages/daemon/src/cli/runtime.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/cli/runtime.ts)

### Store and Retrieval

- [packages/daemon/src/store/sqlite/event-payloads.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/store/sqlite/event-payloads.ts)
- [packages/daemon/src/store/sqlite/event-hydrators.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/store/sqlite/event-hydrators.ts)
- [packages/daemon/src/store/sqlite/event-store.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/store/sqlite/event-store.ts)
- [packages/daemon/src/retrieval/service.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/retrieval/service.ts)
- [packages/daemon/src/agent/system-prompt.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/agent/system-prompt.ts)

## Ordered Execution

1. finalize Git payload contracts and the rewrite mapping table
2. implement hook installation and uninstall with preservation markers
3. implement hook payload generation in `capture/git.ts`
4. wire store payload insertion and hydration
5. add workflow tests with real repos and worktrees
6. update retrieval and prompt rendering to use the new Git evidence
7. validate Graphite-style flows through generic Git + shell capture before any Graphite-specific work

## Exit Criteria

This phase is complete when:

- Git hooks install cleanly without taking over global Git config
- commit, checkout, merge, and rewrite events are captured as typed rows
- worktree and detached-`HEAD` cases are covered by workflow tests
- recall clearly distinguishes Git outcomes from shell command attempts
- the roadmap can move to terminal AI capture without reopening the Git model

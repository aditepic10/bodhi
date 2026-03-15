# TUI Phase 1 Implementation Plan

This document turns [tui-phase-1-blueprint.md](/Users/aditpareek/Documents/bodhi/docs/implementation/tui-phase-1-blueprint.md) into an execution plan against the current Bodhi codebase.

It is intentionally implementation-facing:

- exact dependency changes
- exact file seams
- exact mode-selection behavior
- exact test layers
- explicit deferrals

## Goal

Implement the first Bodhi full-screen TUI cleanly enough that:

- `bodhi` becomes the default full-screen experience in interactive terminals
- the current line-mode chat survives as `bodhi --plain`
- the TUI stays portable across future framework swaps
- the daemon/session/chat substrate remains unchanged in meaning

## Locked Decisions

These are no longer open questions for phase 1.

### Framework

- use `ink@6.8.0`
- use `react@19.2.4`
- use `@types/react@19.2.14`
- use `ink-testing-library@4.0.0`

Do not add `@inkjs/ui` in phase 1.

Phase 1 should be built from raw Ink primitives plus Bodhi-owned components so the product's interaction language and visual system remain ours.

### Product behavior

- bare `bodhi` launches the TUI in interactive TTYs
- `bodhi --plain` launches the existing line-mode chat client
- `bodhi --resume <session-id>` launches the TUI resumed into that exact session
- `bodhi recall "query"` remains separate
- `bodhi sessions` remains a plain/scriptable command

### Config shape

- keep daemon/runtime config in `config.toml`
- add a dedicated TUI config file:
  - `~/.config/bodhi/tui.toml`
- do not fold the TUI config into the daemon config surface

This preserves the blueprint's dedicated TUI config boundary while staying consistent with the repo's existing TOML configuration approach.

## Dependency Workstream

### Files

- [package.json](/Users/aditpareek/Documents/bodhi/package.json)
- [packages/daemon/package.json](/Users/aditpareek/Documents/bodhi/packages/daemon/package.json)

### Changes

Add to `@bodhi/daemon` dependencies:

- `ink@6.8.0`
- `react@19.2.4`

Add to `@bodhi/daemon` devDependencies:

- `@types/react@19.2.14`
- `ink-testing-library@4.0.0`

### Policy

- start with raw Ink plus Bodhi-owned components
- do not add extra terminal UI packages casually
- do not add generic Ink component kits to paper over design decisions we should own

## Entry Point And Mode Selection

### Current state

Today:

- [packages/daemon/src/cli/commands.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/cli/commands.ts) routes bare `bodhi` to `runInteractiveChat(runtime)`
- [packages/daemon/src/cli/chat.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/cli/chat.ts) is the existing line-mode chat client

### Phase 1 target

- bare `bodhi` should dispatch to the TUI when stdin and stdout are interactive TTYs
- `bodhi --plain` should force the current line-mode client
- `bodhi --resume <session-id>` should open the TUI on that session
- `bodhi --plain --resume <session-id>` should resume the plain client for debugging/fallback

### Files

- [packages/daemon/src/cli/commands.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/cli/commands.ts)
- [packages/daemon/src/cli/runtime.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/cli/runtime.ts)
- [packages/daemon/src/cli/types.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/cli/types.ts)
- [packages/daemon/src/cli/helpers.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/cli/helpers.ts)

### New runtime capability

Add runtime-level TTY detection so mode selection remains testable:

- `isInteractiveTerminal(): boolean`

Do not let `commands.ts` read `process.stdin.isTTY` directly.

### Help text update

The CLI help surface should become:

- `bodhi`
- `bodhi --resume <session-id>`
- `bodhi --plain`
- `bodhi --plain --resume <session-id>`
- `bodhi sessions`
- `bodhi recall "query"`

## TUI Domain Layout

Create a dedicated TUI domain under:

- `/Users/aditpareek/Documents/bodhi/packages/daemon/src/tui/`

Initial target structure:

- `run.tsx`
  - Ink bootstrap
  - top-level render/unmount lifecycle
- `app.tsx`
  - shell composition
- `config.ts`
  - TUI config schema and loader
- `theme.ts`
  - semantic theme tokens
- `keybindings.ts`
  - keymap registry
- `actions.ts`
  - action types and dispatch contracts
- `state/`
  - reducer
  - selectors
  - view-model mappers
- `hooks/`
  - terminal size
  - chat stream adapter
  - session list loading
  - composer controller
  - interrupt handling
- `components/`
  - shell
  - header
  - transcript
  - composer
  - status bar
  - session switcher
  - help overlay
  - command palette
  - loading-state
  - thinking-state
  - tool-state
  - notice
- `renderers/`
  - registry
  - assistant renderer
  - user renderer
  - system renderer
  - generic tool renderer
  - `memory-search`
  - `store-fact`
- `client/`
  - thin daemon-facing request wrappers for `/chat` and `/chat/sessions`

### Architectural rule

Only `run.tsx`, a small part of `app.tsx`, and a small number of hooks/components should be Ink-aware.

The rest should remain framework-portable:

- config
- theme tokens
- keybinding model
- actions
- reducer/state
- view models
- renderer contracts
- daemon client contracts

The component library itself should be Bodhi-owned:

- use raw Ink primitives underneath
- expose Bodhi-specific presentation primitives above them
- keep visual/state semantics consistent across transcript, overlays, and tool cards

## Config Plan

### File

- `~/.config/bodhi/tui.toml`

### Loader

Add a TUI-specific loader in:

- `packages/daemon/src/tui/config.ts`

This loader should:

- read defaults
- read `tui.toml` if present
- merge predictable nested config
- apply CLI overrides if any are added later
- validate with Zod

### Phase 1 config schema

Minimum:

- `theme`
- `density`
- `motion`
- `show_session_rail`
- `show_status_bar`
- keybinding overrides

Not in phase 1:

- plugin loading
- arbitrary component injection
- per-tool renderer packages

## State Model

### Server-backed data

- current session metadata
- recent session list
- transcript entries
- tool results
- stream lifecycle state from daemon events

### Client ephemeral state

- composer draft
- active overlay
- current focus target
- scroll anchor/viewport state
- optimistic send state
- interruption state
- transient notifications

### Reducer pattern

Use a single reducer-driven app state instead of scattered `useState` flags.

Action categories:

- bootstrap actions
- session actions
- stream actions
- composer actions
- overlay/focus actions
- terminal resize actions

### View models

Normalize daemon-backed objects into explicit view models before rendering:

- header view model
- transcript entry view model
- session list item view model
- status bar view model

Do not render raw daemon payloads directly in components.

## Stream And Client Plan

### Reuse existing contracts

The TUI must use:

- `POST /chat`
- `GET /chat/sessions`

Do not add new transport or alternate session endpoints for the TUI.

### New client wrappers

Add TUI-focused wrappers rather than calling `requestJson` / `requestSse` all over the tree:

- `createChatSession()`
- `loadChatSession()`
- `listChatSessions()`
- `streamChatTurn()`

These should live under `src/tui/client/` and wrap the existing CLI runtime/network layer shape where practical.

### Stream handling

The TUI should consume the current `/chat` stream and translate it into app actions:

- stream started
- assistant delta received
- tool event received
- error received
- finish received

Even if the first renderer pass mainly shows text and tool cards, the stream adapter should preserve richer event structure internally.

## Component Plan

### Phase 1 shell

Must ship first:

- shell layout
- header
- transcript
- composer
- status bar

This checkpoint should already support:

- new session
- exact resume
- multi-turn streaming
- interrupt

### Phase 1 overlays

After the shell works:

- session switcher
- help overlay
- command palette

All overlays should be keyboard-first and non-destructive to transcript state.

### Built-in renderer plan

Required in phase 1:

- assistant text
- user text
- system notice
- generic tool card
- `memory-search` card
- `store-fact` card

Renderer selection should be registry-driven, not `switch` statements spread across transcript components.

### Component-library plan

Alongside the renderers, build a small shared component set for:

- loading
- thinking
- tool progress
- inline notices
- empty states
- section framing

These components should become the first layer of Bodhi's TUI design system.

## Session UX Plan

### Entry flows

1. `bodhi`
   - create a new chat session
   - open TUI bound to that session
2. `bodhi --resume <id>`
   - load exact session
   - open TUI on that session
3. session switcher inside TUI
   - fetch recent sessions for current workspace ordering
   - allow switching without losing transcript integrity

### Resume hints

The TUI does not need to print the plain `Resume this session with:` footer while running, but exit behavior should still preserve the exact same semantic model as the current CLI.

## Performance Plan

### Immediate constraints

- stable layout under token streaming
- no full-screen jitter
- input remains responsive during assistant output
- static chrome rerenders as little as possible

### Implementation tactics

- isolate transcript updates from static header/status sections
- use `Static` intentionally for stable historical output regions when it actually reduces churn
- measure before adding terminal animation complexity
- keep renderer contracts compatible with future transcript windowing/virtualization

### Deferred until needed

- list virtualization/windowing
- background prefetch of older transcript ranges
- richer terminal animation system

The architecture should permit these later without forcing rewrites now.

## Theming And Interaction Plan

### Theme workstream

Implement one strong dark theme first.

Requirements:

- semantic tokens only
- calm/mineral palette
- distinct but restrained accent color(s)
- readable transcript states
- clear focus and status differentiation without neon overload

### Interaction polish workstream

Phase 1 should include:

- stable streaming cadence
- deliberate focus transitions
- non-jarring overlay reveal/hide behavior
- clear thinking/tool-running/ready states

Phase 1 should not include:

- gratuitous animation
- decorative spiritual motifs
- performance-heavy gimmicks

## Testing Plan

This repo is workflow-first, so the TUI test strategy should reflect that.

### 1. Contract and reducer tests

New tests around:

- TUI config merge and validation
- keybinding resolution
- action reducer behavior
- renderer registry selection
- daemon payload -> view model normalization

These should be mostly framework-agnostic.

### 2. Ink render tests

Use `ink-testing-library` for:

- shell empty state
- active stream state
- completed assistant turn
- session switcher open/close
- help overlay
- specialized tool cards

These should focus on user-visible render behavior, not internal implementation trivia.

### 3. CLI mode selection tests

Extend CLI tests to prove:

- bare `bodhi` chooses TUI in interactive TTY mode
- bare `bodhi` falls back appropriately otherwise
- `--plain` forces line mode
- `--resume` routes correctly in both modes

### 4. End-to-end workflow tests

Keep daemon/chat semantics tested separately, and add TUI-level workflow coverage for:

- launch new session
- stream a response
- interrupt safely
- resume exact session
- switch session from the overlay

Mock only the external LLM boundary, consistent with repo testing policy.

## File-By-File Worklist

### Dependencies

- [package.json](/Users/aditpareek/Documents/bodhi/package.json)
- [packages/daemon/package.json](/Users/aditpareek/Documents/bodhi/packages/daemon/package.json)

### CLI mode selection

- [packages/daemon/src/cli/commands.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/cli/commands.ts)
- [packages/daemon/src/cli/runtime.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/cli/runtime.ts)
- [packages/daemon/src/cli/types.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/cli/types.ts)
- [packages/daemon/src/cli/helpers.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/cli/helpers.ts)
- [packages/daemon/src/cli/chat.ts](/Users/aditpareek/Documents/bodhi/packages/daemon/src/cli/chat.ts)

### New TUI domain

- new files under [packages/daemon/src/tui/](/Users/aditpareek/Documents/bodhi/packages/daemon/src/tui)

### Config/types if needed

- [packages/types/src/config.ts](/Users/aditpareek/Documents/bodhi/packages/types/src/config.ts) only if shared config shape changes become necessary

Default plan:

- keep TUI config local to the daemon package first
- do not promote it into `@bodhi/types` unless another package truly needs it

## Ordered Execution

1. Add dependencies and TTY detection seam.
2. Add `--plain` and preserve the current line-mode path.
3. Scaffold `src/tui/` with config, theme, actions, reducer, and shell layout.
4. Wire TUI mode selection for bare `bodhi`.
5. Connect `/chat` stream into the TUI transcript.
6. Add session loading and session switcher.
7. Add built-in tool renderers.
8. Add help overlay, command palette, and keybinding display.
9. Add tests across reducer, renderer, CLI mode selection, and Ink render flows.
10. Run `scripts/validate.sh`, `scripts/smoke.sh`, `bun run typecheck`, `bun run lint`, and `bun test`.

## Explicit Deferrals

Not in this phase:

- plugin architecture
- user-installable third-party UI extensions
- multiple built-in themes
- session forking UI
- pane-heavy dashboard views
- graphical effects beyond terminal-safe staged transitions
- per-project TUI config

These should only land after the phase-1 TUI is stable, fast, and trusted.

## Why This Plan Is Clean

This plan keeps the highest-risk concerns separated:

- daemon/session semantics stay where they already belong
- Ink stays boxed as a rendering implementation, not a product dependency
- the TUI gets its own domain, config, and state model
- line mode survives as an explicit fallback
- tests emphasize Bodhi's contracts, not framework internals

That is the cleanest path to a premium TUI without painting the product into a framework-specific corner.

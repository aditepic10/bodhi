# TUI Phase 1 Blueprint

This document defines Bodhi's first full-screen terminal interface.

Execution detail lives in [tui-phase-1-implementation-plan.md](/Users/aditpareek/Documents/bodhi/docs/implementation/tui-phase-1-implementation-plan.md).

It is intentionally downstream of the accepted chat substrate work:

- exact session resume already exists
- persistent chat already has its own `/chat` contract
- recall already remains a separate one-shot contract

The TUI should be a premium client over those semantics, not a place where session, chat, or retrieval rules are reinvented.

## Goal

Make `bodhi` feel like a product people want to live in.

This phase is successful when:

- `bodhi` opens a full-screen TUI in interactive terminals
- the TUI sits directly on top of the existing `/chat` and `/chat/sessions` contracts
- the current plain chat path remains available as an explicit fallback, not the primary UX
- streaming, resume, session switching, tool rendering, and interruption feel deliberate and polished
- the implementation creates a clean TUI domain in the codebase that can evolve without leaking UI concerns back into daemon/session logic

## Product Identity

The interface should express what Bodhi is, not just what it does.

Bodhi is named for awakening. The TUI should feel:

- calm
- grounded
- spacious
- precise
- contemplative without becoming mystical wallpaper

The product language should draw from the meditative and reflective associations behind the name without becoming kitsch. The interface should help the user slow down enough to think clearly while still feeling fast and capable.

This means:

- fewer louder elements, more intentional hierarchy
- breathing room around transcript and tool artifacts
- motion that settles rather than startles
- status language that feels composed and confident
- visual emphasis on focus and continuity rather than dashboards and noise

## Validated External Patterns

These decisions are grounded in current official docs and live tool behavior.

### Full-screen by default is the right primary interactive posture

- OpenCode uses bare `opencode` as the main interactive surface and documents a dedicated TUI.
- Claude Code uses bare `claude` as the primary interactive mode, with print/programmatic modes separated from that main experience.

Sources:

- https://opencode.ai/docs/cli/
- https://opencode.ai/docs/tui/
- https://code.claude.com/docs/en/cli-reference

### Exact resume handles are better than hidden continuation policy

- Claude prints `claude --resume <session-id>`.
- OpenCode prints `opencode -s <session-id>`.

This matches Bodhi's already accepted session semantics and keeps session resumption explicit.

Sources:

- https://platform.claude.com/docs/en/agent-sdk/sessions
- https://opencode.ai/docs/cli/

### Themes and keybind customization are product features, not polish

- OpenCode treats themes and keybinds as first-class configuration surfaces.
- Claude Code exposes terminal configuration and interaction-level controls.

Sources:

- https://opencode.ai/docs/themes/
- https://opencode.ai/docs/keybinds
- https://opencode.ai/docs/config/
- https://code.claude.com/docs/en/terminal-config

### Ink is still the right implementation choice for Bodhi

- The current official npm release is `ink@6.8.0`.
- Ink already provides the primitives Bodhi needs for a premium terminal app:
  - `useInput`
  - `useFocus`
  - `useFocusManager`
  - `Static`
  - `measureElement`
- Ink also has an official testing surface through `ink-testing-library`.

This is the best fit for Bodhi's Bun + TypeScript + existing daemon architecture. Bubble Tea and Textual are useful reference points, but they would introduce a runtime/language split right before the UI phase.

Phase 1 should still use Bodhi-owned design components rather than leaning on a generic component kit. Ink is the rendering/runtime layer, not the design system.

OpenTUI is worth watching, but it should not be the phase 1 foundation because its own upstream repo still marks it as not ready for production use.

Sources:

- `npm view ink version` -> `6.8.0`
- https://github.com/vadimdemedes/ink
- https://github.com/vadimdemedes/ink-testing-library
- https://opentui.com/
- https://opentui.com/docs/getting-started/
- https://github.com/sst/opentui
- https://github.com/charmbracelet/bubbletea
- https://textual.textualize.io/

### The framework should be swappable

The TUI architecture should assume that Ink is an implementation choice, not a product invariant.

That means:

- Bodhi owns the interaction model
- Bodhi owns the session and chat semantics
- Bodhi owns renderer contracts
- Bodhi owns theme tokens, keybindings, and config schemas
- Ink only owns phase-1 rendering and terminal event plumbing

If a future framework such as OpenTUI becomes the better production choice, Bodhi should be able to migrate without redesigning the core TUI model.

## Product Semantics

### Primary entrypoint

- `bodhi` launches the full-screen TUI when stdin and stdout are interactive TTYs
- `bodhi --resume <session-id>` launches the same TUI resumed into that exact session
- `bodhi recall "query"` remains the separate one-shot path

### Fallbacks

- `bodhi --plain` launches the existing line-mode chat client
- non-interactive environments should auto-fallback to plain behavior or error clearly when a full-screen TUI would be invalid
- `bodhi sessions` remains a scriptable list surface even after the TUI lands

### No silent session policy changes

- the TUI must not introduce implicit auto-resume rules that contradict the accepted CLI/session ADRs
- the TUI may show recent sessions prominently
- the user still chooses exact resume or starts a new session

## Experience Principles

The TUI should feel premium because the interaction design is coherent, not because it is visually noisy.

### Visual direction

- dark-first visual system for phase 1
- calm, high-contrast shell-native palette with a small set of brand accents
- asymmetric layout with clear hierarchy instead of a bland two-pane clone
- carefully chosen empty states and transitions so the interface feels alive before the first response arrives
- typography should respect the user's terminal font but create hierarchy through spacing, weight, framing, and rhythm
- visual density should feel breathable and meditative rather than maximally information-packed

### Micro-interactions

- streaming text should reveal with stable cadence, not janky reflow
- session switcher and overlays should animate through terminal-safe staged reveal, not fake pixel effects
- transitions should feel like settling and focus changes, not flashy movement
- status changes should feel intentional:
  - connecting
  - thinking
  - tool running
  - interrupted
  - complete
- focus changes should be obvious without looking noisy
- optimistic local affordances should acknowledge input immediately even while the daemon is still responding

### Product feel

- the user should always know where they are:
  - session
  - workspace
  - current mode
  - whether Bodhi is thinking or ready
- the interface should never look frozen during model or tool latency
- advanced actions should feel discoverable without covering the core chat experience in chrome
- the interface should reward long periods of use without creating fatigue

## Information Architecture

Phase 1 should ship one primary screen with lightweight overlays instead of a maze of screens.

### Main screen

- transcript column
- persistent composer
- compact session/workspace header
- optional right-side or overlay session rail depending on terminal width

### Overlays

- session switcher
- command palette / quick actions
- help and keybind reference
- transient toast/notification layer

Overlays should feel like focused contemplative layers over the main workspace, not modal clutter.

### Layout behavior

- wide terminals:
  - transcript as the primary column
  - session/context rail visible or dockable
- narrow terminals:
  - transcript and composer remain primary
  - session list and help move into overlays

The transcript must always win over chrome.

## Built-In Renderers

The TUI should not flatten every message into generic prose when Bodhi already has structured chat and tool content.

Phase 1 should include dedicated renderers for:

- assistant text turns
- user turns
- system notices
- tool turns
- interruption/error boundaries

### Tool renderers required now

For the tools Bodhi already ships:

- `memory-search`
  - render query summary
  - render bounded result groups:
    - events
    - facts
  - show enough detail to understand why the model searched without dumping raw JSON
- `store-fact`
  - render fact key/value
  - show whether the fact became `active` or `pending`

These should look like first-class conversation artifacts, not debug logs.

### Renderer policy

- use specialized renderers for known tools
- fall back to a generic structured tool card for unknown future tools
- do not hardcode rendering logic into the stream or store layers

This keeps new tool additions cheap and keeps the TUI extensible.

## Component System

Phase 1 should establish a Bodhi-owned TUI component set.

This should include reusable primitives for:

- loading states
- thinking states
- tool execution states
- transcript blocks
- overlays
- notices and errors
- status indicators

These components should be:

- visually consistent
- driven by theme tokens
- small and composable
- specific enough to express Bodhi's product identity

Do not outsource Bodhi's interaction language to a generic component library.

## Extensibility Model

Phase 1 should be built as if Bodhi will gain many more capabilities:

- more tools
- more workflows
- more session views
- more skill-aware surfaces
- richer derived-memory artifacts

The TUI should therefore be extensible by construction.

### Extension seams

- renderer registry for known message and tool renderers
- centralized theme tokens
- centralized keybinding registry
- dedicated TUI config schema and loader
- overlay registry or command registry for future actions
- explicit view-model layer between daemon data and Ink components

### What extensibility should not mean

- no generic plugin system in phase 1
- no uncontrolled component injection from arbitrary code paths
- no coupling between future skill concepts and core transcript layout

The goal is structured extensibility, not accidental sprawl.

## Architecture

The TUI should live in its own domain under `packages/daemon/src/tui/`.

Recommended structure:

- `packages/daemon/src/tui/run.tsx`
  - TUI bootstrap and Ink render entrypoint
- `packages/daemon/src/tui/app.tsx`
  - top-level shell and state wiring
- `packages/daemon/src/tui/theme.ts`
  - theme tokens and palette contracts
- `packages/daemon/src/tui/keybindings.ts`
  - keymap definitions and lookup
- `packages/daemon/src/tui/config.ts`
  - TUI config schema, defaults, and precedence merge
- `packages/daemon/src/tui/renderers/registry.ts`
  - renderer lookup and fallback registration
- `packages/daemon/src/tui/commands/`
  - command palette items and future action registration
- `packages/daemon/src/tui/hooks/`
  - terminal-size
  - chat stream consumption
  - focus management
  - composer behavior
- `packages/daemon/src/tui/components/`
  - transcript
  - composer
  - header
  - session-list
  - status-bar
  - command-palette
  - help-overlay
- `packages/daemon/src/tui/renderers/`
  - assistant-message
  - tool-card
  - memory-search-card
  - store-fact-card
  - system-notice
- `packages/daemon/src/tui/state/`
  - view models and state reducers only

Rules:

- UI-only state stays in `tui/`
- session, message, and resume semantics stay in daemon/store/API layers
- do not thread TUI-specific conditionals back into `/chat` or the store
- extension points should be explicit registries, not ad hoc imports spread through the tree
- framework-specific code should stay boxed near the TUI shell, not spread through view models, config, keybindings, or renderer contracts

## Configuration Model

The TUI should have its own configuration surface instead of piggybacking everything onto runtime or daemon config.

This mirrors what the strongest terminal tools do:

- OpenCode separates runtime config from dedicated `tui.json`
- themes and keybinds are schema-backed, not loose ad hoc flags

Sources:

- https://opencode.ai/docs/config/
- https://opencode.ai/docs/tui/

Phase 1 should define a dedicated TUI config schema for:

- theme
- keybindings
- layout preferences
- animation / motion preferences
- transcript density
- future renderer toggles

Recommended precedence:

1. built-in defaults
2. user TUI config
3. project TUI config if we later decide to support it
4. CLI flags for explicit per-run overrides

Rules:

- configs should merge predictably, not replace wholesale
- the schema must be explicit and runtime-validated
- runtime/daemon config and TUI config stay separate even when loaded together

## State and View Discipline

The TUI should use a single, deliberate view model instead of scattering view flags and ad hoc state across components.

This mirrors the broader industry direction in strong terminal frameworks:

- one place where view state is derived
- one-way data flow into renderers
- explicit event/action handling rather than hidden side effects

Reference signal:

- Bubble Tea's current move toward a more declarative single-source-of-truth view model
  - https://github.com/charmbracelet/bubbletea/releases

For Bodhi, this means:

- daemon-backed data is normalized into explicit view models
- components render from view models
- input handlers dispatch actions
- reducers/state hooks update client-owned ephemeral state
- renderers stay presentation-first

This is also the portability seam: the view model and action model should survive a future framework swap.

Do not spread layout, focus, and overlay logic across arbitrary components.

## Shared Contracts

The TUI must reuse the existing daemon contracts:

- `POST /chat`
- `GET /chat/sessions`
- `POST /agent` only for explicit recall flows if surfaced later inside the TUI

The TUI should consume the existing AI SDK-style chat stream, not invent its own transport.

This is non-negotiable:

- no second chat backend
- no TUI-local session state source of truth
- no UI-only reinterpretation of resume semantics

## State Model

The TUI should keep a thin client-side view model around daemon-backed truth.

### Server-owned truth

- chat sessions
- conversation history
- session ordering metadata
- tool results
- assistant output

### Client-owned ephemeral state

- focus target
- overlay visibility
- draft composer value
- pending interruption UI
- transient animation state
- scroll position

This split keeps the TUI replaceable and testable.

The TUI should also preserve one-way flow:

- daemon data -> normalized view model -> components
- user input -> action handlers -> ephemeral state updates or daemon requests

## Interaction Model

Phase 1 key behaviors:

- `Enter`
  - submit
- `Shift+Enter`
  - newline
- `Ctrl+C`
  - interrupt generation if streaming
  - otherwise offer clean exit
- `Esc`
  - close overlays
- `/`
  - open command palette or slash-command suggestions when composer is empty
- session picker hotkey
  - open recent sessions
- help hotkey
  - open keybind reference

Keybindings should be defined centrally and rendered back to the user in the help surface.

## Theming

Phase 1 should ship with a real theme system, even if the initial theme count is small.

Requirements:

- semantic tokens, not inline colors
- ship one primary dark theme in phase 1
- keep the token system ready for later additional themes
- reserve high-contrast support as a near follow-up, not a reason to muddy the first visual direction
- config-driven theme selection
- consistent renderer usage across transcript, chrome, overlays, and tool cards

OpenCode's theme model is the right reference shape: customization should exist without turning the UI into a user-assembled patchwork.

The initial dark theme should feel:

- quiet
- warm or mineral rather than neon
- premium rather than hacker-camp
- readable over long sessions
- clearly Bodhi, not a generic dark dashboard

## Performance and Terminal Discipline

The TUI must feel responsive under streaming load.

Requirements:

- avoid full-screen rerender churn on every incoming token
- isolate rapidly updating transcript regions from static chrome where possible
- keep layout stable while streaming
- degrade gracefully on small terminals
- preserve low-latency input even while the transcript is updating
- design transcript rendering so long sessions can later adopt list virtualization or windowing without rewriting the whole screen architecture

Ink primitives like `Static` and `measureElement` should be used intentionally to reduce terminal churn and keep transcript behavior stable.

Performance discipline matters to product feel. A calm interface that lags or jitters is not calm.

## Accessibility and Terminal Reality

Phase 1 should still respect terminal constraints.

Requirements:

- all interaction remains keyboard-first
- no color-only meaning
- obvious focus indication
- sensible behavior in narrow terminals
- no dependency on mouse support
- clear copyable text output

The fallback plain mode is also an accessibility and reliability surface, not just an implementation escape hatch.

## Testing Bar

This phase is not done until these are covered.

### Product workflows

- bare `bodhi` launches the TUI in an interactive terminal
- `bodhi --plain` launches the plain chat client
- `bodhi --resume <session-id>` opens the TUI on the exact session
- narrow terminal layout remains usable
- session switching works without corrupting active state
- interrupting generation does not corrupt the transcript

### Rendering workflows

- streaming text updates the transcript without duplicating or reordering content
- tool turns render through specialized cards for `memory-search` and `store-fact`
- unknown tools render through the generic tool card
- overlays can open and close without breaking composer focus

### Contract workflows

- TUI relies only on `/chat` and `/chat/sessions`
- no hidden local session reconstruction
- resume semantics match the existing CLI semantics exactly
- view-model and renderer-contract tests should pass independently of Ink-specific rendering tests

### Visual regression discipline

- snapshot or structured render tests should cover:
  - empty state
  - active stream
  - completed assistant turn
  - tool card states
  - session picker
  - error state

`ink-testing-library` should be the default test harness for TUI component behavior.

## Non-Goals

- graphical terminal effects that depend on nonstandard terminal features
- mouse-first UX
- rethinking session semantics again
- replacing the daemon API with a TUI-only transport
- shipping every possible tool renderer in phase 1
- building a plugin system for UI panels
- trying to represent "calm" through decorative spiritual motifs instead of strong interaction design

## Ordered Implementation

1. Add the TUI domain and bootstrap with Ink `6.8.0`.
2. Keep `bodhi --plain` as the existing line-mode path.
3. Make bare `bodhi` select TUI vs plain based on TTY capability.
4. Implement the shell layout, composer, transcript, and status bar.
5. Implement the `/chat` stream client for the TUI.
6. Add session list and exact resume handling.
7. Add built-in renderers for `memory-search` and `store-fact`.
8. Add theme tokens, help overlay, and command palette.
9. Add render and workflow tests.
10. Only after that, consider richer animations, more tool cards, and wider customization.

## Why This Is The Right Foundation

This approach:

- uses the strongest current Bodhi seams instead of bypassing them
- matches the dominant terminal-agent UX pattern of full-screen by default
- preserves a plain fallback without letting it define the product ceiling
- keeps the TUI in its own code domain
- makes tool rendering and session UX first-class from the start
- gives Bodhi a distinct product identity instead of a generic terminal chat shell
- keeps Bodhi portable across future TUI frameworks because the framework is not the product model
- aligns with the roadmap's move from substrate to premium workflow client

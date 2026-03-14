# Chat Substrate Blueprint

This document defines the next Bodhi phase after the initial CLI chat groundwork: a proper history-aware chat substrate that cleanly separates ephemeral recall from persistent chat and aligns with AI SDK UI best practices.

It is the foundation the future TUI should build on.

## Goal

Build the right chat backend now so the next UI layer is a client over stable semantics, not the place where chat semantics are invented.

This phase is successful when:

- `bodhi recall` remains ephemeral and retrieval-first
- persistent chat uses real session history, not prompt-only requests
- chat storage and transport are designed for AI SDK UI-style message handling
- the daemon exposes a distinct chat contract that the CLI and future TUI can both consume
- existing `chat_sessions` and `conversations` remain useful and are evolved forward rather than replaced casually

## Validated External Patterns

These patterns are grounded in official AI SDK guidance and proven terminal-agent products.

### AI SDK app state should be message-oriented

- AI SDK recommends treating `UIMessage` as the application source of truth.
- Stored messages should be validated and converted to model messages before generation.

Sources:

- https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence
- https://ai-sdk.dev/docs/reference/ai-sdk-core/validate-ui-messages
- https://ai-sdk.dev/docs/reference/ai-sdk-ui/convert-to-model-messages

### Chat streaming should be UI-message oriented

- AI SDK provides a first-class UI message stream abstraction.
- Terminal and custom clients are expected to consume streamed UI message chunks rather than only raw text deltas.

Sources:

- https://ai-sdk.dev/docs/reference/ai-sdk-ui/create-ui-message-stream
- https://ai-sdk.dev/docs/reference/ai-sdk-ui/read-ui-message-stream
- https://ai-sdk.dev/examples/api-servers/hono

### Sessions and exact resume are first-class in strong terminal tools

- Claude and OpenCode both expose exact resume handles by session id.
- OpenCode’s CLI/TUI/server split reinforces that UI surfaces should sit on top of a stable session/backend model.

Sources:

- https://platform.claude.com/docs/en/agent-sdk/sessions
- https://opencode.ai/docs/cli/
- https://opencode.ai/docs/tui/
- https://opencode.ai/docs/agents/

## Product Split

Bodhi should now treat recall and chat as different products that share lower-level plumbing.

### `recall`

- ephemeral
- one-shot
- retrieval-first
- no conversation history
- current `bodhi recall "query"` remains the surface

### `chat`

- persistent
- sessioned
- history-aware
- retrieval-augmented, but not retrieval-only
- powers bare `bodhi`
- must become the substrate for the future TUI

This is an intentional product boundary, not just an implementation detail.

## Storage Direction

Keep the current relational split:

- `chat_sessions` for session metadata
- `conversations` for ordered per-session message history

That remains correct.

What changes is the role of `conversations`:

- today it is mostly persistence
- after this phase it becomes the actual chat source of truth the runtime uses

## Conversation Model

The current `role + content + session_id + created_at` shape is useful but incomplete for long-term UI-message-native chat.

Phase recommendation:

### Phase 1: strengthen the existing table

Keep `conversations`, but add the minimum extra metadata needed for robust history-aware chat and UI evolution.

Minimum additions required now:

- `role`
  - `user`
  - `assistant`
  - `system`
  - `tool`
- `status`
  - `complete`
  - `streaming`
  - `error`
  - `interrupted`
- stable message ids owned by the server
- tool-call fidelity sufficient to preserve:
  - tool invocation turns
  - tool results or outcomes
  - enough structured information for future TUI rendering and debugging
- a structured `content_json` bridge for assistant and tool messages so the daemon can reconstruct exact model history from stored rows

This keeps the migration path small while making the chat stream/UI contract more honest.

### Phase 2: richer message-part fidelity beyond tool turns if needed

If the future TUI or tool/result fidelity requires it, evolve from flattened rows toward a typed UI-message-part representation.

That may mean:

- richer child tables for message parts
- or another typed storage shape that preserves AI SDK UI semantics cleanly

Do not jump there unless requirements beyond explicit tool support prove it necessary.

## Chat Runtime Contract

The current prompt-only `/agent` contract is not enough for chat.

Add a distinct chat route:

- `POST /chat`

Request responsibilities:

- bind to an existing `session_id`
- include current workspace context
- accept the new user turn
- load prior session history on the server
- validate and convert stored chat state into model messages

Response responsibilities:

- stream a chat-oriented response, not just ad hoc recall text deltas
- preserve session identity
- surface start/finish/error boundaries clearly
- evolve cleanly toward AI SDK UI message streaming

Implemented bridge direction:

- `POST /chat` streams AI SDK UI-message chunks
- `POST /agent` remains the one-shot recall path
- `conversations.content_json` stores structured assistant/tool content for history reconstruction
- the CLI currently renders text chunks only, while the future TUI can consume the richer stream surface

## AI SDK Alignment

For persistent chat, the target architecture is:

1. store application chat state in a message-oriented form
2. validate messages before generation
3. convert stored chat state to model messages
4. call `streamText({ messages, ... })`
5. stream UI/message chunks back to clients

This is the best-practice path.

The daemon should stop treating persistent chat as:

- `prompt: latest user message`

and move toward:

- `messages: prior session history + current turn`

## Shared Logic

Recall and chat should still share:

- provider resolution
- tool registry
- retrieval service
- security/redaction rules
- SSE/server infrastructure where possible

But they should not share the same request/response semantics.

## Migration / Backfill Strategy

Use Drizzle schema changes and generated migrations only.

Migration expectations:

- preserve existing `chat_sessions`
- extend `conversations` forward
- backfill new columns for existing rows conservatively
- keep old data readable after migration

Likely backfill rules:

- existing conversation roles remain unchanged
- existing rows default to `status = complete`

Do not rewrite historical data more than necessary.

## Test Bar

This phase is not done until these workflows pass:

### Chat continuity

- user asks `what is 2+2?`
- assistant answers `4`
- user asks `what is your previous answer plus 4?`
- assistant can answer `8`

### Resume continuity

- create session
- exit
- resume exact session
- prior turns still influence the next answer

### Recall/chat split

- recall does not use conversation history
- chat does use conversation history
- both can share retrieval without collapsing into one semantic path

### Storage continuity

- existing session rows remain readable after migration
- existing conversation rows backfill correctly
- new message metadata persists correctly

### Streaming continuity

- streamed assistant output is still robust under interruption
- session remains intact on interrupted generation
- server emits a stable finish/error shape

### TUI-readiness

- the chat stream exposes enough structure for a future full-screen client
- clients do not need hidden local state to reconstruct the session

## TUI-Readiness Requirements

The future TUI should be able to rely on:

- exact resume by session id
- session listing metadata from `chat_sessions`
- message history from `conversations`
- stable streaming start/finish/error semantics
- later extension points for tool progress and richer message parts

The TUI should not need to redefine:

- what a session is
- what a turn is
- how history is loaded
- how resume works

## Non-Goals For This Phase

- full graphical/Ink TUI
- session forking
- automatic resume policy
- broad semantic retrieval redesign
- replacing the relational session/message model

## Recommended Implementation Order

1. Split recall and chat semantics at the route/service level.
2. Make chat history-aware by loading session messages before generation.
3. Extend `conversations` with the minimum extra metadata needed for robust chat.
4. Introduce the chat stream contract the future TUI can consume.
5. Add workflow tests for multi-turn chat continuity and resumed sessions.
6. Only after that, begin TUI work.

## Why This Is The Right Foundation

This approach:

- preserves the current useful schema work
- aligns Bodhi with AI SDK best practices
- matches the shape of strong terminal AI tools
- keeps recall fast and simple
- gives the TUI a stable backend contract instead of forcing a rewrite later

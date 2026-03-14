# ADR-054: Recall and Chat Are Separate Runtime Contracts

## Status
Accepted

## Context

Bodhi originally served both one-shot recall and persistent chat through the same `/agent` prompt-only contract. That made the CLI chat groundwork easy to land, but it violated the product semantics we had already accepted:

- `bodhi recall` is ephemeral and retrieval-first
- bare `bodhi` is persistent, sessioned, and history-aware

It also left the future TUI sitting on the wrong abstraction. A prompt-only route can answer isolated questions, but it cannot provide reliable multi-turn continuity or preserve tool turns in a way the UI can render later.

## Decision

Split recall and chat at the daemon contract layer.

- `/agent` remains the ephemeral recall endpoint
- `/chat` becomes the history-aware persistent chat endpoint
- only `/chat` is allowed to read or write `chat_sessions` / `conversations`
- `chat_sessions` remains the parent metadata table
- `conversations` remains the ordered child history table
- `conversations` is extended with:
  - `role`
  - `status`
  - `content_json`
- assistant and tool response messages are persisted with structured content so the daemon can reconstruct exact model history on later turns
- `/chat` streams AI SDK UI-message chunks so the CLI and future TUI share the same chat transport semantics

This is a bridge architecture, not the final ceiling. We are not claiming full UI-message-native storage yet, but we are preserving the structured assistant/tool content needed to evolve there cleanly.

## Consequences

### Easier

- multi-turn chat continuity works correctly
- exact resume now resumes real conversation state, not just a session id
- tool calls and tool results are preserved in chat history
- the future TUI can build on the `/chat` stream contract instead of redefining chat semantics
- recall stays simple and does not pollute session history

### Harder

- the daemon now owns two related but distinct streaming contracts
- `conversations` is a transitional bridge table rather than a final perfect message store
- chat persistence logic must preserve structured assistant/tool content correctly

## Ground Truth

- AI SDK recommends message-oriented application state, validation before generation, conversion to model messages, and UI-message streams for clients:
  - https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence
  - https://ai-sdk.dev/docs/reference/ai-sdk-core/validate-ui-messages
  - https://ai-sdk.dev/docs/reference/ai-sdk-ui/convert-to-model-messages
  - https://ai-sdk.dev/docs/reference/ai-sdk-ui/create-ui-message-stream
  - https://ai-sdk.dev/docs/reference/ai-sdk-ui/read-ui-message-stream
- Claude and OpenCode both treat exact resume handles and persistent sessions as first-class product concepts:
  - https://platform.claude.com/docs/en/agent-sdk/sessions
  - https://opencode.ai/docs/cli/
  - https://opencode.ai/docs/tui/

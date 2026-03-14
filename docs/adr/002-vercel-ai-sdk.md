# ADR-002: Vercel AI SDK v6

## Status
Accepted

## Context
Bodhi needs streaming, tool use, and multiple model providers behind one interface.

## Decision
Use the Vercel AI SDK as the LLM abstraction layer.

## Consequences
Provider switching is a config concern instead of an architectural rewrite. The codebase depends on SDK abstractions and versions moving with that ecosystem.

## Ground Truth
OpenCode, Vercel AI SDK, Anthropic and OpenAI provider adapters.

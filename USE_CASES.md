# Bodhi Use Cases

This file is the in-repo map of the product and extension scenarios the architecture is intended to support.

The full imported catalog of 77 use cases lives in [docs/use-cases/full-catalog.md](./docs/use-cases/full-catalog.md). Use that file when roadmap planning needs the original stress-test detail. Use this file for the shorter architectural summary.

## Native Today

- Recall recent shell activity through `bodhi recall`
- Search past events through the query API
- Store and retrieve durable facts
- Stream agent responses over SSE
- Recover spooled shell events after daemon downtime
- Run without an API key while preserving capture, storage, and search

## Clean Extensions

These should be additive, not architectural rewrites:
- new capture sources such as git, browser, or Slack
- terminal AI chat capture with prompt/response pairing
- bounded terminal output capture with redaction and truncation
- new model providers
- new query modes and agent tools
- new clients over the same daemon API
- richer fact review and history workflows
- service installation and operational tooling

## Architectural Stress Cases

The current design is specifically intended to absorb:
- multiple capture sources feeding the same append-only log
- asynchronous intelligence that can fail independently of ingestion
- developer context dimensions such as repo root, worktree, branch, session, and thread
- future structured metrics and dashboards
- richer search modes without discarding FTS5
- transport reuse across CLI, future web UI, and MCP exposure

## Current Gaps

These are known follow-on areas, not architecture failures:
- richer local capture breadth before the killer workflows are credible
- a developer activity model that consistently carries repo, worktree, branch, and session context
- explicit privacy rules for transcript capture and bounded output capture
- operational work such as log rotation, backups, and service install
- more explicit status and metrics sharing between API and CLI
- mapping the imported use-case catalog onto capture, retrieval, analytics, scheduling, and integration work

## How To Use This File

When evaluating a feature:

1. Classify it as `native`, `clean`, or `forced`.
2. Identify which module boundaries it touches.
3. Check whether an ADR already explains the required tradeoff.
4. If it feels forced, pause and document the architectural gap before building it.

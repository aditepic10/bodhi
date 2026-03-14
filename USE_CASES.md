# Bodhi Use Cases

This file is the in-repo map of the product and extension scenarios the architecture is intended to support.

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
- new model providers
- new query modes and agent tools
- new clients over the same daemon API
- richer fact review and history workflows
- service installation and operational tooling

## Architectural Stress Cases

The current design is specifically intended to absorb:
- multiple capture sources feeding the same append-only log
- asynchronous intelligence that can fail independently of ingestion
- future structured metrics and dashboards
- richer search modes without discarding FTS5
- transport reuse across CLI, future web UI, and MCP exposure

## Current Gaps

These are known follow-on areas, not architecture failures:
- large implementation files that need seam-preserving refactors
- operational work such as log rotation, backups, and service install
- more explicit status and metrics sharing between API and CLI
- fuller use-case catalog import from the architecture plan

## How To Use This File

When evaluating a feature:

1. Classify it as `native`, `clean`, or `forced`.
2. Identify which module boundaries it touches.
3. Check whether an ADR already explains the required tradeoff.
4. If it feels forced, pause and document the architectural gap before building it.

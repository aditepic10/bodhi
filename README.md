# Bodhi

Bodhi is a personal memory daemon for engineers. It runs locally, captures engineering activity, derives facts from that activity, and exposes recall/query APIs over a local daemon.

## Current Status

Week 1 MVP is implemented:
- Bun workspace monorepo with `@bodhi/types` and `@bodhi/daemon`
- Hono daemon on a Unix domain socket, with TCP fallback
- SQLite storage with FTS5 search, spool replay, and typed event bus
- Streaming agent recall over SSE
- Shell capture hooks and CLI entrypoint
- Intel extraction service with bounded queue and fact supersession

## Quickstart

```bash
bun install
bun run typecheck
bun run lint
bun test
```

Run the CLI without linking:

```bash
bun run packages/daemon/src/cli.ts init
bun run packages/daemon/src/cli.ts start
bun run packages/daemon/src/cli.ts status
bun run packages/daemon/src/cli.ts recall "what have I been working on?"
bun run packages/daemon/src/cli.ts stop
```

Or link the daemon package globally:

```bash
cd packages/daemon
bun link
```

If `bodhi` is not found after linking, add `~/.bun/bin` to `PATH`.

## Repo Guide

- [ARCHITECTURE.md](/Users/aditpareek/Documents/bodhi/ARCHITECTURE.md): system overview, invariants, module boundaries, extension seams
- [ROADMAP.md](/Users/aditpareek/Documents/bodhi/ROADMAP.md): post-MVP roadmap and operational work
- [USE_CASES.md](/Users/aditpareek/Documents/bodhi/USE_CASES.md): extension and product use-case map
- [docs/testing.md](/Users/aditpareek/Documents/bodhi/docs/testing.md): workflow-testing policy and verification expectations
- [docs/adr/README.md](/Users/aditpareek/Documents/bodhi/docs/adr/README.md): ADR index and template
- [AGENTS.md](/Users/aditpareek/Documents/bodhi/AGENTS.md): concise contributor/agent rules

## Working Agreement

- Preserve the seven architectural invariants documented in [ARCHITECTURE.md](/Users/aditpareek/Documents/bodhi/ARCHITECTURE.md).
- Test workflows, not methods. Use real SQLite and real pipeline/store code.
- Keep the hot path synchronous and non-LLM-bound; keep intelligence on the cold path.
- Add architecture decisions to `docs/adr/` when the repo makes a meaningful tradeoff.

## Verification

The expected validation loop before a commit is:

```bash
bun run typecheck
bun run lint
bun test
scripts/validate.sh
```

For command-path validation, also run:

```bash
bodhi init
bodhi start
bodhi status
bodhi recall "what do you know about me?"
bodhi stop
```

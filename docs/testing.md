# Testing Strategy

## Philosophy

Bodhi tests workflows, not methods.

The confidence target is user-visible behavior:
- ingest to search
- spool to replay
- event to intel extraction to fact supersession
- stored memory to bounded retrieval to recall answer
- agent streaming over SSE
- CLI command paths

## What We Do Not Mock

These should stay real in tests:
- SQLite
- store implementation
- pipeline
- event bus

The normal test database is SQLite `:memory:` or a temp on-disk database when the workflow needs filesystem behavior.

## What We Do Mock

Only external LLM calls are mocked in the automated suite.

That keeps tests deterministic while preserving the daemon’s real internal behavior.

## Test Layers

### Workflow Tests

Primary test layer. These validate:
- idempotent event ingest
- FTS5 correctness
- fail-closed redaction
- spool recovery
- auth and route trust boundaries
- SSE streaming behavior
- intel queue behavior and circuit breaking
- daemon orchestration
- CLI command behavior

### Smoke Tests

Used for command-path confidence:
- `bodhi init`
- `bodhi start`
- `bodhi status`
- `bodhi recall`
- `bodhi stop`

These should be run against the real CLI and real daemon. Live LLM smoke tests require a local API key in `.env`.

## Verification Expectations

Before a commit:

```bash
bun run typecheck
bun run lint
bun test
```

For larger daemon changes, also run:

```bash
scripts/validate.sh
scripts/smoke.sh
```

## Adding Tests

When behavior changes:

1. Add or update a workflow test that names the user-visible behavior.
2. Prefer extending an existing workflow suite over creating narrow method tests.
3. If a new invariant is introduced, document it in an ADR or architecture doc.
4. If the change touches trust boundaries or reliability paths, add a regression test before refactoring further.

# ADR Index

Architecture Decision Records document why Bodhi chose the current architecture, not just what the code does.

## Status

All ADRs in this directory are currently `Accepted` unless the file states otherwise.

## Index

- [ADR-001: SQLite + Drizzle](./001-sqlite-drizzle.md)
- [ADR-002: Vercel AI SDK v6](./002-vercel-ai-sdk.md)
- [ADR-003: Bun workspaces with two packages](./003-monorepo.md)
- [ADR-004: Activity log, not event sourcing](./004-activity-log.md)
- [ADR-005: Hot/cold path separation](./005-hot-cold-paths.md)
- [ADR-006: Typed event bus](./006-typed-event-bus.md)
- [ADR-007: Bi-temporal facts](./007-bi-temporal-facts.md)
- [ADR-008: Hono server](./008-hono-server.md)
- [ADR-009: Security phases](./009-security-phases.md)
- [ADR-010: Biome](./010-biome.md)
- [ADR-011: SSE streaming](./011-sse-streaming.md)
- [ADR-012: Orchestrator chains](./012-orchestrator.md)
- [ADR-013: Exact version pinning](./013-exact-pinning.md)
- [ADR-014: `@tsconfig/bun`](./014-tsconfig-bun.md)
- [ADR-015: Exact bus matching](./015-exact-bus-matching.md)
- [ADR-016: Pure pipeline](./016-pure-pipeline.md)
- [ADR-017: Bounded intel queue](./017-bounded-intel-queue.md)
- [ADR-018: Three capture levels](./018-capture-levels.md)
- [ADR-019: CLI in daemon package](./019-cli-in-daemon.md)
- [ADR-020: Self-initializing daemon](./020-self-init-daemon.md)
- [ADR-021: Two-boundary redaction](./021-two-boundary-redaction.md)
- [ADR-022: Structured tool parameters](./022-structured-tool-params.md)
- [ADR-023: Intel visibility timeout](./023-intel-visibility-timeout.md)
- [ADR-024: No I/O in transforms](./024-no-io-in-transforms.md)
- [ADR-025: secretlint redaction](./025-secretlint-redaction.md)
- [ADR-026: Drop-oldest queue overflow](./026-drop-oldest-queue.md)
- [ADR-027: Circuit breaker](./027-circuit-breaker.md)
- [ADR-028: CaptureSource declares event types](./028-capture-event-types.md)
- [ADR-029: `BEGIN IMMEDIATE`](./029-begin-immediate.md)
- [ADR-030: Prompt injection defense](./030-prompt-injection-defense.md)
- [ADR-031: Unix socket default transport](./031-unix-socket-transport.md)
- [ADR-032: Fact provenance and status](./032-fact-provenance-status.md)
- [ADR-033: Event idempotency via spool + `event_id`](./033-event-idempotency-spool.md)
- [ADR-034: Event schema versioning](./034-event-schema-versioning.md)
- [ADR-035: Spool replay through pipeline](./035-spool-through-pipeline.md)
- [ADR-036: Server-assigned `created_by`](./036-server-assigned-created-by.md)
- [ADR-037: Bun SSE idle timeout override](./037-bun-sse-idle-timeout.md)
- [ADR-038: Workflow testing](./038-workflow-testing.md)
- [ADR-039: Fail-closed redaction](./039-fail-closed-redaction.md)
- [ADR-040: Daily extraction limit](./040-daily-extraction-limit.md)
- [ADR-041: Zod-first events](./041-zod-first-all-events.md)
- [ADR-042: Graceful degradation without API key](./042-graceful-no-api-key.md)
- [ADR-043: FTS5 delete triggers](./043-fts5-delete-triggers.md)
- [ADR-044: Fact schema versioning](./044-fact-schema-versioning.md)
- [ADR-045: Component-level health check](./045-component-health-check.md)
- [ADR-046: Disk space protection](./046-disk-space-protection.md)
- [ADR-047: `event_id` as correlation ID](./047-event-id-trace-correlation.md)
- [ADR-048: Silent-on-success hooks](./048-silent-hooks.md)
- [ADR-049: AGENTS.md length discipline](./049-agents-md-length.md)
- [ADR-050: Bounded retrieval planning](./050-bounded-retrieval-planning.md)

## Template

```markdown
# ADR-NNN: Title

## Status
Accepted | Superseded by ADR-XXX | Deprecated

## Context
What problem are we solving?

## Decision
What did we choose?

## Consequences
What becomes easier and harder?

## Ground Truth
What production systems, prior art, or empirical findings informed the decision?
```

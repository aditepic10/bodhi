# @bodhi/daemon - Agent Context

## Architecture
`daemon.ts` is the orchestrator and should stay thin.
Hot path: bus event -> pipeline -> store write -> `event:stored`.
Cold path: `event:stored` -> intel queue -> fact extraction -> fact insert.

## Dependency Rule
Arrows point down only:
`@bodhi/types` -> bus/store/config -> capture/intel/query -> api -> daemon.
`daemon.ts` is the only file that wires everything together.

## Key Files
- `src/daemon.ts`: orchestration only
- `src/lifecycle.ts`: dirs, DB, PRAGMAs, spool drain, socket and PID handling
- `src/bus.ts`: typed event bus with exact string matching
- `src/config.ts`: config load and validation
- `src/logger.ts`: structured JSON logging to stderr with `event_id`

## Extension Points
- New capture source: implement `CaptureSource`, declare `eventTypes`, register in `daemon.ts`
- New transform: export a pure transform and add it to the pipeline chain
- New tool: use `defineTool()` and register it in `tools/registry.ts`
- New API route: add under `api/routes/` and register in `api/server.ts`
- New event type: add the Zod schema in `@bodhi/types/src/events.ts`

## Persistence
- All DB access stays in `src/store/`
- Drizzle schema files use `*.sql.ts`
- Raw SQL is limited to FTS5 setup and related triggers
- Write transactions use `BEGIN IMMEDIATE`

## Streaming
- Agent responses stream over SSE from day one
- Global daemon events broadcast on `GET /stream`
- Bun server must disable idle timeout for SSE endpoints

## Testing
- Use real SQLite `:memory:` and real pipeline/bus implementations
- Mock only external LLM calls
- Prefer workflow tests over method tests
- Use `src/test-utils.ts` for shared setup once it exists

## Debugging
- Grep logs by `event_id` to trace ingest -> pipeline -> store -> intel
- Inspect DB state with `scripts/inspect-db.sh`
- Use `scripts/smoke.sh` for an end-to-end check when the daemon runs

## Never Do
- Put business logic in `daemon.ts`
- Put I/O in pipeline transforms
- Accept `created_by` from request bodies
- Emit from the store back onto the bus

# Capture Sources - Agent Context

## Pattern
Every capture source implements `CaptureSource`:
- `name`
- `eventTypes`
- `start()`
- `stop()`

## Adding A Source
1. Create `src/capture/<name>.ts`.
2. Implement `CaptureSource`.
3. Declare every emitted event type in `eventTypes`.
4. Add matching Zod schemas in `@bodhi/types/src/events.ts`.
5. Register the source in `src/daemon.ts`.

## Shell Capture
- Shell hooks POST to `/events`
- Default transport is `curl --unix-socket`
- Shell hooks own idempotency via `event_id`
- Failures spool to per-PID files for replay

## Rules
- Keep capture code close to the source boundary
- Emit typed events and let the pipeline handle validation and redaction
- Do not reach into store/query modules directly from a capture source

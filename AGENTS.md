# Bodhi - AI Agent Onboarding

## 1. Project Overview
Bodhi is a personal memory daemon for engineers.
Architecture: Hono daemon on a Unix domain socket plus thin clients.
Monorepo: Bun workspaces with `@bodhi/types` and `@bodhi/daemon`.

## 2. Tech Stack
- Runtime: Bun 1.3.10
- Language: TypeScript 5.9.3 via `@tsconfig/bun` 1.0.10
- HTTP: Hono 4.12.7
- AI: `ai` 6.0.116 with `@ai-sdk/anthropic` 3.0.58 and `@ai-sdk/openai` 3.0.41
- Database: SQLite via `bun:sqlite` with Drizzle ORM 0.45.1 and drizzle-kit 0.31.9
- Validation: Zod 4.3.6
- Linting: Biome 2.4.7
- Secret detection: secretlint 11.3.1

## 3. Essential Commands
- `bun install`
- `bun run typecheck`
- `bun run lint`
- `bun test`
- `bun test --bail`
- `bun run dev`
- `scripts/doctor.sh`
- `scripts/validate.sh`
- `scripts/smoke.sh`
- `scripts/inspect-db.sh`
- `scripts/inspect-db.sh "SELECT * FROM events LIMIT 5"`

## 3.5. Iteration Workflow
1. Edit code.
2. Let Claude hooks run and stay silent unless something failed.
3. Fix hook failures before moving on.
4. Run `scripts/validate.sh` before any commit.
5. If the daemon is running, run `scripts/smoke.sh`.
6. Trace a single event with `grep <event_id>` in daemon logs.
7. Inspect DB state with `scripts/inspect-db.sh "YOUR SQL"`.
8. Run `scripts/doctor.sh` if the environment looks wrong.

## 4. Code Conventions
- `const` over `let`. Never `var`.
- Named exports only. No default exports.
- `kebab-case.ts` files. Split files around 150 lines.
- Zod-first for validated data. Infer types from schemas.
- Expected errors use result-style unions, not broad `try/catch`.
- All DB access goes through `store/`.
- IDs use `nanoid()`. Shell hooks use `uuidgen` for `event_id`.
- Cross-package imports use `@bodhi/types`.
- Timestamps are Unix seconds, never milliseconds.
- Write transactions use `BEGIN IMMEDIATE`.

## 5. Testing
We test workflows, not methods.
- Framework: `bun test` with colocated `*.test.ts`.
- Use real SQLite `:memory:`. Do not mock DB, pipeline, or bus.
- Mock only external LLM calls.
- Test names describe user-visible workflows.
- Shared test utilities live in `packages/daemon/src/test-utils.ts`.

## 6. Architecture Boundaries
### Always do
- Add or update Zod schemas when event shapes change.
- Add workflow tests with new behavior.
- Keep pipeline transforms pure and fail-closed on security paths.
- Use the Store interface for persistence.

### Ask first
- Database schema changes or new migrations.
- Discriminated-union event type changes.
- New dependencies.
- Shell hook changes.

### Never do
- Import upward across the dependency graph.
- Put I/O in pipeline transforms.
- Mock the database, pipeline, or bus.
- Accept `created_by` from request bodies.
- Pass events through after redaction errors.
- Commit `.env` files or secrets.

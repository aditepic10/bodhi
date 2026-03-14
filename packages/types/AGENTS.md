# @bodhi/types - Agent Context

## Purpose
`@bodhi/types` is the shared contract package for the daemon and future clients.
It is a JIT internal package: exports point directly at `src/*.ts`, so there is no build step.

## Rules
- Use named exports only.
- Keep this package free of runtime side effects.
- Prefer schemas first, then infer types from them.
- Shared interfaces belong here only when multiple packages need them.

## Event Types
1. Add a Zod schema in `src/events.ts`.
2. Add the schema to the discriminated union.
3. Export the inferred type if it is used elsewhere.
4. Update any config or store contracts that depend on the new event.

## Config And Store Contracts
- Runtime-validated config schemas live in `src/config.ts`.
- Store, bus, and plugin contracts stay minimal and stable.
- Changes here ripple across the repo, so keep them deliberate.

## Never Do
- Put daemon implementation details here.
- Add Bun-only APIs unless every consumer can support them.
- Duplicate shapes that should be inferred from Zod schemas.

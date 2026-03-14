# Bodhi Use-Case Catalog

This directory contains the full product use-case catalog imported from the architecture planning work.

## Files

- `full-catalog.md`: all 77 use cases, including the original stress-test notes and implementation implications

## Why This Exists

The root [USE_CASES.md](../../USE_CASES.md) file stays intentionally short so contributors can quickly understand:

- what Bodhi already supports
- what kinds of extensions should feel natural
- where the architecture is stressed today

The full catalog here is the planning input for roadmap decisions. It is the place to answer questions like:

- which use cases are blocked on richer capture versus better retrieval
- which features need analytics or scheduling rather than more prompt engineering
- which integrations are clean extensions versus architectural rewrites
- which security and privacy constraints become mandatory as capture breadth grows

## How To Use This Directory

When planning a new feature:

1. Find the closest matching use case in `full-catalog.md`.
2. Identify whether it is blocked by capture, retrieval, analytics, scheduling, or external integration.
3. Check whether the current roadmap already accounts for that dependency.
4. If the dependency is cross-cutting, write or update an ADR before implementation.

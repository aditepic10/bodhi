# ADR-020: Self-Initializing Daemon

## Status
Accepted

## Context
Requiring manual filesystem and database bootstrapping would make the daemon brittle to install.

## Decision
Have the daemon bootstrap directories, token file, socket hygiene, PRAGMAs, schema, and spool recovery itself.

## Consequences
Startup is idempotent and operationally simpler. Lifecycle code becomes a critical reliability surface.

## Ground Truth
Operationally simple local daemons, Bodhi lifecycle design.

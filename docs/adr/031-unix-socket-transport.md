# ADR-031: Unix Domain Socket as Default Transport

## Status
Accepted

## Context
Bodhi is primarily a local daemon and should default to OS-level local auth.

## Decision
Use a Unix domain socket by default, with TCP as a fallback mode.

## Consequences
The default security posture is stronger and simpler. Cross-platform and dev tooling still need TCP support in some cases.

## Ground Truth
Local-daemon design, PostgreSQL-style local transport thinking.

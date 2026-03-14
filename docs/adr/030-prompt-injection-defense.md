# ADR-030: Defense-in-Depth for Prompt Injection

## Status
Accepted

## Context
Captured shell commands, notes, and facts are untrusted input that may contain instructions to the model.

## Decision
Combine datamarking, output validation, and restricted tools instead of trusting prompt wording alone.

## Consequences
The blast radius of prompt injection is reduced, but not eliminated. More defensive plumbing is required around agent and intel flows.

## Ground Truth
Prompt-injection research, least-privilege tool design.

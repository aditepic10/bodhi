# ADR-025: secretlint for Redaction

## Status
Accepted

## Context
Hand-rolled secret detection misses too many formats and becomes an endless maintenance tax.

## Decision
Use `secretlint` plus domain-specific argument redaction instead of regex-only scanning.

## Consequences
Known secret coverage improves significantly. The redaction layer depends on upstream rule quality and compatibility.

## Ground Truth
secretlint, industry experience with secret scanners vs custom regex.

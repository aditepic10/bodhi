#!/bin/bash
# Run all checks: types → lint → tests. Exit on first failure.
set -e

if ! command -v bun >/dev/null 2>&1; then
  export PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH"
fi

echo "=== Validating ==="
echo "→ Type checking..."
bun run typecheck
echo "→ Linting..."
bun run lint
echo "→ Tests..."
bun test
echo "=== All checks passed ==="

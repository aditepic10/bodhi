#!/bin/bash
set -euo pipefail

INPUT="${CLAUDE_TOOL_INPUT:-${CLAUDE_COMMAND:-}}"

case "$INPUT" in
  *".env"*|*"sk-ant-"*|*"ghp_"*|*"xoxb-"*)
    echo "Refusing command that appears to touch env files or inline secrets." >&2
    exit 2
    ;;
esac

exit 0

#!/bin/bash
# Stop hook: require formatting, lint, typecheck, and tests before Codex stops.
# Exit 2 → prevents Codex from stopping until quality checks are clean.

set -u

INPUT=$(cat)

STOP_HOOK_ACTIVE=$(python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    print(str(data.get('stop_hook_active', False)).lower())
except Exception:
    print('false')
" <<< "$INPUT" 2>/dev/null)

[[ "$STOP_HOOK_ACTIVE" == "true" ]] && exit 0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

FORMAT_OUTPUT=$(cd "$PROJECT_ROOT" && pnpm exec prettier --check . 2>&1)
FORMAT_EXIT=$?

LINT_OUTPUT=$(cd "$PROJECT_ROOT" && pnpm lint 2>&1)
LINT_EXIT=$?

TYPECHECK_OUTPUT=$(cd "$PROJECT_ROOT" && pnpm typecheck 2>&1)
TYPECHECK_EXIT=$?

TEST_OUTPUT=$(cd "$PROJECT_ROOT" && pnpm test 2>&1)
TEST_EXIT=$?

if [[ $FORMAT_EXIT -ne 0 || $LINT_EXIT -ne 0 || $TYPECHECK_EXIT -ne 0 || $TEST_EXIT -ne 0 ]]; then
    echo "Quality checks failed — fix all formatting, lint, typecheck, and test issues before stopping." >&2
    echo "" >&2

    if [[ $FORMAT_EXIT -ne 0 ]]; then
        echo "=== prettier --check . ===" >&2
        echo "$FORMAT_OUTPUT" >&2
        echo "" >&2
    fi

    if [[ $LINT_EXIT -ne 0 ]]; then
        echo "=== pnpm lint ===" >&2
        echo "$LINT_OUTPUT" >&2
        echo "" >&2
    fi

    if [[ $TYPECHECK_EXIT -ne 0 ]]; then
        echo "=== pnpm typecheck ===" >&2
        echo "$TYPECHECK_OUTPUT" >&2
        echo "" >&2
    fi

    if [[ $TEST_EXIT -ne 0 ]]; then
        echo "=== pnpm test ===" >&2
        echo "$TEST_OUTPUT" >&2
    fi

    exit 2
fi

exit 0

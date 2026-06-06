#!/bin/bash
# PostToolUse hook: keep edited files formatted and lint-clean after Codex edits.
# Exit 2 → stderr is shown to Codex as a system message, forcing a fix-up pass.

set -u

INPUT=$(cat)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

FILE_PATH=$(python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    print(data.get('tool_input', {}).get('file_path', ''))
except Exception:
    print('')
" <<< "$INPUT" 2>/dev/null)

[[ -z "$FILE_PATH" ]] && exit 0

if [[ "$FILE_PATH" = /* ]]; then
    TARGET_PATH="$FILE_PATH"
else
    TARGET_PATH="$PROJECT_ROOT/$FILE_PATH"
fi

[[ -f "$TARGET_PATH" ]] || exit 0

case "$TARGET_PATH" in
    *"/node_modules/"*|*"/out/"*|*"/dist/"*)
        exit 0
        ;;
esac

PRETTIER_OUTPUT=$(cd "$PROJECT_ROOT" && pnpm exec prettier --ignore-unknown --write "$TARGET_PATH" 2>&1)
PRETTIER_EXIT=$?
if [[ $PRETTIER_EXIT -ne 0 ]]; then
    echo "Prettier failed on $(basename "$TARGET_PATH"):" >&2
    echo "$PRETTIER_OUTPUT" >&2
    echo "" >&2
    echo "Fix the formatting or syntax errors above before continuing." >&2
    exit 2
fi

case "$TARGET_PATH" in
    *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs)
        ESLINT_FIX_OUTPUT=$(cd "$PROJECT_ROOT" && pnpm exec eslint --fix "$TARGET_PATH" 2>&1)
        ESLINT_FIX_EXIT=$?
        if [[ $ESLINT_FIX_EXIT -ne 0 ]]; then
            echo "ESLint --fix failed on $(basename "$TARGET_PATH"):" >&2
            echo "$ESLINT_FIX_OUTPUT" >&2
            echo "" >&2
            echo "Fix the lint errors above before continuing." >&2
            exit 2
        fi

        ESLINT_CHECK_OUTPUT=$(cd "$PROJECT_ROOT" && pnpm exec eslint "$TARGET_PATH" 2>&1)
        ESLINT_CHECK_EXIT=$?
        if [[ $ESLINT_CHECK_EXIT -ne 0 ]]; then
            echo "ESLint failed on $(basename "$TARGET_PATH"):" >&2
            echo "$ESLINT_CHECK_OUTPUT" >&2
            echo "" >&2
            echo "Fix the lint errors above before continuing." >&2
            exit 2
        fi
        ;;
esac

exit 0

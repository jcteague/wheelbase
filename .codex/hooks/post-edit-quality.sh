#!/bin/bash
# PostToolUse hook: lint/format files after Claude edits them.
# Exit 2 → stderr is shown to Claude as a system message, forcing it to fix errors.

INPUT=$(cat)
FILE_PATH=$(python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('file_path', ''))
except Exception:
    print('')
" <<< "$INPUT" 2>/dev/null)

[[ -z "$FILE_PATH" ]] && exit 0

# ── Python files → ruff check + format ────────────────────────────────────────
if [[ "$FILE_PATH" == *.py ]]; then
    cd backend || exit 0

    OUTPUT=$(uv run ruff check --fix "$FILE_PATH" 2>&1)
    EXIT=$?
    if [[ $EXIT -ne 0 ]]; then
        echo "ruff check failed on $(basename "$FILE_PATH"):" >&2
        echo "$OUTPUT" >&2
        echo "" >&2
        echo "Fix the lint errors above before continuing." >&2
        exit 2
    fi

    uv run ruff format "$FILE_PATH" >/dev/null 2>&1

# ── TypeScript / TSX files → ESLint + prettier ────────────────────────────────
elif [[ "$FILE_PATH" == *.ts || "$FILE_PATH" == *.tsx ]]; then
    cd frontend || exit 0

    OUTPUT=$(pnpm exec eslint "$FILE_PATH" 2>&1)
    EXIT=$?
    if [[ $EXIT -ne 0 ]]; then
        echo "ESLint failed on $(basename "$FILE_PATH"):" >&2
        echo "$OUTPUT" >&2
        echo "" >&2
        echo "Fix the lint errors above before continuing." >&2
        exit 2
    fi

    pnpm exec prettier --write "$FILE_PATH" >/dev/null 2>&1
fi

exit 0

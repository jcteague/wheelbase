#!/bin/bash
# Stop hook: run full lint + typecheck before Claude is allowed to stop.
# Exit 2 → prevents Claude from stopping, forces it to fix the errors.

INPUT=$(cat)

# Guard against infinite loops (Claude already tried once this stop cycle)
STOP_HOOK_ACTIVE=$(python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    print(str(d.get('stop_hook_active', False)).lower())
except Exception:
    print('false')
" <<< "$INPUT" 2>/dev/null)

[[ "$STOP_HOOK_ACTIVE" == "true" ]] && exit 0

# ── Run quality checks ─────────────────────────────────────────────────────────
FAILED=0

LINT_OUTPUT=$(make lint 2>&1)
LINT_EXIT=$?

TYPECHECK_OUTPUT=$(make typecheck 2>&1)
TYPECHECK_EXIT=$?

# ── Report failures ────────────────────────────────────────────────────────────
if [[ $LINT_EXIT -ne 0 || $TYPECHECK_EXIT -ne 0 ]]; then
    echo "Quality checks failed — fix all errors before stopping." >&2
    echo "" >&2

    if [[ $LINT_EXIT -ne 0 ]]; then
        echo "=== make lint ===" >&2
        echo "$LINT_OUTPUT" >&2
        echo "" >&2
    fi

    if [[ $TYPECHECK_EXIT -ne 0 ]]; then
        echo "=== make typecheck ===" >&2
        echo "$TYPECHECK_OUTPUT" >&2
    fi

    exit 2
fi

exit 0

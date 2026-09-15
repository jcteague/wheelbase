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

# ── Resolve project root ───────────────────────────────────────────────────────
# The invoking directory, not the hook's own location. This file lives in the main
# checkout, but a session may be running in a worktree under .claude/worktrees/, and
# `$SCRIPT_DIR/../..` would then check that other tree instead of the one that changed.
# `--show-toplevel` resolves to the worktree the session is actually in.
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [[ -z "$PROJECT_ROOT" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
fi

# ── Resolve pnpm ───────────────────────────────────────────────────────────────
# This hook runs in a non-interactive shell that never sources ~/.zshrc, so pnpm is
# usually absent from PATH even when it works fine in the terminal. Look where it
# actually lives before giving up.
PNPM=""
for candidate in \
    "$(command -v pnpm 2>/dev/null)" \
    "${PNPM_HOME:-$HOME/Library/pnpm}/bin/pnpm" \
    "$HOME/Library/pnpm/pnpm"; do
    if [[ -n "$candidate" && -x "$candidate" ]]; then PNPM="$candidate"; break; fi
done
if [[ -z "$PNPM" ]] && command -v corepack >/dev/null 2>&1; then
    PNPM="corepack pnpm"
fi

# A missing package manager is a broken environment, not a code defect. Blocking the
# stop here would trap the session in a loop it cannot escape by editing source — which
# is exactly what "pnpm: command not found" reported as a lint failure used to do.
if [[ -z "$PNPM" ]]; then
    echo "pre-stop-quality: cannot find pnpm — lint/typecheck were NOT run." >&2
    echo "Install pnpm or export PNPM_HOME to re-enable these checks." >&2
    exit 0
fi

# Hooks run with a minimal PATH; make sure pnpm (installed under ~/Library/pnpm) is reachable.
command -v pnpm >/dev/null 2>&1 || export PATH="$HOME/Library/pnpm/bin:$HOME/Library/pnpm:$PATH"

# ── Run quality checks ─────────────────────────────────────────────────────────
cd "$PROJECT_ROOT" && $PNPM format >/dev/null 2>&1

LINT_OUTPUT=$(cd "$PROJECT_ROOT" && $PNPM lint 2>&1)
LINT_EXIT=$?

TYPECHECK_OUTPUT=$(cd "$PROJECT_ROOT" && $PNPM typecheck 2>&1)
TYPECHECK_EXIT=$?

# ── Report failures ────────────────────────────────────────────────────────────
if [[ $LINT_EXIT -ne 0 || $TYPECHECK_EXIT -ne 0 ]]; then
    echo "Quality checks failed — fix all errors before stopping." >&2
    echo "" >&2

    if [[ $LINT_EXIT -ne 0 ]]; then
        echo "=== pnpm lint ===" >&2
        echo "$LINT_OUTPUT" >&2
        echo "" >&2
    fi

    if [[ $TYPECHECK_EXIT -ne 0 ]]; then
        echo "=== pnpm typecheck ===" >&2
        echo "$TYPECHECK_OUTPUT" >&2
    fi

    exit 2
fi

exit 0

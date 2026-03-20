#!/usr/bin/env bash
# new-worktree.sh — create a git worktree and configure beads to use the main repo's database
#
# Usage: scripts/new-worktree.sh <branch-name> [worktree-dir]
#
# Examples:
#   scripts/new-worktree.sh us-8-close-covered-call
#   scripts/new-worktree.sh us-8-close-covered-call ../wheelbase-us8

set -euo pipefail

BRANCH="${1:-}"
if [[ -z "$BRANCH" ]]; then
  echo "Usage: $0 <branch-name> [worktree-dir]" >&2
  exit 1
fi

# Default worktree directory: sibling of the main repo named after the branch
MAIN_REPO="$(git worktree list --porcelain | awk '/^worktree/{print $2; exit}')"
REPO_PARENT="$(dirname "$MAIN_REPO")"
WORKTREE_DIR="${2:-${REPO_PARENT}/${BRANCH}}"

echo "Creating worktree: $WORKTREE_DIR (branch: $BRANCH)"
git worktree add "$WORKTREE_DIR" -b "$BRANCH"

echo "Configuring beads data-dir → $MAIN_REPO/.beads/dolt"
(cd "$WORKTREE_DIR" && bd dolt set data-dir "$MAIN_REPO/.beads/dolt")

echo ""
echo "Ready. To start working:"
echo "  cd $WORKTREE_DIR"

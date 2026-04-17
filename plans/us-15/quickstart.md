# Quickstart: US-15 — Roll Pair Display in Leg Timeline

## Prerequisites

- Node/pnpm installed
- `better-sqlite3` rebuilt for both Electron and system Node (see CLAUDE.md)

## Run Unit Tests

```bash
pnpm test
```

Tests relevant to this story live in:

- `src/main/services/get-position.test.ts` — backend: `rollChainId` exposed in legs
- `src/renderer/src/lib/rollGroups.test.ts` — pure grouping/timeline logic (new file)
- `src/renderer/src/components/LegHistoryTable.test.tsx` — roll group rendering

## Run E2E Tests

```bash
pnpm test:e2e
```

> Must run from a GUI terminal (iTerm/Terminal.app), not from Claude Code's shell.

Relevant file: `e2e/us15-roll-pair-timeline.spec.ts`

## Manual Verification

1. `pnpm dev`
2. Create a position (AAPL, strike $180, 1 contract, premium $3.50)
3. Open the position detail
4. Click "Roll CSP" → fill cost to close $1.20, new premium $2.80, new expiration (future date), same strike → submit
5. Navigate to position detail

**Expected:**

- Leg timeline shows: `CSP Open` normal row → Roll group with header "Roll #1 — Roll Out" (green) → `ROLL_FROM` indented row → `ROLL_TO` indented row with basis $174.90 → Cumulative summary row

6. Roll again (cost $0.90, new premium $1.50, new expiration further out)

**Expected:**

- Roll #1 and Roll #2 groups shown in order
- Cumulative summary shows combined credits

## Expected Test Commands and Pass Criteria

```bash
pnpm test                    # all tests pass (0 failures)
pnpm typecheck               # no TypeScript errors
pnpm lint                    # no lint errors
```

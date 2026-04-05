# Quickstart: US-11 — Wheel Leg Chain Display

## Prerequisites

All of US-6 through US-10 must be complete — the full lifecycle (CSP open, assign, CC open/close/expire/called-away) must exist so all leg types can be exercised in tests.

No new migrations are required. This story makes no schema changes to the SQLite database.

## Running Unit and Integration Tests

```bash
# From the repo root
pnpm test
```

All Vitest tests (unit + integration) must pass. The tests introduced by this story live in:

- `src/main/services/get-position.test.ts` — new cases for `allSnapshots` field
- `src/renderer/src/lib/deriveRunningBasis.test.ts` — unit tests for the matching algorithm
- `src/renderer/src/components/LegHistoryTable.test.tsx` — updated tests for new columns and special cells
- `src/renderer/src/pages/PositionDetailPage.test.tsx` — integration test for running basis and final P&L footer

## Running E2E Tests

> **Important:** E2E tests require a GUI terminal (iTerm / Terminal.app). Do not run from the Claude Code embedded shell.

```bash
# Build the app first
pnpm build

# Then run e2e
pnpm test:e2e
```

The E2E spec for this story is `e2e/leg-chain-display.spec.ts`.

## Expected Passing Criteria

After implementation:

```
✓ get-position returns allSnapshots array ordered by snapshot_at ASC
✓ deriveRunningBasis: CSP_OPEN leg gets initial basis
✓ deriveRunningBasis: ASSIGN leg carries forward prior basis
✓ deriveRunningBasis: CC_OPEN leg gets new basis from snapshot
✓ deriveRunningBasis: CC_CLOSE leg carries forward CC_OPEN basis (no snapshot)
✓ deriveRunningBasis: leg before any snapshot gets null
✓ LegHistoryTable renders 8 columns including Running Basis / Share
✓ LegHistoryTable: ASSIGN premium cell shows "— (assigned)" with shares annotation
✓ LegHistoryTable: CC_CLOSE premium shows "−$X.XX" in amber
✓ LegHistoryTable: CC_EXPIRED premium shows "expired worthless" in muted style
✓ LegHistoryTable: CALLED_AWAY premium shows "— (assigned)" with "shares called away"
✓ LegHistoryTable: finalPnl prop renders tfoot row
✓ LegHistoryTable: no tfoot when finalPnl is null/undefined
✓ PositionDetailPage: passes enriched legs and finalPnl to LegHistoryTable
```

## Seed Data for Manual Testing

To manually inspect the leg chain display, create a wheel position and advance it through multiple legs using the existing UI flows (US-6 through US-10). After each action (assign, open CC, close CC early or let expire), reload the position detail page and verify the leg history table.

# Quickstart: US-98

These commands are for implementation, not a claim that the planned feature/tests exist.

## Prerequisites

1. Validate proposed tiers with the trader before building.
2. Land US-96 and reconcile its snapshot/Signal symbols with plan.md. Retain every US-98 AC.
3. Recheck the next migration number (currently 014).
4. Use native `Intl.DateTimeFormat` with an explicit `America/New_York` timezone; no timezone dependency is required.
5. Verify/update checked-in 2025–2028 NYSE calendar data from research.md sources.

## TDD checks

Run each area's new tests Red before code, then Green and Refactor. Targeted examples:

```bash
pnpm test -- src/main/core/trading-calendar.test.ts src/main/core/ivr-freshness.test.ts
pnpm test -- src/main/services/ivr-collector.test.ts
pnpm test -- src/main/integrations/finnhub-earnings.test.ts src/main/integrations/fake-earnings.test.ts src/main/services/earnings-dates.test.ts
pnpm test -- src/main/services/ivr-snapshots.test.ts src/main/services/screener.test.ts src/main/services/screener.integration.test.ts
pnpm test -- src/main/ipc/screener.test.ts src/renderer/src/api/screener.test.ts
pnpm test -- src/renderer/src/components/IvrCell.test.tsx src/renderer/src/components/ScreenerResultsTable.test.tsx src/renderer/src/pages/WatchlistPage.test.tsx
```

Also run US-96's actual core/service tests identified at the prerequisite gate. Repeat calendar cases under at least UTC and America/Los_Angeles host TZ to prove New York semantics.

## Required ordered checks

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm format
```

Review formatting diff and INFO/DEBUG boundary logs; core remains free of I/O. Current package scripts automatically rebuild better-sqlite3 for Node before pnpm test, and Electron before pnpm test:e2e. If running Vitest directly, perform the appropriate rebuild manually.

## Electron E2E

```bash
pnpm test:e2e -- e2e/ivr-staleness.spec.ts
pnpm test:e2e -- e2e/screener-results.spec.ts e2e/screening-criteria.spec.ts e2e/screener-earnings.spec.ts e2e/ivr-collector.spec.ts e2e/ivr-watchlist-collection.spec.ts
pnpm test:e2e
```

The package test:e2e script builds the app and invokes vitest.e2e.config.ts. The full run also protects US-68 promotion and US-96 watchlist flows touched by shared fixture/types.

All fixtures are offline and use temporary databases. Use the existing fake providers and real collector/IPC. Seed holiday scenarios on a preceding open day, advance the shared test clock, then view/refetch. Derive expirations and earnings from that same clock so fixed test dates cannot fall outside the intended DTE window.

Passing criteria: 13 named US-98 E2E cases, no skip/todo, plus passing unit/integration, regression E2E, lint and typecheck. A pure helper test cannot stand in for either watchlist AC.

## Documentation on implementation completion

Run /update-spec us-98 after the feature is implemented and verified, and mark the calendar follow-up resolved with the chosen offline architecture. Refresh the shared mockup annotations for age states. This planning-only task does not publish unimplemented behavior as current spec.

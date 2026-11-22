# Quickstart: US-115 — Sell a subsequent short call against an open LEAPS

## Setup

No migration, seed data or environment change. Work on a `wb-115` worktree off `main`, after
US-101, US-102, US-103, US-104 and US-109 (all on `main`). US-119 is not needed to build or test
this story: every test seeds the LEAPS-only state directly (see `plan.md` § Prerequisites).

`better-sqlite3` is built for one Node ABI at a time, and pnpm does not run the `pre*` scripts:

```bash
pnpm rebuild:node       # before pnpm test (Vitest)
pnpm rebuild:electron   # before pnpm test:e2e / pnpm dev
```

## Unit and integration tests

```bash
pnpm rebuild:node
pnpm test src/main/core/pmcc-rules.test.ts src/main/core/pmcc-rules.property.test.ts
pnpm test src/main/core/lifecycle.test.ts src/main/core/lifecycle.property.test.ts
pnpm test src/main/core/costbasis.test.ts src/main/core/costbasis.property.test.ts
pnpm test src/main/services/pmcc-ledger.test.ts src/main/services/sell-pmcc-short-position.test.ts
pnpm test src/main/ipc/positions-sell-pmcc-short.test.ts
pnpm test src/renderer/src/lib/pmcc-entry.test.ts src/renderer/src/lib/pmcc-sell-short.test.ts
pnpm test src/renderer/src/lib/pmcc-roll.test.ts src/renderer/src/lib/pmcc-coverage.test.ts
pnpm test src/renderer/src/schemas/sell-pmcc-short.test.ts
pnpm test src/renderer/src/components/PmccLegSection.test.tsx src/renderer/src/components/PmccEntryForm.test.tsx
pnpm test src/renderer/src/components/SellPmccShort src/renderer/src/components/PositionDetailActions.test.tsx
pnpm test               # everything; all must pass
```

Service tests use `makeTestDb()` (`src/main/test-utils.ts`) and build the Background with
`seedPmccPosition(db, payload, now)` (`src/main/services/test-pmcc-seed.ts`), passing
`{ today: '2027-07-23' }` so the story's literal dates hold.

## Mutation testing (core engine)

```bash
pnpm test:mutation --mutate src/main/core/pmcc-rules.ts
pnpm test:mutation --mutate src/main/core/lifecycle.ts
pnpm test:mutation --mutate src/main/core/costbasis.ts
```

Report: `reports/mutation/index.html`. Look only at mutants inside the code this story adds or
moves (`pmccSubsequentShortIssues`, the extracted constants, `sellPmccShort`,
`projectPmccLedger`, `ledgerFromTotals`). Kill survivors with a test, or record an equivalent
mutant with its reason. A survivor must reproduce before acting on it.

## E2E tests

```bash
pnpm rebuild:electron
pnpm test:e2e e2e/pmcc-sell-short.spec.ts
```

The spec launches without `WHEELBASE_FAKE_NOW` and seeds US-109's XYZ Background (cycle 9
removed) through `_test:pmcc-seed-position`, with every date shifted so that 2027-07-23 lands on
today in America/New_York (`research.md` ADR "E2e runs on the real clock"). Chains come from
`WHEELBASE_MOCK_OPTION_SNAPSHOTS`; the chain-unavailable test relaunches with
`FAKE_MARKET_DATA_ERROR=unknown`; the failed-save test adds a `BEFORE INSERT ON
cost_basis_snapshots` trigger with `sqlite3`.

Regression specs that must still pass: `open-pmcc-position`, `pmcc-cost-basis`,
`pmcc-short-call-roll`, `pmcc-leaps-roll`, `pmcc-leg-timeline`, `pmcc-position-card`,
`open-covered-call`.

## Seeing it in the app

```bash
pnpm rebuild:electron
pnpm dev
```

There is no production path to a LEAPS-only PMCC until US-119 lands. To see the sheet, seed one
from the DevTools console of a dev build run with `NODE_ENV=test`
(`window.api.testPmccSeedPosition({ ticker: 'XYZ', legs: [...] })`, legs as in
`e2e/pmcc-sell-short-helpers.ts`), open it from the positions list, and press `Sell Short Call →`.
Compare with `pnpm mockups` → `epic-09-pmcc-position-detail`, preset `sell-short` (the sheet)
and `healthy` (the result).

## Passing criteria

1. `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm format` all clean.
2. All 20 e2e tests in `e2e/pmcc-sell-short.spec.ts` pass — one per scenario, one per outline
   row (12 scenarios; the two outlines expand to 4 and 6 rows).
3. No surviving, reproducible, non-equivalent mutant in the code listed under Mutation testing.
4. The regression specs above still pass; US-101's entry sheet behaves exactly as before.
5. `/update-spec us-115` run before the plan directory is removed.

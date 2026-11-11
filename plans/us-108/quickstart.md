# US-108 — Quickstart

Worktree: `/Users/johnteague/my-stuff/wb-108` (branch `wb-108` off `main` db7715a).

## Setup

No migration, no seed data, no new dependency, no environment variable. The e2e suite needs the
fake providers only (`FAKE_MARKET_DATA`, `FAKE_BROKER`, `WHEELBASE_MOCK_EARNINGS`), all set by the
existing helpers.

## Unit + integration (Vitest)

```bash
pnpm rebuild:node          # once, when switching from an e2e run
pnpm test -- src/main/core/pmcc-card src/main/core/costbasis src/main/core/position-order
pnpm test -- src/main/services/list-positions src/main/services/earnings-dates src/main/services/pmcc-opening-legs
pnpm test -- src/shared/option-spread
pnpm test -- src/renderer/src/lib/pmcc-card-display src/renderer/src/lib/card-actions src/renderer/src/lib/position-list-items
pnpm test -- src/renderer/src/components/position-card src/renderer/src/components/PositionsGrid src/renderer/src/pages/PositionsListPage
pnpm test                  # the whole suite must pass before a task is done
```

Property tests: `src/main/core/pmcc-card.property.test.ts` and the new `computePmccUnrealizedPnl`
properties in `src/main/core/costbasis.property.test.ts` run with the above. Stress a new property
once with `fc.configureGlobal({ numRuns: 500, seed })` across a few seeds before trusting it.

Mutation (core files changed by this story):

```bash
pnpm test:mutation --mutate src/main/core/pmcc-card.ts --mutate src/main/core/costbasis.ts --mutate src/main/core/position-order.ts
```

Survivors are listed in `reports/mutation/index.html`; kill each with a test, or record an
equivalent mutant with its reason.

## E2E (Playwright `_electron`)

```bash
pnpm rebuild:electron      # once, when switching from a Vitest run
LOG_LEVEL=debug pnpm test:e2e e2e/pmcc-position-card.spec.ts  # no `--`: vitest ignores filters after it
pnpm test:e2e e2e/position-cards.spec.ts   # US-18's S21 is rewritten by this story
pnpm test:e2e                                 # full run before the story is done
```

`LOG_LEVEL=debug` matters in a fresh worktree with no `.env` (the PMCC alert specs read DEBUG
lines). The symptom of the wrong better-sqlite3 ABI is a hang on `waiting for event 'window'`.

## Gates

1. `pnpm test` — green
2. `pnpm lint` — clean
3. `pnpm typecheck` — clean (the widened `CardAction` unions and the `PmccListSummary` reshape
   will surface every stale consumer here)
4. `pnpm format`
5. Every AC in the story has a named e2e case in `e2e/pmcc-position-card.spec.ts` (see
   `plan.md` § AC audit); the two-short scenarios are covered by core + renderer tests only and
   say so in the spec file header.
6. Changed files ≥ 95 % line coverage; no surviving non-equivalent mutant in the three core files.

## Manual check

```bash
pnpm dev
```

Open a PMCC (`+ New Wheel` → PMCC), set its short call's expiration inside 21 days, and confirm the
gold `◷ MANAGEMENT WINDOW` strip, the leg highlight and the gold card edge; click the card to open
tier 2; click the ticker to confirm it still navigates.

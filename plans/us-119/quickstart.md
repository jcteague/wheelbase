# Quickstart: US-119 — Retire the PMCC short call — record expiration or close early

## Setup

No migration, seed data or environment change. Work on a `wb-119` worktree off `main`.

`better-sqlite3` is built for one Node ABI at a time, and pnpm does not run the `pre*` scripts:

```bash
pnpm rebuild:node       # before pnpm test (Vitest)
pnpm rebuild:electron   # before pnpm test:e2e / pnpm dev
```

## Unit and integration tests

```bash
pnpm rebuild:node
pnpm test src/main/core/pmcc-cycle.test.ts src/main/core/pmcc-cycle.property.test.ts
pnpm test src/main/core/pmcc-timeline.test.ts src/main/core/pmcc-timeline.property.test.ts
pnpm test src/main/core/pmcc-rules.test.ts src/main/core/lifecycle.test.ts
pnpm test src/main/core/lifecycle.property.test.ts
pnpm test src/main/services/expire-pmcc-short-position.test.ts
pnpm test src/main/services/close-pmcc-short-early-position.test.ts
pnpm test src/main/services/market-data.test.ts
pnpm test src/main/ipc/positions.test.ts src/main/ipc/market-data.test.ts
pnpm test src/renderer/src/lib/pmcc-retire.test.ts src/renderer/src/lib/pmcc-coverage.test.ts
pnpm test src/renderer/src/schemas/close-pmcc-short.test.ts
pnpm test src/renderer/src/components/PmccExpirationSheet.test.tsx
pnpm test src/renderer/src/components/ClosePmccShortEarlySheet.test.tsx
pnpm test src/renderer/src/components/PositionDetailActions.test.tsx
pnpm test               # everything; all must pass
```

## Mutation testing (core engine)

```bash
pnpm test:mutation --mutate src/main/core/pmcc-cycle.ts
pnpm test:mutation --mutate src/main/core/pmcc-rules.ts
pnpm test:mutation --mutate src/main/core/lifecycle.ts
```

Report: `reports/mutation/index.html`. Kill survivors in the new code with a test, or record an
equivalent mutant with its reason. A survivor must reproduce before acting on it.

## E2E tests

```bash
pnpm rebuild:electron
pnpm test:e2e e2e/pmcc-retire-short-call.spec.ts
pnpm test:e2e e2e/pmcc-assignment-risk-alert.spec.ts   # US-106 S6 now uses Close Short Early
```

The spec seeds XYZ through `_test:pmcc-seed-position` with the `atCycle8Open` or
`atCycle5Open` variant of US-109's Background (`e2e/pmcc-timeline-helpers.ts`) and launches with
`WHEELBASE_FAKE_NOW`:

| Scenario group                  | `WHEELBASE_FAKE_NOW`   | Eastern date |
| ------------------------------- | ---------------------- | ------------ |
| Expiration (cycle 8)            | `2027-07-19T16:00:00Z` | 2027-07-19   |
| Header gating before expiration | `2027-07-15T16:00:00Z` | 2027-07-15   |
| Close early (cycle 5)           | `2027-04-02T16:00:00Z` | 2027-04-02   |

The at-or-above-strike advisory sets XYZ's 2027-07-16 close to `114.30` through
`_test:iv-series-set`; the sheet then reads `XYZ closed at $114.30 on 2027-07-16, at or above the
$112.00 strike — this call may have been assigned. Check with your broker; if it was, record an
assignment instead.`
The storage-failure test makes the temp DB read-only (`chmod 0o444`) before confirming and
restores it in `afterEach`.

## Seeing it in the app

```bash
pnpm rebuild:electron
pnpm dev
```

Open a PMCC from the positions list. With a short call open, the header shows `Close Short Early
→` beside `Roll Short Call →`; once the short's expiration date has passed it also shows `Record
Expiration →`. Confirming either leaves the header badge reading `LEAPS open · no short call`, the
leg timeline's cycle ending `Expired worthless` / `Closed early`, and `Sell Short Call →` in the
header. Compare with `pnpm mockups` → `epic-09-pmcc-position-detail`, presets `expire`,
`close-early` and `leaps-only`.

## Passing criteria

1. `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm format` all clean.
2. Every test in `e2e/pmcc-retire-short-call.spec.ts` passes, one per acceptance scenario or
   example row; the two that open US-115's sheet pass once US-115 is merged.
3. US-106's `pmcc-assignment-risk-alert.spec.ts` passes on the production close-early path.
4. No surviving, reproducible, non-equivalent mutant in the new code of `pmcc-cycle.ts`,
   `pmcc-rules.ts` and `lifecycle.ts`.
5. The existing PMCC and wheel e2e specs still pass (`pmcc-leg-timeline`, `pmcc-short-call-roll`,
   `pmcc-leaps-roll`, `pmcc-cost-basis`, and the wheel close-CC-early / CC-expiration specs).

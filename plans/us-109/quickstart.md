# Quickstart: US-109 — PMCC leg timeline

## Setup

No migration, seed data or environment change. Work on a `wb-109` worktree off `main`.

`better-sqlite3` is built for one Node ABI at a time, and pnpm does not run the `pre*` scripts:

```bash
pnpm rebuild:node       # before pnpm test (Vitest)
pnpm rebuild:electron   # before pnpm test:e2e / pnpm dev
```

## Unit and integration tests

```bash
pnpm rebuild:node
pnpm test src/main/core/pmcc-timeline.test.ts
pnpm test src/main/core/pmcc-timeline.property.test.ts
pnpm test src/main/services/pmcc-timeline.test.ts src/main/services/get-position.test.ts
pnpm test src/main/ipc/test-pmcc-seed.test.ts src/main/ipc/positions.test.ts
pnpm test src/renderer/src/lib/pmcc-timeline-display.test.ts
pnpm test src/renderer/src/components/position-cockpit
pnpm test               # everything; all must pass
```

## Mutation testing (core engine)

```bash
pnpm test:mutation --mutate src/main/core/pmcc-timeline.ts
```

Report: `reports/mutation/index.html`. Kill survivors with a test, or record an equivalent
mutant with its reason. A survivor must reproduce before acting on it.

## E2E tests

```bash
pnpm rebuild:electron
pnpm test:e2e e2e/pmcc-leg-timeline.spec.ts
```

The spec launches the app with `WHEELBASE_FAKE_NOW=2027-08-13T16:00:00Z` (noon Eastern) and
seeds positions through `_test:pmcc-seed-position`. Two scenarios relaunch at another date:
assignment (2027-08-24) and closed (2027-09-02).

## Seeing it in the app

```bash
pnpm rebuild:electron
pnpm dev
```

Open a PMCC from the positions list. Below `Cost basis` there is a `Timeline summary` drawer
(open) and a `Leg timeline` drawer (collapsed). A position created through the app shows one
cycle; roll its short call or LEAPS to see a roll row. Compare with `pnpm mockups` →
`epic-09-pmcc-position-detail`, preset `healthy`.

## Passing criteria

1. `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm format` all clean.
2. All 18 e2e tests in `e2e/pmcc-leg-timeline.spec.ts` pass, one per acceptance scenario.
3. No surviving, reproducible, non-equivalent mutant in `src/main/core/pmcc-timeline.ts`.
4. The existing PMCC and wheel e2e specs still pass (`pmcc-cost-basis`, `pmcc-short-call-roll`,
   `pmcc-leaps-roll`, and the wheel leg-history specs).

# Quickstart: US-120 — Close a PMCC by selling the LEAPS

## Setup

No migration, seed data or environment change. Work on a `wb-120` worktree off `main`.

`better-sqlite3` is built for one Node ABI at a time, and pnpm does not run the `pre*` scripts:

```bash
pnpm rebuild:node       # before pnpm test (Vitest)
pnpm rebuild:electron   # before pnpm test:e2e / pnpm dev
```

## Unit and integration tests

```bash
pnpm rebuild:node
pnpm test src/main/core/types.test.ts src/main/pmcc-phase.test.ts
pnpm test src/main/core/costbasis.test.ts src/main/core/costbasis.property.test.ts
pnpm test src/main/core/pmcc-rules.test.ts src/main/core/pmcc-rules.property.test.ts
pnpm test src/main/core/lifecycle.test.ts src/main/core/lifecycle.property.test.ts
pnpm test src/main/core/pmcc-timeline.test.ts src/main/core/pmcc-timeline.property.test.ts
pnpm test src/main/services/pmcc-ledger.test.ts src/main/services/pmcc-timeline.test.ts
pnpm test src/main/services/close-pmcc-position.test.ts
pnpm test src/main/ipc/positions.test.ts
pnpm test src/renderer/src/schemas/close-pmcc.test.ts src/renderer/src/lib/pmcc-close-view.test.ts
pnpm test src/renderer/src/hooks/useClosePmccPosition.test.ts
pnpm test src/renderer/src/components/ClosePmcc src/renderer/src/components/PositionDetailActions
pnpm test src/renderer/src/pages
pnpm test               # everything; all must pass
```

## Mutation testing (core engines)

```bash
pnpm test:mutation --mutate src/main/core/costbasis.ts,src/main/core/pmcc-rules.ts,src/main/core/lifecycle.ts
```

Report: `reports/mutation/index.html`. Only the new functions (`settlePmccClose`,
`pmccCloseFillDateFloor`, `pmccLeapsCloseIssues`, `closePmccLeaps`) need to be clean; kill a
survivor with a test or record it as equivalent with its reason. A survivor must reproduce
before acting on it.

## E2E tests

```bash
pnpm rebuild:electron
pnpm test:e2e e2e/pmcc-close-position.spec.ts
```

The spec launches with `WHEELBASE_FAKE_NOW=2027-07-19T16:00:00Z` (noon New York) and mock
quotes (XYZ $103.10; LEAPS `XYZ280121C00085000` $23.80 × $24.40, mid $24.10, delta 0.81), and
seeds XYZ through `_test:pmcc-seed-position` with US-109's Background minus cycle 9. The
no-cycles and open-short scenarios relaunch at 2027-08-13; the losing close relaunches with
XYZ $83.10 and the LEAPS $6.10 × $6.70 (delta 0.42); the no-quote scenario relaunches with no
LEAPS snapshot.

Regression: `pnpm test:e2e e2e/pmcc-cost-basis.spec.ts e2e/pmcc-leg-timeline.spec.ts
e2e/pmcc-leaps-roll.spec.ts e2e/pmcc-short-call-roll.spec.ts e2e/pmcc-position-card.spec.ts
e2e/csp-flow.spec.ts e2e/call-away.spec.ts`.

## Seeing it in the app

```bash
pnpm rebuild:electron
pnpm dev
```

A PMCC only reaches the LEAPS-only state through US-119 (or US-111), so until those land, try
it from the e2e fixture: run one test with `PWDEBUG=1`, or seed the state through
`window.api.testPmccSeedPosition` under `NODE_ENV=test`. On the detail page of a LEAPS-only
PMCC, `Close Position →` sits next to `Roll LEAPS →`; with a short call open it is absent.
Compare with `pnpm mockups` → `epic-09-pmcc-position-detail`, presets `close-position`,
`close-losing`, `close-3ct`, `close-no-cycles`, `close-no-quote`, `close-success`, and the
page preset `closed-sold`.

## Passing criteria

1. `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm format` all clean.
2. All 17 e2e tests in `e2e/pmcc-close-position.spec.ts` pass (13 scenarios + 4 outline rows).
3. No surviving, reproducible, non-equivalent mutant in the four new core functions.
4. The existing PMCC and wheel e2e specs above still pass; the US-103 drawer and US-109
   timeline of an open PMCC read exactly as before.

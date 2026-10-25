# US-18 — Quickstart

## Branch

`git worktree add ../wb-18 -b wb-18 main` (Linear branch name: `jcteague/opt-30-us-18-…`; the repo convention is `wb-18`).

## Unit + integration (Vitest)

```bash
pnpm rebuild:node          # if the last run was e2e
pnpm test -- src/main/services/alerts.test.ts \
             src/renderer/src/lib/card-actions.test.ts \
             src/renderer/src/lib/wheel-card-display.test.ts \
             src/renderer/src/components/position-card \
             src/renderer/src/components/PositionsGrid.test.tsx \
             src/renderer/src/pages/PositionsListPage.test.tsx
pnpm test                  # whole suite before marking an area done
```

No migration, no seed data. Renderer tests mock `window.api` hooks as `PositionsListPage.test.tsx` already does.

## E2E (Playwright `_electron`)

```bash
pnpm rebuild:electron
pnpm test:e2e -- e2e/position-cards.spec.ts e2e/option-pnl.spec.ts e2e/expiring-soon-flags.spec.ts \
                 e2e/position-management.spec.ts e2e/management-queue.spec.ts e2e/live-underlying-price.spec.ts \
                 e2e/open-pmcc-position.spec.ts
```

Fixtures are run-day-relative (`localDate(n)`); quotes via `WHEELBASE_MOCK_STOCK_QUOTES`, option marks via `WHEELBASE_MOCK_OPTION_SNAPSHOTS`, queue rows by `runAlertEvaluation(page)` after seeding, dismissal by `dismissAlertViaQueue`.

## Gates

`pnpm test` → `pnpm lint` → `pnpm typecheck` → `pnpm format`. Then `/update-spec us-18`.

Passing criteria: every Red test in `plan.md` green; the 22 named e2e cases green; the six pre-existing list specs above still green with only `option-pnl.spec.ts` AC-1's header assertion rewritten.

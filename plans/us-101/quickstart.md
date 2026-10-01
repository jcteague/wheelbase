# Quickstart: US-101 — Open a PMCC position

## Setup

```bash
pnpm install
pnpm rebuild:node        # system Node ABI for Vitest
```

No environment variables, credentials or seed data are needed. Migration `017_add_leg_fees.sql`
runs automatically through `runMigrations` (`makeTestDb()` in unit tests, app start in e2e).

## Unit + integration (Vitest)

```bash
pnpm test                                                   # everything
pnpm test src/main/core/lifecycle.test.ts                   # openPmcc rules (one case per row of data-model §4)
pnpm test src/main/core/costbasis.test.ts                   # calculatePmccOpeningDebit fixture numbers
pnpm test src/main/services/create-pmcc-position.test.ts    # transaction, three rows, snapshot convention, rollback
pnpm test src/main/services/list-positions.test.ts          # strategyType + pmcc summary, wheel items unchanged
pnpm test src/main/ipc/positions.test.ts                    # positions:create-pmcc envelope, dotted field paths
pnpm test src/main/db/migrate.test.ts                       # 017 applied, legs.fees default
pnpm test src/renderer/src/lib/pmcc-entry.test.ts           # filterCallChain, deriveChainNotice, chainWindow
pnpm test src/renderer/src/schemas/pmcc-entry.test.ts       # form schema messages + cross-leg rules
pnpm test src/renderer/src/components/NewPositionSheet.test.tsx
pnpm test src/renderer/src/components/PmccEntryForm.test.tsx
pnpm test src/renderer/src/pages/PositionsListPage.test.tsx # /new opens the sheet, no remount on close, recorded banner
```

Passing criteria: all green, no `.skip`, and `pnpm lint && pnpm typecheck && pnpm format` clean.

## E2E (Playwright `_electron`)

```bash
pnpm rebuild:electron    # Electron ABI — required after any `pnpm test`
pnpm build
pnpm test:e2e e2e/open-pmcc-position.spec.ts
pnpm test:e2e            # the 14 specs that drive `#/new` must still pass unchanged
```

The spec launches with `FAKE_MARKET_DATA=true`, `FAKE_BROKER=true` and seeds the XYZ chain through
`WHEELBASE_MOCK_OPTION_SNAPSHOTS` (OCC-keyed, with `greeks.delta` and a `timestamp`). Per-scenario
knobs:

| Scenario                 | Env / step                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| Loading                  | `FAKE_OPTION_CHAIN_DELAY_MS=1500`                                                          |
| No matching calls        | fixture with only out-of-band deltas for that leg                                          |
| Quotes unavailable       | `FAKE_MARKET_DATA_ERROR=unknown`                                                           |
| Stale quote              | fixture `timestamp` 10 minutes in the past                                                 |
| Storage failure          | `chmod 0o444` the temp DB (+ `-wal`/`-shm`) after filling the form, restore in `afterEach` |
| Boundary-only rejections | `page.evaluate(() => window.api.createPmccPosition(payload))`                              |

Symptoms of the wrong ABI: `NODE_MODULE_VERSION` errors from Vitest, or an e2e hang on
`waiting for event 'window'`.

## Manual check (optional)

```bash
pnpm rebuild:electron && pnpm dev
```

Positions → `Open Wheel` → toggle `PMCC` → pick or type the XYZ legs from data-model §11 →
`Record PMCC` → the list shows the PMCC row and the `PMCC recorded` banner; the detail page shows
both leg-reference panels.

# Quickstart: US-51 — Management Queue Dashboard

## Prerequisites

- US-50 backend is present (`alerts` table via `migrations/009_create_alerts.sql`,
  the evaluation engine/service, and the `alert-evaluation` scheduled job). No new
  migration is required for US-51.
- `better-sqlite3` built for both ABIs (see CLAUDE.md): after `pnpm install`, run
  `npx electron-rebuild -f -w better-sqlite3` then `pnpm rebuild better-sqlite3`.

## Running the unit + integration tests

```bash
pnpm test
```

The story's tests live in:

- `src/main/services/alerts.test.ts` — `listManagementQueue` (JOIN, ordering,
  empty result, snake→camel mapping).
- `src/main/ipc/alerts.test.ts` — `alerts:list` handler returns
  `{ ok: true, items }` and the `internal_error` envelope on failure.
- `src/renderer/src/components/ManagementQueue.test.tsx` and
  `ManagementQueueRow`/`UrgencyPill` tests — rendering, ordering, empty state,
  navigation.
- `src/renderer/src/pages/PositionsListPage.test.tsx` — queue renders above the
  positions grid (mock `useManagementQueue`).

**Passing criteria:** all Vitest suites green.

Seeding alerts in main-process tests: use the in-memory test DB helper
(`makeTestDb()`), insert positions, then insert `alerts` rows directly (status
`'open'`) — or run `evaluateAlerts({ db, now })` after seeding active legs via the
US-50 `seedActiveLegAtDte` helper — then call `listManagementQueue(db)`.

## Running the E2E test

```bash
pnpm test:e2e
```

The story's E2E lives in `e2e/management-queue.spec.ts`. Pattern (mirrors
existing specs in `e2e/`):

1. Launch the Electron app with a fresh `WHEELBASE_DB_PATH`, `FAKE_MARKET_DATA=true`,
   `FAKE_BROKER=true`.
2. Create positions whose option legs sit at known DTEs (via the New Wheel form,
   or by pre-seeding the DB file before launch) so the rules fire at distinct
   urgencies (e.g. 3 DTE → high `EXPIRATION_IMMINENT`, ~9–17 DTE → medium
   `MANAGEMENT_WINDOW`).
3. Trigger evaluation on demand: `window.api.testSchedulerRunNow('alert-evaluation')`
   via `page.evaluate(...)`.
4. Reload / navigate to the dashboard (`location.hash = '#/'`) and assert the
   management queue contents, ordering, and the empty state.

**Passing criteria:** the e2e suite passes; each AC scenario maps to one test.

## Post-change checklist (per CLAUDE.md)

```bash
pnpm test       # all pass
pnpm lint       # no errors
pnpm typecheck  # no TS errors
pnpm format     # prettier
```

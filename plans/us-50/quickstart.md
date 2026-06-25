# Quickstart: US-50 — Scheduled alert evaluation

## Prerequisites

- No new dependencies. Everything uses existing packages (`better-sqlite3`,
  `decimal.js`, `date-fns`, `vitest`).
- Migration `009_create_alerts.sql` is applied automatically by the migration
  runner (`src/main/db/migrate.ts`) when the app boots or when `makeTestDb()`
  builds an in-memory DB for tests — no manual step.
- `better-sqlite3` ABI: if you have just run the app under Electron, rebuild for
  system Node before running Vitest:
  ```bash
  pnpm rebuild better-sqlite3
  ```
  (And `npx electron-rebuild -f -w better-sqlite3` before `pnpm dev`/e2e.)

## Running the tests

Run the full unit/integration suite:

```bash
pnpm test
```

Target just this story's files while iterating:

```bash
pnpm test src/main/core/alerts.test.ts \
          src/main/core/dte.test.ts \
          src/main/services/alerts.test.ts \
          src/main/services/evaluate-alerts.test.ts
```

## Seed data used by the integration tests

`evaluate-alerts.test.ts` builds an in-memory DB with `makeTestDb()` and seeds
positions via the existing `createPosition` / covered-call service helpers, then
sets each active leg's `expiration` to produce a target DTE relative to a fixed
injected `now`:

- **AAPL** — `CSP_OPEN`, active leg ~4 DTE → expects one `EXPIRATION_IMMINENT` (high).
- **MSFT** — `CC_OPEN`, active leg ~17 DTE → expects one `MANAGEMENT_WINDOW` (medium).
- **TSLA** — `HOLDING_SHARES`, no open covered call → expects no alert rows.
- **NVDA** — active position used to exercise the missing-data skip path.

DTE is controlled by computing each leg's `expiration` as `now + N days` so tests
are deterministic against an injected clock rather than wall time.

## Verification checklist

The story is done when:

1. `pnpm test` — all green, including the new `core/alerts`, `core/dte`,
   `services/alerts`, and `services/evaluate-alerts` suites.
2. `pnpm lint` — clean.
3. `pnpm typecheck` — no errors (new `AlertRecord` / engine types compile).
4. `pnpm format` — applied.
5. Manual sanity (optional, via `pnpm dev`): with AAPL at ≤5 DTE and MSFT at
   6–21 DTE seeded, the `alert-evaluation` job fires on the polling cadence and
   the `alerts` table contains one open row per triggered rule. Re-running the
   job (`scheduler.runNow('alert-evaluation')`) does not duplicate rows.

## Notes

- US-50 adds **no IPC surface**. The open-queue read (`alerts:list`), dismissal
  (`alerts:dismiss`), and calendar (`alerts:calendar`) handlers are US-51/US-59/
  US-60. A `listOpenAlerts(db)` service query is added here only so tests (and,
  later, US-51) can read the open queue.
- Only `EXPIRATION_IMMINENT` and `MANAGEMENT_WINDOW` rules ship in US-50; the
  other Classic Wheel rules are later stories.

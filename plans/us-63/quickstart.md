# Quickstart: US-63 — Watchlist create/remove

## Prerequisites

- `pnpm install` completed.
- `better-sqlite3` built for both ABIs (order matters):
  ```bash
  npx electron-rebuild -f -w better-sqlite3   # for dev/build (Electron ABI)
  pnpm rebuild better-sqlite3                  # for Vitest (system Node ABI)
  ```
  If you later run `pnpm test:e2e` and it hangs on "waiting for event 'window'", re-run
  `npx electron-rebuild -f -w better-sqlite3` (known ABI-mismatch symptom).

## Migration

`migrations/012_create_watchlist.sql` is applied automatically at app startup and in tests via
`makeTestDb()` (`src/main/test-utils.ts`, which runs `runMigrations` against a fresh `:memory:` db).
No manual migration step. Verify it is picked up by the migration runner test if one asserts a count:
`src/main/db/migrate.test.ts`.

## Run unit + integration tests (Vitest)

```bash
pnpm test                                        # full suite
pnpm test src/main/services/watchlist.test.ts    # service: add/list/remove + duplicate
pnpm test src/main/ipc/watchlist.test.ts         # IPC envelope wiring
pnpm test src/renderer/src/schemas/watchlist.test.ts        # add-form schema messages
pnpm test src/renderer/src/api/watchlist.test.ts            # adapter maps IPC ↔ renderer
pnpm test src/renderer/src/pages/WatchlistPage.test.tsx     # page: list/add/duplicate/empty
```

- Service tests use a real `:memory:` SQLite (`makeTestDb()`), seed via the service functions, and
  assert on return values — including a duplicate-ticker assertion expecting
  `ValidationError('ticker','duplicate','AAPL is already on the watchlist')`.
- IPC tests mock `electron` (`ipcMain.handle` as `vi.fn()`), the logger, and the service module;
  capture registered handlers from `ipcMain.handle.mock.calls`; assert the `{ ok, ... }` / error
  envelope shapes. Re-declare `ValidationError` in the mock so `instanceof` resolves in
  `handleIpcCall`.
- Page tests mock the hooks (`vi.mock('../hooks/useWatchlist')`, `useAddToWatchlist`,
  `useRemoveFromWatchlist`, and `wouter`) and feed fake TanStack Query return objects (no real
  QueryClientProvider), following `src/renderer/src/pages/CalendarPage.test.tsx`.

## Run E2E (Playwright `_electron`)

```bash
pnpm test:e2e                          # builds out/, then runs all specs
pnpm test:e2e e2e/watchlist.spec.ts    # this story's spec only (after build)
```

The e2e spec launches the built app with a fresh temp DB per test
(`WHEELBASE_DB_PATH`, `FAKE_MARKET_DATA=true`, `FAKE_BROKER=true`), navigates via
`location.hash = '#/watchlist'`, drives the add form by input `#id` and `data-testid` actions, and
asserts on page text.

## Post-change checklist (CLAUDE.md)

```bash
pnpm test        # all pass
pnpm lint        # no errors
pnpm typecheck   # no TS errors
pnpm format      # prettier
```

## Passing criteria

- All new Vitest tests green; existing suite unaffected.
- `e2e/watchlist.spec.ts`: one `it()` per acceptance criterion, all green.
- Manually: `pnpm dev`, click **Watchlist** in the sidebar → add `nvda` → row shows `NVDA` at top;
  add a ticker with a "Would own below" price and "Wait for high IV" IVR → row shows `≤ $…` and
  `IVR ≥ …` tags; re-adding an existing ticker shows the inline duplicate error; removing a row drops
  it; an empty watchlist shows the guidance empty state.

# Quickstart: US-69 — Edit a watchlist entry

## Prerequisites

- `pnpm install` completed.
- `better-sqlite3` built for both ABIs, in this order:
  ```bash
  npx electron-rebuild -f -w better-sqlite3   # Electron ABI — pnpm dev / build / test:e2e
  pnpm rebuild better-sqlite3                  # system Node ABI — pnpm test (Vitest)
  ```
  Running `pnpm test` after an e2e run (or vice-versa) can leave the wrong ABI in place. The
  e2e symptom is a hang on `waiting for event 'window'`; fix with the electron-rebuild line.

## Migration / seed data

None. The `watchlist` table (`migrations/012_create_watchlist.sql`) already carries every
column this story writes. Unit tests get it through `makeTestDb()` (`src/main/test-utils.ts`);
the e2e suite gets a fresh temp DB per test and seeds entries through the real
`watchlist.add` IPC via `launchScreener`.

## Unit + integration tests (Vitest)

```bash
pnpm test                                                        # full suite
pnpm test src/main/schemas.test.ts                               # WatchlistUpdatePayloadSchema
pnpm test src/main/services/watchlist.test.ts                    # updateWatchlistEntry
pnpm test src/main/ipc/watchlist.test.ts                         # watchlist:update envelope
pnpm test src/renderer/src/api/watchlist.test.ts                 # updateWatchlistEntry adapter
pnpm test src/renderer/src/hooks/useUpdateWatchlistEntry.test.ts # invalidation trio
pnpm test src/renderer/src/schemas/watchlist.test.ts             # 500-char message
pnpm test src/renderer/src/components/WatchlistEntryForm.test.tsx # add + edit modes
pnpm test src/renderer/src/components/BenchDetail.test.tsx       # Edit affordance
pnpm test src/renderer/src/components/BenchGrid.test.tsx         # panel swaps to the form
pnpm test src/renderer/src/pages/WatchlistPage.test.tsx          # editing state transitions
```

Conventions already used by the neighbouring suites:

- **Service** tests use a real `:memory:` SQLite (`makeTestDb()`), seed with
  `addWatchlistEntry`, and assert on the returned `WatchlistEntryRecord` plus a raw `SELECT`
  where the stored encoding matters (4dp TEXT, 0/1 booleans, `NULL`).
- **IPC** tests mock `electron` (`ipcMain.handle` as `vi.fn()`), the logger and
  `../services/watchlist`, then pull the registered handler out of
  `ipcMain.handle.mock.calls` and assert the `{ ok, … }` / `{ ok: false, errors }` envelopes.
- **Hook** tests mock `@tanstack/react-query` and call the captured `onSuccess`, asserting
  each `invalidateQueries` key (see `useAddToWatchlist.test.ts`).
- **Component** tests use `@testing-library/react` + `userEvent`, mocking the mutation hooks
  (`vi.mock('../hooks/useUpdateWatchlistEntry')`) and using the fixture builders in
  `src/renderer/src/components/bench-test-utils.ts` (`entry`, `row`, `meets`, `waiting`, …).
- **Page** tests mock every data hook and `wouter`, following the existing
  `WatchlistPage.test.tsx` setup helpers (`setSnapshot`, `setResults`, …).

## E2E (Playwright `_electron`)

```bash
pnpm test:e2e                                  # builds out/, then runs every spec
pnpm test:e2e e2e/watchlist-edit.spec.ts       # this story's spec only (after a build)
pnpm test:e2e e2e/watchlist.spec.ts e2e/watchlist-bench.spec.ts   # inherited suites must stay green
```

The US-69 spec launches through `launchScreener(dbPath, opts)` from `e2e/screener-helpers.ts`
with `FAKE_MARKET_DATA` / `FAKE_BROKER` seams: `fixtures: [AAPL_PUT]` puts AAPL on the
watchlist, `watchlistNotes` / `conditions` seed the Background (`Would own below $170`,
`ownBelowPrice: 170`), and the re-judge scenario adds
`ivr: { AAPL: { ivr: 34, observedAt: observedSessionsAgo(0) } }`. It drives the edit through
the detail panel (`selectCard` → `bench-detail-edit` → fields by `#id` → `watchlist-edit-submit`)
and reads results off `bench-detail-thesis`, `bench-gate-price`, `bench-gate-iv` and the card's
`data-bench-section`. `reloadBench` covers "persists after the page is reloaded".

If the IPC suites time out at 5000 ms on their first case, a stray Electron from another
worktree's e2e run is usually loading the CPU — rerun in isolation before investigating.

## Post-change checklist (CLAUDE.md)

```bash
pnpm test        # all pass
pnpm lint        # no errors
pnpm typecheck   # no TS errors
pnpm format      # prettier
```

Logging: INFO `watchlist_entry_updated`; DEBUG `watchlist_update_input`. No logging in
`src/main/core/`.

## Passing criteria

- Every new Vitest case green; every existing suite untouched or green — in particular
  `e2e/watchlist.spec.ts` (11 cases, add-mode selectors unchanged) and
  `e2e/watchlist-bench.spec.ts` (33 cases, detail panel still renders every existing test id).
- `e2e/watchlist-edit.spec.ts`: one `it()` per acceptance scenario, ten in all, all green.
- Manually (`pnpm dev` → Watchlist): add `AAPL` with a thesis and `Would own below 170`;
  select its card; the detail panel shows an **Edit** button; the form opens in the panel with
  `AAPL · ticker fixed`, the thesis and `$ 170.00` pre-filled; change the price to `165`, add
  `Wait for high IV` = `50`, **Save changes**; the panel returns to the read view with
  `≤ $165 · …` and `IVR ≥ 50 · …` gate badges; reload and the values persist; **Cancel**
  discards edits; a 501-character thesis shows `Note must be 500 characters or fewer` and the
  counter turns red.

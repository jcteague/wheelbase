# US-67 Quickstart — running and verifying

## Setup

No migration, no seed data, no new environment variable. The criteria live under a new `app_settings` key (`screening_criteria`) that the read path creates lazily on first save; an existing database needs nothing done to it.

`better-sqlite3` must be built for whichever runtime you are about to use:

```bash
npx electron-rebuild -f -w better-sqlite3   # for pnpm dev / pnpm test:e2e
pnpm rebuild better-sqlite3                 # for pnpm test (system Node)
```

`pretest` and `pretest:e2e` each rebuild for their own runtime, so alternating the two commands self-heals. If an e2e run hangs on `waiting for event 'window'`, run the electron-rebuild line above and retry once.

---

## Unit + integration tests

```bash
pnpm test
```

Files this story adds or touches:

| Path                                                          | Covers                                                                 |
| ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/main/core/screening-criteria.test.ts`                    | Bounds predicates, cross-field predicates, message strings             |
| `src/main/core/screener.test.ts`                              | `iv_rank_floor` filter — excludes below floor, passes unknown IVR      |
| `src/main/services/screening-criteria.test.ts`                | Round-trip, defaults fallback, corrupt-row fallback, validation errors |
| `src/main/services/screener.test.ts`                          | `screenWatchlistCandidates` reads persisted criteria                   |
| `src/main/ipc/screener.test.ts`                               | Both new channels' envelopes                                           |
| `src/renderer/src/api/screening-criteria.test.ts`             | Adapter unwrap + error mapping                                         |
| `src/renderer/src/schemas/screening-criteria.test.ts`         | Form schema bounds and cross-field refinements                         |
| `src/renderer/src/components/ScreeningCriteriaSheet.test.tsx` | Pre-fill, invalid-disables-save, reset, dismissal discards             |
| `src/renderer/src/components/ScreenerCriteriaStrip.test.tsx`  | Summary string composition                                             |
| `src/renderer/src/pages/ScreenerPage.test.tsx`                | Three entry points, saved banner, empty-state action                   |

Run one file while iterating:

```bash
pnpm test src/main/services/screening-criteria.test.ts
```

---

## E2E tests

```bash
pnpm test:e2e
```

Story spec: `e2e/screening-criteria.spec.ts`, helpers extended in `e2e/screener-helpers.ts`.

The suite stays offline. Put chains come from `WHEELBASE_MOCK_OPTION_SNAPSHOTS`, underlying prices from `WHEELBASE_MOCK_STOCK_QUOTES` (both read by `FakeMarketDataProvider`), IV ranks from the `WHEELBASE_FAKE_IVR` collector seam, and the market session from `FAKE_MARKET_STATUS`. Criteria are always written through the real `screener:save-criteria` IPC — never a direct DB write — so the spec exercises the same path the sheet does.

Run the story's spec alone:

```bash
pnpm test:e2e e2e/screening-criteria.spec.ts
```

### Restart scenario

The "saved criteria survive a restart" AC closes the Electron app and relaunches it against the **same** `dbPath`, then reopens the sheet. `tmpDb` / `cleanupDb` in `e2e/assignment-helpers.ts` already take the path as a parameter, so the helper only needs a relaunch variant that skips re-seeding the watchlist.

---

## Manual check

```bash
pnpm dev
```

1. Go to **Screener**. The criteria summary strip sits above the results and reads `Δ 0.20–0.30 · DTE 30–45 · OI ≥ 500 · Spread ≤ 10% · Earnings Exclude`.
2. Open the sheet three ways — the `⚙ Criteria` header button, the summary strip, and (with an empty result set) the empty card's **Adjust criteria**. All three open the same sheet, and the sidebar stays clickable behind the scrim.
3. Invert the delta band to `0.30 → 0.20`. The inline error reads `Minimum delta must be less than maximum delta` and **Save & re-screen** is disabled.
4. Set the band to `0.15–0.20` and the DTE window to `40–45`, then **Save & re-screen**. The sheet closes, `Screening criteria saved` appears, the strip updates, and the table refreshes underneath.
5. Restart the app and reopen the sheet — the band still reads `0.15–0.20`.
6. Open **Settings**. There is no screening-criteria section; Alert Defaults and the broker credentials sections are unchanged.

---

## Passing criteria

| Gate                | Command                                                         | Bar                                                                   |
| ------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------- |
| Suite               | `pnpm test && pnpm lint && pnpm typecheck`                      | All pass                                                              |
| Acceptance criteria | `pnpm test:e2e`                                                 | All 14 `it()` blocks in `e2e/screening-criteria.spec.ts` run and pass |
| Coverage            | `pnpm test --coverage.enabled --coverage.reporter=json-summary` | Every changed `src/**/*.ts(x)` at ≥95% lines **and** branches         |

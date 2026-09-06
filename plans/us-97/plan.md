---
story: us-97
kind: feature
parent: null
topics: [market-data, screener]
status: planned
---

# Implementation Plan: US-97 — Collect IVR snapshots for watchlist underlyings

## Summary

Widen the IVR collector's target list from open-position tickers to the union of open positions and the watchlist, so the nightly (and manual) Barchart run populates IV rank for the names the trader is screening but does not yet hold. The change is one SQL statement in `src/main/services/ivr-collector.ts`; everything downstream (rate limiting, failure isolation, same-day overwrite, the `ivr:collect-now` IPC) is target-agnostic. Done means: a watchlist-only ticker gets a snapshot, a held-and-watchlisted ticker is fetched once, a removed ticker stops being collected, the screener shows a real IV rank for bench names (and the US-67 floor can now exclude them), the e2e harness no longer needs throwaway positions to seed IVR, and the Settings "Refresh IVR now" button is disabled while a run is in flight.

## Supporting Documents

Read these before starting implementation — they contain the decisions, data model, and API contract:

- **User Story & Acceptance Criteria:** `docs/epics/08-stories/US-97-collect-ivr-for-watchlist-underlyings.md`
- **Research & Design Decisions:** `plans/us-97/research.md`
- **Data Model & Selection Logic:** `plans/us-97/data-model.md`
- **Quickstart & Verification:** `plans/us-97/quickstart.md`

No `contracts/` — the story adds no IPC surface; `ivr:collect-now` and `CollectIvrNowBatchSchema` are unchanged.

## Prerequisites

- `src/main/services/ivr-collector.ts` (US-44) — `collectIVRSnapshots`, `listActiveUnderlyings`, `persistSnapshot`, injectable `fetchIvr`/`clock` seams.
- `migrations/012_create_watchlist.sql` (US-63) — `watchlist.ticker TEXT PRIMARY KEY`; `addWatchlistEntry` upper-cases on insert.
- `src/main/test-utils.ts` — `makeTestDb` (runs all migrations), `seedWatchlist(db, tickers)`, `seedIvr(db, rows)`.
- `src/main/ipc/ivr.ts` + `scheduler.runNow` — manual trigger already shares the collector code path.
- `src/main/core/screener.ts` `iv_rank_floor` (US-67) and `src/main/services/ivr-snapshots.ts` `getLatestIvrByUnderlying` (US-65) — the read side this story feeds.
- E2E seams: `WHEELBASE_FAKE_IVR` + `_test:ivr-set-outcomes` / `_test:ivr-snapshots` (`src/main/ipc/test-ivr.ts`), helpers in `e2e/ivr-helpers.ts` (`launchIvrApp`, `setIvrOutcomes`, `collectIvrNow`, `readIvrSnapshots`, `seedActivePosition`, `okOutcome`, `notAvailableOutcome`, `parseErrorOutcome`) and `e2e/screener-helpers.ts` (`launchScreener`, `rowCells`, `excludedReason`, `openCriteriaSheet`, `setCriteriaValues`, `saveCriteria`, private `seedWatchlist`/`seedIvr`).

## AC Audit

Every acceptance criterion from the story is represented as a named e2e test in Area 4:

| Story scenario                                                         | E2E test name                                                                |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Watchlist underlyings are collected alongside held positions           | `AC: Watchlist underlyings are collected alongside held positions`           |
| A watchlisted ticker with only a closed position is still collected    | `AC: A watchlisted ticker with only a closed position is still collected`    |
| A ticker that is both held and watchlisted is collected once           | `AC: A ticker that is both held and watchlisted is collected once`           |
| A watchlist ticker with no IVR coverage is skipped, not failed         | `AC: A watchlist ticker with no IVR coverage is skipped, not failed`         |
| One ticker failing does not suppress the others                        | `AC: One ticker failing does not suppress the others`                        |
| Removing a ticker from the watchlist stops future collection           | `AC: Removing a ticker from the watchlist stops future collection`           |
| The manual collect-now trigger covers the watchlist too                | `AC: The manual collect-now trigger covers the watchlist too`                |
| A screened candidate shows a real IV rank instead of n/a               | `AC: A screened candidate shows a real IV rank instead of n/a`               |
| A populated IV rank lets the screener's IV floor apply to a bench name | `AC: A populated IV rank lets the screener's IV floor apply to a bench name` |

## Implementation Areas

### 1. Collector target selection — union positions and watchlist

**Files to create or modify:**

- `src/main/services/ivr-collector.ts` — replace `ACTIVE_UNDERLYINGS_QUERY` with the union query; rename to `COLLECTION_TARGETS_QUERY` and `listActiveUnderlyings` → `listCollectionTargets`; update the module-level comment and the `ivr_collection_targets_loaded` debug log field name if it changes.
- `src/main/services/ivr-collector.test.ts` — rewrite the test at line 102 and add the cases below. Use `seedWatchlist` from `../test-utils` alongside the existing `insertPosition` helper.

**Red — tests to write** (all in `ivr-collector.test.ts`, `describe('collectIVRSnapshots')`):

- `collects the union of open-position and watchlist tickers, distinct and sorted` — replaces `selects distinct active-position tickers only …`. Seed positions `SPY`, `spy`, `AAPL`, `TSLA (CLOSED)`; seed watchlist `KO`, `XYZ`, `aapl` (via `insertWatchlistTicker`/raw insert to test lower-case). `fetchIvr` mock returns `not_available`. Assert `fetchIvr.mock.calls.map(([t]) => t)` equals `['AAPL', 'KO', 'SPY', 'XYZ']` (TSLA absent, AAPL once, KO/XYZ present) and `clock.sleep` called `3` times with `1000`.
- `collects a watchlist ticker whose only position is CLOSED` — position `KO` with `status: 'CLOSED'`, watchlist `KO`. Assert `fetchIvr` called once with `'KO'`.
- `fetches a ticker that is both held and watchlisted exactly once and writes one row` — position `AAPL` open, watchlist `AAPL`, `fetchIvr` returns `ok` with `observedAt: '2026-05-29T21:00:00.000Z'`. Assert `fetchIvr` called once; `listSnapshots(db)` has exactly one `AAPL` row; result `successCount === 1`.
- `stops collecting a ticker removed from the watchlist and keeps its prior snapshot` — `seedIvr(db, [['KO', '2026-05-28T21:00:00.000Z', '38.0']])`, watchlist empty, no KO position. Run. Assert `fetchIvr` not called with `'KO'`; `listSnapshots(db)` still contains the 2026-05-28 KO row.
- `counts an uncovered watchlist ticker as skipped and still succeeds for the others` — watchlist `KO`, `XYZ`; position `MSFT`. `fetchIvr`: `XYZ → not_available`, others `ok`. Assert result `{ successCount: 2, errorCount: 0, skippedCount: 1, skippedReason: null }` and `logger.info` called with `{ ticker: 'XYZ' }`.
- `isolates a network_error on one watchlist ticker from the rest of the batch` — watchlist `KO`, `AAPL`, `XYZ`; position `MSFT`. `fetchIvr`: `KO → network_error`, others `ok`. Assert all four tickers attempted (call order `['AAPL','KO','MSFT','XYZ']`), `logger.warn` called with `{ ticker: 'KO', error: … }`, result `{ successCount: 3, errorCount: 1, skippedCount: 0 }`.

**Green — implementation:**

- In `src/main/services/ivr-collector.ts`, set

  ```ts
  const COLLECTION_TARGETS_QUERY = `
    SELECT ticker FROM positions WHERE status != 'CLOSED'
    UNION
    SELECT ticker FROM watchlist
  `
  ```

  and point `listCollectionTargets(db)` at it. Keep the existing `toUpperCase()` → `Set` → `localeCompare` pipeline untouched — it is what makes the collect-once and casing cases pass (see `plans/us-97/data-model.md` truth table).

- No change to `persistSnapshot`, `isTradingDay`, `sleepBetweenRequests`, the scheduler registration in `src/main/index.ts`, or `src/main/ipc/ivr.ts`.
- Logging: the existing `logger.debug({ underlyings }, 'ivr_collection_targets_loaded')` already covers the DEBUG requirement; keep the field name `underlyings` so log queries do not break.

**Refactor — cleanup to consider:**

- Confirm the rename reads correctly at every call site; the word "active" must not survive anywhere in the collector now that closed-position-but-watchlisted tickers are collected.
- Check whether the module header comment (if any) still describes targets as "active-position underlyings" and fix it.
- Nothing else expected — the diff should be ~6 lines of source.

**Acceptance criteria covered:**

- Watchlist underlyings are collected alongside held positions
- A watchlisted ticker with only a closed position is still collected
- A ticker that is both held and watchlisted is collected once
- A watchlist ticker with no IVR coverage is skipped, not failed
- One ticker failing does not suppress the others
- Removing a ticker from the watchlist stops future collection
- The manual collect-now trigger covers the watchlist too (shared code path — verified end-to-end in Area 4)

### 2. Settings "Refresh IVR now" pending state

> Judgment call — see `research.md` ADR "Minimal pending state". The story's Technical Notes ask to confirm a pending state exists; it does not, and `scheduler.runNow` has no overlap guard. Strike this area if you prefer to keep the story strictly main-process.

**Files to create or modify:**

- `src/renderer/src/pages/SettingsPage.tsx` — the `Refresh IVR now` `<button>` (currently ~line 594) gains `disabled={collectIvrNow.isPending}` and renders `Refreshing IVR…` while pending; add the existing disabled-state Tailwind classes used by sibling buttons (`disabled:opacity-50 disabled:cursor-not-allowed` or whatever the page already uses — match, don't invent).
- `src/renderer/src/pages/SettingsPage.test.tsx` — one new test next to `clicking Refresh IVR now surfaces the returned success and error counts` (line 119).

**Red — tests to write:**

- `disables Refresh IVR now while a collection is in flight` in `SettingsPage.test.tsx` — mock `collectNow` with a deferred promise; click the button; assert the button is `disabled` and its accessible name matches `/refreshing ivr/i`; resolve the promise; assert it is enabled again with name `/refresh ivr now/i`.

**Green — implementation:**

- Bind `disabled={collectIvrNow.isPending}` and `{collectIvrNow.isPending ? 'Refreshing IVR…' : 'Refresh IVR now'}` on the button in `SettingsPage.tsx`. `collectIvrNow` is the existing `useCollectIvrNow()` mutation — no new hook, no new state.

**Refactor — cleanup to consider:**

- If the neighbouring `Test connection` button already has an identical pending pattern, mirror its exact markup rather than a second variant.

**Acceptance criteria covered:**

- Supports "The manual collect-now trigger covers the watchlist too" (the run is now watchlist-length; the trigger must not be re-fired mid-run). No story scenario asserts the disabled state directly — this is a Technical Notes obligation.

### 3. E2E harness — drop the throwaway-position workaround, share watchlist seeding

**Files to create or modify:**

- `e2e/screener-helpers.ts` — `seedIvr` (line ~245) stops looping `seedActivePosition`; remove the now-unused `seedActivePosition` import; rewrite its doc comment (the "collector reads its targets from open positions" sentence is now false). Export `seedWatchlist` (or move it to `e2e/ivr-helpers.ts` and import it back here) so Area 4's spec reuses it.
- `e2e/ivr-helpers.ts` — add `removeFromWatchlist(page, ticker)` calling `window.api.watchlist.remove({ ticker })` through the production IPC (never a direct DB write), and `seedClosedPosition(page, ticker)` = `seedActivePosition` followed by `window.api.closePosition({ positionId, closePricePerContract: 0.05 })` (`positions:close-csp`, payload `CloseCspPayloadSchema` in `src/main/schemas.ts`). No existing e2e helper closes a position — `assignment-helpers.ts` only seeds and assigns.

**Red — tests to write:**

- No new tests in this area. Green is verified by the existing suites: `e2e/screener-results.spec.ts` (`IV rank unavailable is shown, not blank` must still see `n/a` for MSFT — MSFT is watchlisted but has no programmed outcome, so it is skipped) and `e2e/screening-criteria.spec.ts` (`leaves the IV-rank floor off by default and excludes below it when enabled`) must pass with no positions seeded.

**Green — implementation:**

- `seedIvr(page, ivr)` becomes: `setIvrOutcomes(page, …okOutcome per ticker…)` then `collectIvrNow(page)`. Tickers are already on the watchlist from `seedWatchlist` in `launchScreener`.
- `removeFromWatchlist` and `seedClosedPosition` in `e2e/ivr-helpers.ts`, typed like the existing `seedActivePosition`.

**Refactor — cleanup to consider:**

- After the change, `seedActivePosition` is still used by `e2e/ivr-collector.spec.ts` — do not remove it from `ivr-helpers.ts`.
- Check no other e2e spec relied on the inert positions `seedIvr` used to create (grep `seedIvr` callers; only `launchScreener` should call it).

**Acceptance criteria covered:**

- Indirectly: "A screened candidate shows a real IV rank instead of n/a" and "A populated IV rank lets the screener's IV floor apply to a bench name" — after this area the screener harness proves those with no positions in the DB, which is the story's whole point.

### 4. E2e Tests

**Files to create or modify:**

- `e2e/ivr-watchlist-collection.spec.ts` — new spec, header comment in the style of `e2e/ivr-collector.spec.ts` (`// [US-97] … Each it() maps to exactly one acceptance criterion …`). Reuse `tmpDb`/`cleanupDb`/`getPage` from `assignment-helpers`, everything IVR-side from `ivr-helpers`, and `launchScreener`/`rowCells`/`excludedReason`/criteria-sheet helpers from `screener-helpers`. Use the same `SAME_DAY_AFTERNOON` constant pattern (`'2026-05-29T20:55:00Z'`) and `YESTERDAY_AFTERNOON = '2026-05-28T20:55:00Z'`.

**Red — tests to write** (one `it()` per AC; names mirror the story):

- `AC: Watchlist underlyings are collected alongside held positions` — `launchIvrApp`; `seedWatchlist(page, ['KO','AAPL','XYZ'])`; `seedActivePosition(page, 'MSFT')`; program `okOutcome` for all four; `collectIvrNow` → `batch` equals `{ successCount: 4, errorCount: 0, skippedCount: 0, skippedReason: null }`; `readIvrSnapshots` underlyings equal `['AAPL','KO','MSFT','XYZ']`.
- `AC: A watchlisted ticker with only a closed position is still collected` — `seedClosedPosition(page, 'KO')` (Area 3); `seedWatchlist(page, ['KO'])`; program `okOutcome('KO')`; collect → `successCount === 1`, one `KO` row.
- `AC: A ticker that is both held and watchlisted is collected once` — `seedActivePosition(page, 'AAPL')` + `seedWatchlist(page, ['AAPL'])`; program `okOutcome('AAPL')`; collect → `successCount === 1` (a double fetch would count 2 because the summary counts fetches, not rows) and exactly one `AAPL` row.
- `AC: A watchlist ticker with no IVR coverage is skipped, not failed` — watchlist `KO`,`AAPL`,`XYZ`, position `MSFT`; `XYZ → notAvailableOutcome`, rest `okOutcome`; collect → `{ successCount: 3, skippedCount: 1, errorCount: 0 }`; rows for `AAPL`,`KO`,`MSFT` only.
- `AC: One ticker failing does not suppress the others` — same seed; `KO → parseErrorOutcome()` (the e2e `IvrOutcome` union has no network_error variant — parse_error exercises the same `errorCount` branch; note this in the test comment), rest `okOutcome`; collect → `{ successCount: 3, errorCount: 1, skippedCount: 0 }`; rows for `AAPL`,`MSFT`,`XYZ`.
- `AC: Removing a ticker from the watchlist stops future collection` — `seedWatchlist(page, ['KO'])`; program `okOutcome('KO', { ivr: 38, observedAt: YESTERDAY_AFTERNOON })`; collect; `removeFromWatchlist(page, 'KO')`; re-program `okOutcome('KO', { ivr: 99, observedAt: SAME_DAY_AFTERNOON })`; collect → second `batch.successCount === 0`; `readIvrSnapshots` still equals the single yesterday row `{ underlying: 'KO', observed_at: YESTERDAY_AFTERNOON, ivr: '38.0' }`.
- `AC: The manual collect-now trigger covers the watchlist too` — `seedWatchlist(page, ['TSLA'])`; program `okOutcome('TSLA')`; navigate `#/settings`; click `Refresh IVR now`; `waitForSelector('text=IVR refresh complete: 1 snapshots saved, 0 errors.')`; one `TSLA` row.
- `AC: A screened candidate shows a real IV rank instead of n/a` — `launchScreener(dbPath, { fixtures: [KO put fixture], ivr: { KO: 38 } })` (no positions anywhere — assert `listPositions` is empty if a helper exists, otherwise rely on Area 3 having removed the workaround); `rowCells(page, 'KO')[IVR]` starts with `38` (the cell is `38 (MMM d)` — mirror `IVR_OBSERVED_LABEL` from `screener-results.spec.ts`).
- `AC: A populated IV rank lets the screener's IV floor apply to a bench name` — `launchScreener(dbPath, { fixtures: [KO put fixture], ivr: { KO: 22 } })`; `openCriteriaSheet(page, 'header')`; click `[data-testid="iv-rank-floor-on"]`; `setCriteriaValues(page, { minIvRank: '30' })`; `saveCriteria`; `waitForCriteriaSheetClosed`; `waitForRankedRowCount(page, 0)`; `excludedReason(page, 'KO')` contains `IV rank 22.0` and `below 30` (the reason embeds the observation date between them — do not match the whole string).

**Green — implementation:**

- The spec file itself plus any helper exports from Area 3. No production code.

**Refactor — cleanup to consider:**

- If `seedWatchlist` ended up exported from `screener-helpers.ts` but `ivr-watchlist-collection.spec.ts` otherwise imports only from `ivr-helpers.ts`, move it to `ivr-helpers.ts` so the import graph reads sensibly (screener-helpers already imports from ivr-helpers, not the reverse).
- Check the `IVR` column index constant is not duplicated a third time — `screener-results.spec.ts` defines `const IVR = 9`; if a shared column-index export is cheap, use it, otherwise leave the local constant with a comment pointing at the source.

**Acceptance criteria covered:**

- All nine — see AC Audit above.

## Post-implementation

1. `pnpm test && pnpm lint && pnpm typecheck && pnpm format`, then `pnpm test:e2e` (rebuild `better-sqlite3` for Electron first — see `quickstart.md`).
2. `/update-spec us-97`: supersede `docs/spec/architecture/02-adrs/active-ivr-targets-from-positions.md`, refresh the US-44 feature page's target-selection wording, and note the `iv_rank_floor` consequence on the US-67 feature page.
3. Separate docs pass (out of scope here): the `readIvRanks` doc comment in `src/main/services/screener.ts` and US-98's Out of Scope both still say IVR is never a hard filter.

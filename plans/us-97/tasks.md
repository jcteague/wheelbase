# US-97 — Collect IVR snapshots for watchlist underlyings — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off
- Plan: `plans/us-97/plan.md` · Decisions: `plans/us-97/research.md` · Selection rule: `plans/us-97/data-model.md` · Verification: `plans/us-97/quickstart.md`

---

## Layer 1 — Foundation (no dependencies)

> These areas can be started immediately and run in parallel.

### Collector Target Selection

- [x] **[Red]** Write failing tests — `src/main/services/ivr-collector.test.ts`
  - Import `seedWatchlist` (and `seedIvr`) from `../test-utils`; keep the existing `insertPosition`/`listSnapshots` helpers
  - Replace `selects distinct active-position tickers only and spaces requests by at least 1 second` with `collects the union of open-position and watchlist tickers, distinct and sorted` — positions `SPY`, `spy`, `AAPL`, `TSLA (CLOSED)`; watchlist `KO`, `XYZ`, plus a raw lower-case `aapl` insert; assert fetch order `['AAPL', 'KO', 'SPY', 'XYZ']` and `clock.sleep` called 3× with `1000`
  - `collects a watchlist ticker whose only position is CLOSED` — CLOSED `KO` position + watchlist `KO` → `fetchIvr` called once with `'KO'`
  - `fetches a ticker that is both held and watchlisted exactly once and writes one row` — open `AAPL` + watchlist `AAPL`, `ok` outcome → 1 fetch, 1 `AAPL` row, `successCount === 1`
  - `stops collecting a ticker removed from the watchlist and keeps its prior snapshot` — `seedIvr(db, [['KO', '2026-05-28T21:00:00.000Z', '38.0']])`, empty watchlist, no KO position → `fetchIvr` never called with `'KO'`; the 2026-05-28 row still present
  - `counts an uncovered watchlist ticker as skipped and still succeeds for the others` — watchlist `KO`,`XYZ`, position `MSFT`; `XYZ → not_available` → `{ successCount: 2, errorCount: 0, skippedCount: 1, skippedReason: null }`, `logger.info` with `{ ticker: 'XYZ' }`
  - `isolates a network_error on one watchlist ticker from the rest of the batch` — watchlist `KO`,`AAPL`,`XYZ`, position `MSFT`; `KO → network_error` → all four attempted in order `['AAPL','KO','MSFT','XYZ']`, `logger.warn` with `{ ticker: 'KO' }`, `{ successCount: 3, errorCount: 1, skippedCount: 0 }`
  - Run `pnpm vitest run src/main/services/ivr-collector.test.ts` — the new/rewritten tests must fail (watchlist tickers not fetched)
- [x] **[Green]** Implement — `src/main/services/ivr-collector.ts` _(depends on: Collector Target Selection Red ✓)_
  - Replace `ACTIVE_UNDERLYINGS_QUERY` with `COLLECTION_TARGETS_QUERY` = `SELECT ticker FROM positions WHERE status != 'CLOSED' UNION SELECT ticker FROM watchlist`
  - Rename `listActiveUnderlyings` → `listCollectionTargets`; keep the `toUpperCase()` → `Set` → `localeCompare` pipeline untouched
  - No change to `persistSnapshot`, `isTradingDay`, `sleepBetweenRequests`, scheduler registration, or `src/main/ipc/ivr.ts`; keep the `ivr_collection_targets_loaded` debug log with field `underlyings`
  - Run `pnpm vitest run src/main/services/ivr-collector.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/ivr-collector.ts` _(depends on: Collector Target Selection Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Grep the collector for "active" — the word must not survive now that closed-but-watchlisted tickers are collected; fix any header comment describing targets as active-position underlyings
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Settings Pending State

> Judgment call — see `research.md` ADR "Minimal pending state on Refresh IVR now". Strike this area if the story should stay strictly main-process.

- [x] **[Red]** Write failing test — `src/renderer/src/pages/SettingsPage.test.tsx`
  - `disables Refresh IVR now while a collection is in flight` — next to `clicking Refresh IVR now surfaces the returned success and error counts` (~line 119); mock `collectNow` with a deferred promise; click; assert button `disabled` with accessible name `/refreshing ivr/i`; resolve; assert enabled with name `/refresh ivr now/i`
  - Run `pnpm vitest run src/renderer/src/pages/SettingsPage.test.tsx` — the new test must fail
- [x] **[Green]** Implement — `src/renderer/src/pages/SettingsPage.tsx` _(depends on: Settings Pending State Red ✓)_
  - On the `Refresh IVR now` button (~line 594): `disabled={collectIvrNow.isPending}` and label `{collectIvrNow.isPending ? 'Refreshing IVR…' : 'Refresh IVR now'}`; use the page's existing disabled Tailwind classes — match the `Test connection` button if it has a pending pattern, never inline styles
  - `collectIvrNow` is the existing `useCollectIvrNow()` mutation — no new hook or state
  - Run `pnpm vitest run src/renderer/src/pages/SettingsPage.test.tsx` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/pages/SettingsPage.tsx` _(depends on: Settings Pending State Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - If the neighbouring button already has an identical pending pattern, mirror its exact markup rather than a second variant
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — E2E Harness (depends on Layer 1)

> Runs after the collector Green task — `seedIvr` can only drop its throwaway positions once the collector reads the watchlist.

### E2E Harness Cleanup

**Requires:** Collector Target Selection Green ✓

- [x] **[Red]** No new tests — the existing screener suites are the Red/Green signal _(depends on: Collector Target Selection Green ✓)_
  - Confirm the baseline: `pnpm test:e2e -- e2e/screener-results.spec.ts e2e/screening-criteria.spec.ts` passes before touching the harness (rebuild `better-sqlite3` for Electron first — see `quickstart.md`)
- [x] **[Green]** Implement — `e2e/screener-helpers.ts`, `e2e/ivr-helpers.ts` _(depends on: E2E Harness Cleanup Red ✓)_
  - `seedIvr` in `screener-helpers.ts` (~line 245): remove the `seedActivePosition` loop so it is `setIvrOutcomes(...)` then `collectIvrNow(page)`; drop the now-unused `seedActivePosition` import; rewrite the doc comment (the "collector reads its targets from open positions" sentence is now false)
  - Move `seedWatchlist` from `screener-helpers.ts` to `ivr-helpers.ts` and export it (screener-helpers already imports from ivr-helpers, not the reverse); re-import it in `screener-helpers.ts`
  - Add to `ivr-helpers.ts`: `removeFromWatchlist(page, ticker)` via `window.api.watchlist.remove({ ticker })`; `seedClosedPosition(page, ticker)` = `seedActivePosition` then `window.api.closePosition({ positionId, closePricePerContract: 0.05 })` (`positions:close-csp`, `CloseCspPayloadSchema`)
  - Run `pnpm test:e2e -- e2e/screener-results.spec.ts e2e/screening-criteria.spec.ts e2e/ivr-collector.spec.ts` — all must pass; `IV rank unavailable is shown, not blank` must still see `n/a` for MSFT; the US-44 spec's exact `skippedCount`/`successCount` assertions must be unchanged
- [x] **[Refactor]** `/refactor` — `e2e/screener-helpers.ts`, `e2e/ivr-helpers.ts` _(depends on: E2E Harness Cleanup Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - `seedActivePosition` stays in `ivr-helpers.ts` (still used by `e2e/ivr-collector.spec.ts`); grep `seedIvr` callers — only `launchScreener` should call it
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — E2E Tests

**Requires:** All Green tasks from previous layers ✓

### E2E Tests

- [x] **[Red]** Write failing e2e tests — `e2e/ivr-watchlist-collection.spec.ts` _(depends on: all Green tasks ✓)_
  - Header comment in the style of `e2e/ivr-collector.spec.ts` (`// [US-97] … Each it() maps to exactly one acceptance criterion …`); constants `SAME_DAY_AFTERNOON = '2026-05-29T20:55:00Z'`, `YESTERDAY_AFTERNOON = '2026-05-28T20:55:00Z'`
  - One `it()` per AC bullet from the user story — test names must mirror AC language
  - AC coverage:
    - AC-1: Watchlist underlyings are collected alongside held positions → `it('AC: Watchlist underlyings are collected alongside held positions')` — watchlist `KO`,`AAPL`,`XYZ` + active `MSFT`, all `okOutcome` → batch `{ 4, 0, 0, null }`, rows `['AAPL','KO','MSFT','XYZ']`
    - AC-2: A watchlisted ticker with only a closed position is still collected → `it('AC: A watchlisted ticker with only a closed position is still collected')` — `seedClosedPosition('KO')` + watchlist `KO` → `successCount === 1`, one `KO` row
    - AC-3: A ticker that is both held and watchlisted is collected once → `it('AC: A ticker that is both held and watchlisted is collected once')` — active `AAPL` + watchlist `AAPL` → `successCount === 1`, one `AAPL` row
    - AC-4: A watchlist ticker with no IVR coverage is skipped, not failed → `it('AC: A watchlist ticker with no IVR coverage is skipped, not failed')` — `XYZ → notAvailableOutcome` → `{ successCount: 3, skippedCount: 1, errorCount: 0 }`, rows `AAPL`,`KO`,`MSFT`
    - AC-5: One ticker failing does not suppress the others → `it('AC: One ticker failing does not suppress the others')` — `KO → parseErrorOutcome()` (e2e `IvrOutcome` has no network_error variant; same `errorCount` branch — say so in a comment) → `{ successCount: 3, errorCount: 1, skippedCount: 0 }`, rows `AAPL`,`MSFT`,`XYZ`
    - AC-6: Removing a ticker from the watchlist stops future collection → `it('AC: Removing a ticker from the watchlist stops future collection')` — collect KO at `YESTERDAY_AFTERNOON`; `removeFromWatchlist('KO')`; re-program KO at `SAME_DAY_AFTERNOON`; collect → second `successCount === 0`; rows still exactly `[{ underlying: 'KO', observed_at: YESTERDAY_AFTERNOON, ivr: '38.0' }]`
    - AC-7: The manual collect-now trigger covers the watchlist too → `it('AC: The manual collect-now trigger covers the watchlist too')` — watchlist `TSLA`; `#/settings`; click `Refresh IVR now`; wait for `IVR refresh complete: 1 snapshots saved, 0 errors.`; one `TSLA` row
    - AC-8: A screened candidate shows a real IV rank instead of n/a → `it('AC: A screened candidate shows a real IV rank instead of n/a')` — `launchScreener(dbPath, { fixtures: [KO put], ivr: { KO: 38 } })`, no positions; `rowCells(page, 'KO')[IVR]` starts with `38` (cell is `38 (MMM d)` — mirror `IVR_OBSERVED_LABEL` from `screener-results.spec.ts`)
    - AC-9: A populated IV rank lets the screener's IV floor apply to a bench name → `it("AC: A populated IV rank lets the screener's IV floor apply to a bench name")` — `ivr: { KO: 22 }`; `openCriteriaSheet('header')`, click `[data-testid="iv-rank-floor-on"]`, `setCriteriaValues({ minIvRank: '30' })`, `saveCriteria`, `waitForCriteriaSheetClosed`, `waitForRankedRowCount(0)`; `excludedReason('KO')` contains `IV rank 22.0` **and** `below 30` (the reason embeds the observation date between them — never match the whole string)
  - Run `pnpm test:e2e -- e2e/ivr-watchlist-collection.spec.ts` — with Layer 1–2 Green already in place these should pass on first run; if any fails, the failure points at a real gap — fix production code, not the assertion
- [x] **[Green]** Make e2e tests pass _(depends on: E2E Red ✓)_
  - Run `pnpm test:e2e` — all tests must pass (US-44 `ivr-collector.spec.ts` and the screener suites included)
- [x] **[Refactor]** `/refactor` e2e tests _(depends on: E2E Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - `IVR` column index: `screener-results.spec.ts` defines `const IVR = 9`; share it only if cheap, otherwise keep a local constant with a comment pointing at the source
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for right reason)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] E2E tests cover every AC (9/9)
- [x] `pnpm test && pnpm lint && pnpm typecheck && pnpm format` — all clean
- [x] `/update-spec us-97` — supersede `docs/spec/architecture/02-adrs/active-ivr-targets-from-positions.md`, refresh the US-44 feature page's target-selection wording, note the `iv_rank_floor` consequence on the US-67 page

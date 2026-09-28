---
page: docs/spec/features/us-121-iv-rank-from-own-iv-history.md
audited_at: 2026-09-28
findings: 0
---

# Audit: docs/spec/features/us-121-iv-rank-from-own-iv-history.md

## Verified (34)

- ✓ All listed source files exist (core, `src/main/core/test-fixtures/iv30-bars.ts`, `migrations/016_create_iv30_history.sql`, integrations incl. `fake-clock.ts`, services, IPC, preload, renderer, `e2e/iv-history.spec.ts`, `e2e/ivr-helpers.ts`, `e2e/screener-helpers.ts`, `e2e/trading-day-fixtures.ts`)
- ✓ Deleted files are gone: `src/main/integrations/barchart-ivr-scraper.ts`, `src/main/integrations/fake-ivr.ts`, `src/main/ipc/test-ivr.ts`
- ✓ `black-scholes.ts`: `normalCdf` (`:21`), `blackScholesPrice` (`:31`), `impliedVolatility` (`:54`), bisection bounds `0.001`/`10` (`:16-17`)
- ✓ `iv30-selection.ts`: `MIN_DTE = 7`, `STRIKE_INCREMENTS = [0.5, 1, 2.5, 5]` (`:19-20`), weekly horizon 45 / monthly 70 (`:22-23`), `weeklyCandidates`/`monthlyCandidates`/`selectExpirationPair`/`strikeCandidates`/`planSessionProbe` (`:81-146`)
- ✓ `iv30.ts`: mean of call/put IV (`:83`), total-variance interpolation `lambda`, `w30`, `Math.sqrt(w30 / t30)` (`:90-93`), weekly→monthly `TIERS` (`:25`), `MIN_TRADES_PER_LEG = 1` (`:22`), `IV30_ENGINE_VERSION` (`:19`), `iv30FromInputs` (`:110`), `computeIv30` (`:162`)
- ✓ `iv-metrics.ts`: `RANK_WINDOW_SESSIONS = 252`, `MIN_WINDOW_COVERAGE = 200` (`:3-4`); `computeIvMetrics` returns null below coverage, null rank on flat range, clamp, strictly-below percentile (`:29-56`)
- ✓ `ivr-freshness.ts` reading carries `percentile`/`low`/`high`/`observedAt` (`:25-28`); `watchlist-signal.ts:85` reads a null value as `unknown('IV unavailable')`
- ✓ Migration 016 creates `iv30_reading` and `iv30_gap` keyed `(underlying, session, method)` (`:15,38,44,50`) and drops `ivr_snapshot` (`:55`)
- ✓ `MarketDataProvider.getOptionDailyBars`/`getStockDailyBars` (`market-data-provider.ts:140-142`), implemented in `alpaca-market-data.ts:250,288` and `fake-market-data.ts:295,319`
- ✓ `OPTION_BARS_BATCH_SIZE = 100` (`alpaca-market-data-mappers.ts:315`); shared `fetchPages` (`alpaca-market-data.ts:327`); `feed=sip` (`mappers.ts:314,361`), `adjustment=raw` (`:362`); `end` set only when given (`:340`)
- ✓ Fake provider prices bars with the real `blackScholesPrice` (`fake-market-data.ts:15,199`)
- ✓ `collectIvHistory` (`iv-history.ts:200`): recompute first, `REQUIRED_SESSIONS = RANK_WINDOW_SESSIONS + 1` (253, `:59`), `BAR_SETTLE_MINUTES = 45` (`:77`), `up_to_date` with no request (`:226`), `end` omitted when newest session is today (`:89-92`), newest session never gapped (`:251`); outcomes `collected`/`up_to_date`/`failed`/`no_market_data` (`:44-47`); `recomputeIvHistory` (`:271`)
- ✓ `readIvMetricsByUnderlying` (`iv-history-read.ts:62`) synchronous; imports no market-data port (`:6-11`)
- ✓ `createIvRunState` (`iv-run-state.ts:18`) with `pending|failed|no_market_data` (`:7`); single instance in `src/main/index.ts:204`
- ✓ `iv-rank-lookup.ts`: `lookupOf` (`:27`), `absenceFor` with documented precedence (`:39-43`), `readIvRankLookup` (`:90`); `getAssessedIvrByUnderlying` no longer exists in `src/`
- ✓ `collectIvHistoryBatch` (`ivr-collector.ts:69`): `skippedReason: 'market_data_unavailable'` (`:58`), marks remaining targets `no_market_data` (`:99,154`), `onCompleted` (`:38,75`); no `trigger`/closed-day guard found
- ✓ `ivr:snapshot-updated` sent with `{ ticker }`, null for batch (`src/main/index.ts:206-209`)
- ✓ `ivr-on-demand.ts`: `markPending` before first `await` (`:83-86`), `onSettled` after settle (`:89`), shares `Clock` (`:13`, `src/main/dates.ts:4`) and `CollectorLogger` (`:16`)
- ✓ Calendar store windows 400 back / 70 ahead / 420 & 400 refresh (`trading-calendar-store.ts:29,34,39-40`); refetch on late `first_day` (`:99-107`)
- ✓ `usableIvRanks` in `src/main/services/screener.ts:114`; watchlist rows carry `ivRankAbsence` (`watchlist-snapshot.ts:84-94`)
- ✓ `CollectIvrNowBatchSchema.skippedReason` = `z.enum(['market_data_unavailable']).nullable()` (`src/main/schemas.ts:177`); no `market_closed`
- ✓ `IpcIvRank` nullable `value` + `percentile` (`src/preload/index.d.ts:432-434`), `IpcIvRankAbsence` (`:444`), `IpcIvRankPair` (`:453-455`)
- ✓ Renderer `IvRank`/`IvRankAbsence`/`IvRankPair` in `src/renderer/src/api/ivr.ts:9,21,30`
- ✓ `IvrCell` takes `ivr` pair (`IvrCell.tsx:16`), `animate-wb-pulse` for pending (`:36`), `data-ivr-reason` (`:46`); `ReadingNote` takes `ivr` (`ReadingNote.tsx:16`)
- ✓ Tooltip ends `52-wk IV … · IV percentile …` (`lib/ivr-tooltip.ts:86`); exhaustive `ABSENCE_COPY` (`:111`) with titles matching the page's absence table verbatim (`:111-142`)
- ✓ SettingsPage messages: `IV history refresh complete: N tickers updated, M errors.` and credentials message (`SettingsPage.tsx:511-519`)
- ✓ `_test:iv-series-set`, `_test:iv30-history`, `_test:iv30-gaps`, `_test:daily-bar-requests`, `_test:iv-history-recompute`, `_test:iv30-corrupt`, `_test:table-exists` registered in `src/main/ipc/test-iv-history.ts:22-67`; old channels asserted absent (`test-iv-history.test.ts:167-168`)
- ✓ `e2e/iv-history.spec.ts` has one `it()` per AC row 1–20 by verbatim name (`:237-593`), plus three screener-floor cases (`:635-653`) and five DTE cases (`:697-721`)
- ✓ All 18 linked ADR files under `docs/spec/architecture/02-adrs/` exist
- ✓ Linked pages `schema/tables.md`, `schema/migrations.md`, `domain/market-data.md` (with `## Daily bars (US-121)` at `:380`), `contracts/alpaca-integration.md`, `contracts/ipc-handlers.md`, `contracts/zod-schemas.md`, `.extracts/us-121.md`, `docs/us-121-implementation.md`, and related feature pages us-43/44/97/98/100/116 exist
- ✓ `plans/us-121/` exists

## Drift (0)

None.

## Unverifiable (4)

- ? "Bugs found and fixed during implementation" — historical narrative.
- ? "Known limits" (403 entitlement mapping, strike-grid coverage, rate-limit brushing) — review advisories, not mechanically checkable.
- ? "The reason is display-only: the verdict engine and the screener floor treat every absence as `unknown`" — consistent with `usableIvRanks` and `watchlist-signal.ts:85` but not exhaustively traced.
- ? Anchor `#daily-bars-us-121` depends on the renderer's slug rule for `## Daily bars (US-121)`.

## Missing files (0)

---
page: docs/spec/features/us-97-collect-ivr-for-watchlist-underlyings.md
audited_at: 2026-09-28
findings: 11
---

# Audit: docs/spec/features/us-97-collect-ivr-for-watchlist-underlyings.md

Context: US-121 replaced the Barchart scrape with the app's own IV30 history. The collector is
now `collectIvHistoryBatch` → `collectIvHistory` over Alpaca daily bars. The target-list half of
this page still matches the code. The scraper-mechanics half is written in the present tense and
no longer does.

## Verified (13)

- ✓ `COLLECTION_TARGETS_QUERY` is the `positions WHERE status != 'CLOSED' UNION watchlist` statement, `src/main/services/ivr-collector.ts:41-48`.
- ✓ `listCollectionTargets` exists and does the `toUpperCase()` → `Set` → `localeCompare` pipeline, `ivr-collector.ts:61-67`; `listActiveUnderlyings` is gone (grep finds nothing).
- ✓ There is a per-ticker `try/catch` around the fetch, with a warn log `ivr_collection_ticker_failed`, `ivr-collector.ts:123-137`.
- ✓ A DB error is deliberately not isolated. `Database.SqliteError` is rethrown, `ivr-collector.ts:133` (the page names it `persistSnapshot`; see Drift).
- ✓ An abort at the next ticker boundary on quit uses `signal?.aborted`, `ivr-collector.ts:109-115`.
- ✓ `PollingScheduler` catches a rejected handler and returns `undefined`, `src/main/services/polling-scheduler.ts:146-148`. `runNow` joins an in-flight run (`:287`) and a firing tick skips one (`:203`).
- ✓ The `ivr:collect-now` IPC is registered in `src/main/ipc/ivr.ts:8`.
- ✓ The Settings button is disabled while pending and reads `Refreshing IVR…`, `src/renderer/src/pages/SettingsPage.tsx:568-571`.
- ✓ `seedWatchlist`, `removeFromWatchlist` and `seedClosedPosition` are in `e2e/ivr-helpers.ts:261,284,293`, and `e2e/screener-helpers.ts:28` imports from `./ivr-helpers`.
- ✓ `seedIvr` and `assertIvrTickersCollectible` are in `e2e/screener-helpers.ts:292,254`.
- ✓ `e2e/ivr-watchlist-collection.spec.ts` exists with 9 AC-named `it()` cases (`:107-271`).
- ✓ `e2e/ivr-collector.spec.ts` seeds no watchlist rows (grep for `seedWatchlist`/`watchlist` finds nothing).
- ✓ All linked pages and ADRs exist: us-43, us-44, us-65, us-67, us-98, `union-ivr-targets-positions-and-watchlist.md`, `ivr-collector-per-ticker-failure-isolation.md`.

## Drift (8)

- ✗ Lines 66-70 say "The scraper… `fetchIVR` parses the response body outside a `try`…". Neither `fetchIVR` nor a scraper exists in `src/` (grep for `fetchIVR`/`barchart`/`scrap` finds nothing). The loop calls `collectIvHistory` (`ivr-collector.ts:124`), which "already turns provider and engine errors into outcomes" (`:119-122`). Suggested fix: restate the rationale for the catch against `collectIvHistory`, or mark the scraper detail as US-97-era history.
- ✗ Lines 70-71 name a `persistSnapshot` throw. No `persistSnapshot` exists; the non-isolated case is now any `Database.SqliteError`, `ivr-collector.ts:133`.
- ✗ Lines 72-73 say "the market-status read at the top degrades (assume trading day) when the broker is unreachable". The collector has no market-status read and no closed-day guard at all: "There is no closed-day guard", `ivr-collector.ts:5-7`. Its only up-front I/O is `refreshTradingCalendar` on the `MarketDataProvider` (`:90`). The page's own line 120-122 note (US-98) is also superseded by US-121.
- ✗ Lines 89-92 say collection is "paced by the scraper's internal 1 req/s rate limiter" at about one second per watchlist name. No scraper or 1 req/s limiter exists. Collection is now Alpaca bar requests via `collectIvHistory`, so the runtime model is stale.
- ✗ Lines 32-34 and 95-97 are present-tense Barchart claims ("Barchart does not cover XYZ", "uncovered by Barchart… the `not_available` path"). The outcome set is now `collected` / `up_to_date` / `failed` / `no_market_data` (`ivr-collector.ts:141-157`), with no `not_available`. The e2e AC was renamed "A watchlist ticker with no bar data → n/a, others unaffected" (`e2e/ivr-watchlist-collection.spec.ts:169`). `skippedCount` now counts `up_to_date` (`ivr-collector.ts:21`), so the "3 succeeded, 1 skipped" semantics differ.
- ✗ Lines 115-119 say "`getLatestIvrByUnderlying` returns the newest row…" and that US-98 "adds `getAssessedIvrByUnderlying`". Neither symbol exists in `src/`. The read path is `readIvRankLookup` (`src/main/services/iv-rank-lookup.ts:90`) and `readIvMetricsByUnderlying` (`src/main/services/iv-history-read.ts:62`).
- ✗ Line 106 cites `assertClearOffsetUsable` as an existing helper in the screener-helpers file. grep across `e2e/` finds no such symbol.
- ✗ Line 46 (AC) gives the exclusion reason as `IV rank 22.0 below 30`. The code now embeds the observation date, `IV rank ${value} (${formatObservedOn(observedAt)}) below ${minIvRank}` (`src/main/core/screener.ts:288`), and the unit test expects `IV rank 22.0 (${IVR_OBSERVED_LABEL}) below 30` (`screener.test.ts:344`).

## Unverifiable (3)

- ? "The production change is one SQL statement plus per-ticker failure isolation… No migration" (lines 16-19) is a claim about the US-97 diff that is historical and not checkable against the current tree.
- ? The runtime estimate ("25-name watchlist… ~30 second run") is narrative and depends on the retired pacing.
- ? The reasoning about US-96 criteria depending on snapshots (lines 12-14) is narrative.

## Missing files (0)

- All cited source paths exist, including `plans/us-97/`, `src/main/services/ivr-collector.ts`, `src/renderer/src/pages/SettingsPage.tsx`, `e2e/ivr-watchlist-collection.spec.ts`, `e2e/ivr-helpers.ts` and `e2e/screener-helpers.ts`.

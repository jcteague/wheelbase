---
page: docs/spec/features/us-98-ivr-staleness-tiers.md
audited_at: 2026-09-28
findings: 15
---

# Audit: docs/spec/features/us-98-ivr-staleness-tiers.md

Context: US-121 replaced the Barchart snapshot store with `iv30_reading` (migration 016) and
moved the exchange calendar onto `MarketDataProvider`. The freshness engine, the tiers and the
earnings split still match the code. The collector-gating, store and test-seam sections do not.

## Verified (17)

- ✓ `e2e/ivr-staleness.spec.ts` holds 13 AC-named `it()` cases (`:70-356`). AC6 is renamed "An expired reading shows exp and behaves as no reading" (`:188`), as the page states.
- ✓ The pure calendar engine exports `etDateOf` (`src/main/core/trading-calendar.ts:76`), `etInstantAt` (`:103`), `getTradingSession` (`:141`), `getMostRecentCompletedSession` (`:150`) and `countCompletedSessionsAfter` (`:164`), plus the `TradingCalendar` type (`:25`).
- ✓ The tier constants are `FRESH_MAX_AGE = 1`, `AGING_MAX_AGE = 3` and `STALE_MAX_AGE = 10` (`src/main/core/ivr-freshness.ts:11-13`). These match the 0–1 / 2–3 / 4–10 / >10 table.
- ✓ The `IvRankState` union includes `predates_earnings` (`ivr-freshness.ts:16-20`). `isUsableState` is at `:38` and the three-state `IvRankAssessment` at `:51`.
- ✓ `readTradingCalendar` (`src/main/services/trading-calendar-store.ts:90`) and `refreshTradingCalendar` (`:192`) exist.
- ✓ The weekly refresh is `REFRESH_INTERVAL_DAYS = 7` (`trading-calendar-store.ts:43`) and the refresh covers 400 days ahead (`:40`).
- ✓ The coverage-expiry warning fires 30 days ahead, `COVERAGE_WARNING_DAYS = 30` (`trading-calendar-store.ts:47,141`).
- ✓ `migrations/014_add_last_earnings.sql` and `migrations/015_create_trading_session.sql` exist, and the schema anchors `tables.md#earnings_date` (`:676`) and `#trading_session` (`:756`) exist.
- ✓ `fetchEarningsCalendar` exists with a 30-day lookback, `EARNINGS_LOOKBACK_DAYS = 30` (`src/main/integrations/finnhub-earnings.ts:13,65`). `fetchNextEarnings` is gone.
- ✓ `getEarningsCalendar` and `getEarnings` are in `src/main/services/earnings-dates.ts`. `EarningsCalendarRead` and `WHEELBASE_MOCK_EARNINGS` are in `fake-earnings.ts`.
- ✓ `screenWatchlistCandidates` and `rankCandidates` are wired in `src/main/services/screener.ts`. Only usable readings reach the engine map: `!isUsableState(ivRank.state)` is filtered out (`screener.ts:116-118`).
- ✓ `IvrCell` sets `data-ivr-state` and uses `formatIvrValue` (`src/renderer/src/components/IvrCell.tsx`). `fmtIvr` is retired (grep finds nothing).
- ✓ The `testIvrSetNow` preload bridge maps to `_test:ivr-set-now` (`src/preload/index.ts:100`).
- ✓ The holiday no-fetch regression lives in `e2e/ivr-collector.spec.ts:218`.
- ✓ All eight linked ADRs exist under `docs/spec/architecture/02-adrs/`.
- ✓ The linked feature pages exist: us-66, us-67, us-70, us-96, us-97, us-44 and us-100.
- ✓ The linked contract pages exist: `alpaca-integration.md` and `ipc-handlers.md`.

## Drift (7)

- ✗ Lines 84 and 215 put `getMarketCalendar` on `BrokerProvider`. It now lives on `MarketDataProvider` (`src/main/integrations/market-data-provider.ts:137`), is implemented at `alpaca-market-data.ts:235` and `fake-market-data.ts:277`, and the collector passes `marketDataProvider` to `refreshTradingCalendar` (`ivr-collector.ts:90`). Line 85 ("a screen must not hang on the broker") also carries the old framing. Suggested fix: re-home the contract bullet to MarketDataProvider.
- ✗ Lines 85-88 give the windows as reads of "45 days back through 2 ahead" and refreshes of "120 days back". The code has `READ_LOOKBACK_DAYS = 400`, `READ_LOOKAHEAD_DAYS = 70` and `REFRESH_LOOKBACK_DAYS = 420` (`trading-calendar-store.ts:29,34,39`). They were likely widened for the US-121 52-week IV window.
- ✗ Lines 163-172 ("Collection is gated on the calendar") and line 209 (ADR amended so the guard reads the cached calendar) no longer hold. `collectIVRSnapshots` does not exist. The batch is `collectIvHistoryBatch` (`ivr-collector.ts:69`), whose header says "There is no closed-day guard" (`:5-7`). The `market_closed` skip is gone: `skippedReason` is only `'market_data_unavailable' | null` (`:22`), and `src/main/ipc/ivr.test.ts:87` asserts the retired `market_closed` reason is rejected.
- ✗ Line 224 cites `getAssessedIvrByUnderlying` (new). It does not exist in `src/`. The assessed read is `readIvRankLookup` (`src/main/services/iv-rank-lookup.ts:90`).
- ✗ Lines 176-178 cite `createFakeIvrCollaborators()` behind the `test-ivr` seam. That symbol does not exist. The seam is now `src/main/ipc/test-iv-history.ts` (registered at `src/main/index.ts:19`) together with `src/main/integrations/fake-clock.ts` (`WHEELBASE_FAKE_NOW`, `_test:ivr-set-now`).
- ✗ The Watchlist Signal section and its status lines are internally inconsistent. Lines 183-200 are headed "(planned — blocked on US-96)", line 228-229 says "not yet wired" and line 282 says "Not yet created". The page's own status block (lines 10-13) says US-96 shipped and AC13 ("Signal refuses to claim entry readiness…") is tested, and `e2e/ivr-staleness.spec.ts:356` confirms it. Also, `deriveSignal` is not found in `src/`. Suggested fix: drop the "planned" framing and name the shipped module.
- ✗ Lines 241-247 are present-tense Barchart and scrape claims ("Barchart serves the last close", "warns `ivr_observation_unstamped`", "the instant the scrape happened"). `ivr_observation_unstamped` is not in `src/`. Readings are now `iv30_reading` rows whose `observed_at` is the "ISO instant of the session's close" (`migrations/016_create_iv30_history.sql`), and the migration header says it replaces the Barchart scrape.

## Unverifiable (4)

- ? "The tier boundaries are still the _proposed_ values: trader validation is an open prerequisite" is a process status.
- ? The `screener:results` shape `ranked[].ivRank` → `{ value, observedAt, ageTradingDays, state }` (line 218-219) could not be confirmed mechanically. `RankedCandidate` is now `Omit<ScoredCandidate,'ivRank'> & IvRankPair` (`src/main/services/screener.ts:38`), so the exact field set needs a human check against `IvRankPair`.
- ? "A successfully fetched date is returned even when its cache write fails" and "a cached `next_earnings` in the past is recovered as last-print knowledge" are behavioural claims. They need unit-test review, not a grep.
- ? "Both the snapshot read and the earnings read degrade internally" is plausible but needs a read of `screener.ts` error paths.

## Missing files (4)

- ✗ `src/main/services/ivr-snapshots.ts` does not exist; it was superseded by `iv-history-store.ts`, `iv-history-read.ts` and `iv-rank-lookup.ts`.
- ✗ `src/main/integrations/fake-ivr.ts` does not exist (see `fake-clock.ts` and the fake IV series).
- ✗ `src/main/ipc/test-ivr.ts` does not exist (now `src/main/ipc/test-iv-history.ts`).
- ✗ `src/renderer/src/components/ScreenerResultsTable.tsx` does not exist; US-96 folded the screener into the Watchlist bench.

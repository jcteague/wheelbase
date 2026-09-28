---
page: docs/spec/features/us-116-market-facts-from-market-data-provider.md
audited_at: 2026-09-28
findings: 2
---

# Audit: docs/spec/features/us-116-market-facts-from-market-data-provider.md

## Verified (24)

- ✓ `BrokerProvider` is exactly `getAccountInfo` + `getActivities` — `src/main/integrations/broker-provider.ts:47-50`
- ✓ `BrokerErrorCode` keeps `'environment_mismatch'`, still produced by `getAccountInfo` — `broker-provider.ts:5`, `src/main/integrations/alpaca-broker.ts:100,106`
- ✓ `getMarketStatus()` / `getMarketCalendar(range)` on `MarketDataProvider` with `MarketStatus`, `MarketCalendarDay`, `MarketCalendarRange` — `src/main/integrations/market-data-provider.ts:77,87,93,134-137`
- ✓ `MarketStatusSource` / `MarketCalendarSource` slices — `market-data-provider.ts:154,157`; used by polling scheduler (`src/main/services/polling-scheduler.ts:1,112`, `scheduler-instance.ts:6,23`) and trading-calendar store (`src/main/services/trading-calendar-store.ts:21,194,258`)
- ✓ `AlpacaMarketDataProvider.getMarketStatus/getMarketCalendar` — `src/main/integrations/alpaca-market-data.ts:223,235`
- ✓ `buildClockUrl`, `buildCalendarUrl`, `mapClock`, `mapCalendarDays`, `deriveSession`, `parseOffsetMinutes` in `alpaca-market-data-mappers.ts:280,284,292,301,265,257`, using `ALPACA_TRADING_BASE_URLS[environment]` (`:281,289`)
- ✓ `ensureTradingCalendar(db, getProvider, now)` — `trading-calendar-store.ts:256`; awaited by `buildWatchlistSnapshot` (`src/main/services/watchlist-snapshot.ts:145`) and `screenWatchlistCandidates` (`src/main/services/screener.ts:275`)
- ✓ `readTradingCalendar` / `refreshTradingCalendar` — `trading-calendar-store.ts:90,192`
- ✓ IVR collector still calls `refreshTradingCalendar` directly — `src/main/services/ivr-collector.ts:88-90`
- ✓ `market-data:market-status` channel — `src/main/ipc/market-data.ts:88`; preload `invoke('market-data:market-status')` — `src/preload/index.ts:56`; `broker:market-status` no longer registered (`src/main/ipc/broker.ts:9,16`)
- ✓ `useMarketStatusDisplay` gates on `marketData === 'configured'`, field `hasMarketData` — `src/renderer/src/hooks/useMarketStatusDisplay.ts:12,22`
- ✓ `fallbackBroker`, `getSafeBroker`, `brokerFactory` absent from `src/main/services/scheduler-instance.ts`
- ✓ `FakeMarketDataProvider` serves `getMarketStatus`/`getMarketCalendar` from `FAKE_MARKET_STATUS` / `FAKE_MARKET_CALENDAR`, and `FAKE_MARKET_CALENDAR_ERROR` fails only the calendar — `src/main/integrations/fake-market-data.ts:218-221,272-289`
- ✓ `FakeBrokerProvider` has no market methods (grep of `fake-broker.ts` for `getMarketStatus|getMarketCalendar` empty); `FAKE_BROKER_CALENDAR` absent from `src/` and `e2e/`
- ✓ `IvrLaunchOpts.marketCalendar` and `marketDataWithoutBroker` — `e2e/ivr-helpers.ts:177,184,189,211`
- ✓ `_test:market-calendar-fetch-count` — `src/main/ipc/test-iv-history.ts:82`
- ✓ `assignments:run-detection-now` — `src/main/ipc/assignments.ts:35`
- ✓ `e2e/market-facts-without-broker.spec.ts` has all eight verbatim-named `it(...)` tests — lines 123,138,158,178,197,223,237,267
- ✓ CLAUDE.md records the broker-is-optional rule (Architecture Rules section)
- ✓ ADRs `trading-calendar-fetched-and-cached`, `market-status-pill`, `scheduler-singleton-safe-broker` exist
- ✓ Linked feature pages us-98, us-99, us-96, us-32 exist
- ✓ `docs/spec/.extracts/us-116.md` exists
- ✓ `docs/us-116-implementation.md` exists
- ✓ No migration for US-116 (latest migration `016_create_iv30_history.sql` is US-121)

## Drift (2)

- ✗ Line 54: `MarketCalendarSource` is said to be taken by "the trading-calendar store **and the IVR collector**". The collector now takes the full `MarketDataProvider` (`src/main/services/ivr-collector.ts:10,28`) since US-121 also needs daily bars. Suggested fix: drop "and the IVR collector".
- ✗ Line 27 (and the table at line 22): "IV rank is scraped from Barchart with no credentials at all" is phrased in the present tense; US-121 retired the Barchart scrape and computes IV rank from the app's own IV30 history via `getOptionDailyBars`/`getStockDailyBars` (`market-data-provider.ts:139-143,160-163`), which does need market-data credentials. The same paragraph's 2026-09-13 observation (`ivr_snapshot` 0 rows) is dated history and is fine. Suggested fix: rephrase to "was scraped" with a pointer to US-121.

## Unverifiable (5)

- ? "The unconfigured-install scheduler status never actually parks" (`nextOpen` stamped at module load) — behavioural limitation, not mechanically checked.
- ? "`buildWatchlistSnapshot` resolves the provider twice" — plausible (`watchlist-snapshot.ts:145` passes `getProvider`), second resolution in `readQuotes` not confirmed.
- ? "`mapClock` / `mapCalendarDays` trust the vendor payload shape" — code-review judgement.
- ? AC 5 warn-level / AC 1 negative-log clauses pinned by `trading-calendar-store.test.ts` — test content not inspected.
- ? `watchlist-bench.spec.ts` injects the outage after seeding — not inspected.

## Missing files (0)

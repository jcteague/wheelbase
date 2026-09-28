---
page: docs/spec/architecture/02-adrs/market-data-provider-interface.md
audited_at: 2026-09-28
findings: 12
---

# Audit: docs/spec/architecture/02-adrs/market-data-provider-interface.md

## Verified (9)

- ✓ `MarketDataProvider` declared as a `type` — `src/main/integrations/market-data-provider.ts:130`.
- ✓ `getStockQuotes`, `getOptionSnapshot`, `getOptionChainSnapshot(filter)`, `supportsStreaming`, `connect`, `disconnect`, `stream(...): Observable<StreamEvent<StockQuote | OptionSnapshot>>` — `market-data-provider.ts:131-149`.
- ✓ `OptionChainFilter` carries `underlying`, `expirationFrom/To`, `type`, `strikeFrom/To`, `limit`, `cursor` — `market-data-provider.ts:64-73`.
- ✓ `getMarketStatus` and `getMarketCalendar` on `MarketDataProvider` (`:134,137`); `market-data:market-status` served (`src/main/ipc/market-data.ts:90`); trading-calendar store calls `getMarketCalendar` directly (`src/main/services/trading-calendar-store.ts:203`).
- ✓ `BrokerProvider` is exactly `getAccountInfo` + `getActivities` — `src/main/integrations/broker-provider.ts:46-49`; no `broker:market-status` channel registered.
- ✓ `marketDataFactory` exposes `configure` (resets cache; default `loadAlpacaCredentialsFromEnv`), cached `create()`, `recreate(): void`, `disconnect()` — `src/main/integrations/market-data-factory.ts:11-41`.
- ✓ `create()` returns `FakeMarketDataProvider` when `FAKE_MARKET_DATA === 'true'`, else `new AlpacaMarketDataProvider({ loadCredentials })`, never throws — `market-data-factory.ts:17-22`.
- ✓ Massive-era config/loader/throw no longer exist — grep for `massive` (case-insensitive) in non-test `src/` is empty. Vendor history (Alpaca → Massive → Alpaca) framed correctly.
- ✓ Cited files exist: `alpaca-market-data.ts`, `alpaca-market-data-mappers.ts`, `alpaca-credentials.ts`, `plans/us-99/contracts/alpaca-market-data.md`, `plans/market-data-massive-migration/research.md`, feature pages us-31 and us-99.

## Drift (1)

- ✗ "The interface surface" list (lines 9-15) omits `getOptionDailyBars(input: { symbols } & DailyBarRange): Promise<Map<string, DailyBar[]>>` and `getStockDailyBars(input: { symbol } & DailyBarRange): Promise<DailyBar[]>` added by US-121 (`src/main/integrations/market-data-provider.ts:140,142`), and lists `getMarketStatus`/`getMarketCalendar` only in prose. Suggested fix: add the daily-bar and calendar methods to the surface list (and `us-121` to the generated-from sources).

## Unverifiable (1)

- ? "swapped twice with no change to the IPC layer, hooks, or UI" — historical claim.

## Missing files (2)

- ✗ `plans/us-31/data-model.md` — `plans/us-31/` no longer exists (plan dirs retired).
- ✗ `plans/us-31/plan.md` Area 5 — same.

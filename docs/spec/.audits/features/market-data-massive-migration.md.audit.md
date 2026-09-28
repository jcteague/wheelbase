---
page: docs/spec/features/market-data-massive-migration.md
audited_at: 2026-09-28
findings: 2
---

# Audit: docs/spec/features/market-data-massive-migration.md

The page is explicitly framed as a superseded, Massive-era history record (banner, lines 5-15).
Body claims about `MassiveMarketDataProvider`, `massive-credentials.ts`, `MASSIVE_API_KEY`,
the single `wss://delayed.massive.com` socket and the throwing factory are history and are not
scored as drift. Only the banner's "still true today" claims and link targets are audited.

## Verified (12)

- ✓ `MarketDataProvider` is a provider-agnostic `type` — `src/main/integrations/market-data-provider.ts:130`
- ✓ `marketDataFactory` exposes `configure({ loadActiveAlpacaCredentials })`/`create()`/`recreate()`/`disconnect()` and never throws (fake when `FAKE_MARKET_DATA==='true'`, else `AlpacaMarketDataProvider`) — `src/main/integrations/market-data-factory.ts:7-42`
- ✓ Massive removed: grep for `massive|Massive` in `src/` and `e2e/` finds nothing; `massive-market-data.ts` / `massive-credentials.ts` absent
- ✓ `AlpacaMarketDataProvider` serves the interface — `market-data-factory.ts:2,24`
- ✓ Six-member `MarketDataErrorCode` — `market-data-provider.ts:6-12`
- ✓ `MarketDataError` and `MarketDataFeed` defined in `market-data-provider.ts:14,112`
- ✓ `integration-errors.ts` exports only `isNetworkError` — `src/main/integrations/integration-errors.ts:1`
- ✓ `BrokerError` in `src/main/integrations/broker-provider.ts:9`
- ✓ `buildOccSymbol` shared leaf in `src/shared/option-symbol.ts`; `src/main/core/option-symbol.ts:1-6` is a re-export
- ✓ `broker:account`, `broker:activities` registered — `src/main/ipc/broker.ts:9,16`; `broker:account-info` absent from `src/`
- ✓ `market-data:*` channels `stock-quotes`, `set-stock-quote-tickers`, `stock-quote`, `stream-error`, `option-snapshots`, `option-snapshot`, `option-chain` — `src/main/ipc/market-data.ts:37-80`
- ✓ `@msgpack/msgpack` still a dependency — `package.json:34`; `STALE_THRESHOLD_MS` — `src/renderer/src/hooks/useStockQuotes.ts:17`

## Drift (2)

- ✗ Banner line 13 lists "the `BrokerProvider` / `broker:*` split" and "the `market-data:*` channel set" as still true today, but US-116 moved market status off the broker: `BrokerProvider` now has only `getAccountInfo`/`getActivities` (`src/main/integrations/broker-provider.ts:47-50`), `broker:market-status` is no longer registered (`src/main/ipc/broker.ts`), and `market-data:market-status` exists (`src/main/ipc/market-data.ts:88`). The history body (lines 109-110, 189-191) is fine as history, but the "still true" list is misleading without a US-116 pointer.
- ✗ Banner's "still true" `MarketDataProvider` type has since grown `getMarketStatus`, `getMarketCalendar`, `getOptionDailyBars`, `getStockDailyBars` (`market-data-provider.ts:134-143`). Minor; add a pointer to domain/market-data for the current shape.

## Unverifiable (2)

- ? "Massive supplies the needed delayed stock + option data on a simpler REST-plus-single-socket surface" — historical rationale.
- ? Massive-era endpoint paths, auth frames and `Retry-After` behaviour — code removed; history only.

## Missing files (0)

- All links resolve (us-99, us-31, us-32, us-39, domain/market-data, contracts/alpaca-integration, contracts/ipc-handlers, and the seven ADRs). Massive-era source files listed in "Source files" are gone as the banner states; not counted.

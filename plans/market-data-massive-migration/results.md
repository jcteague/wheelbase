# Results — Market-Data Migration (authoritative current state)

What actually ships in `src/` today. This is the authoritative record for the
market-data layer (newer than, and superseding, US-31/US-32/US-39).

## Source files (verified present)

- `src/main/integrations/market-data-provider.ts` — `MarketDataProvider`
  interface, `MarketDataFeed`, `MarketDataError` / `MarketDataErrorCode`
- `src/main/integrations/massive-market-data.ts` — `MassiveMarketDataProvider`,
  `MassiveMarketDataConfig` (REST + single JSON WebSocket)
- `src/main/integrations/fake-market-data.ts` — `FakeMarketDataProvider`
  (`FAKE_MARKET_DATA`, `FAKE_MARKET_DATA_ERROR`)
- `src/main/integrations/market-data-factory.ts` — `marketDataFactory`
- `src/main/integrations/integration-errors.ts` — shared error helpers
- `src/main/integrations/alpaca-broker.ts` — `AlpacaBrokerProvider` (broker only)
- `src/main/integrations/broker-provider.ts`, `broker-factory.ts` — broker iface + factory
- `src/main/ipc/market-data.ts` — `market-data:*` channels
- `src/main/ipc/broker.ts` — `broker:account`, `broker:market-status`, `broker:activities`
- `src/shared/option-symbol.ts` — `buildOccSymbol` (re-exported by `src/main/core/option-symbol.ts`)

## Removed / no longer present

- `AlpacaMarketDataProvider` and `src/main/integrations/alpaca-market-data.ts`
  (and its tests / `.e2e.test.ts`) — removed. `AlpacaBrokerProvider`
  (`alpaca-broker.ts`) is the only surviving `Alpaca*` class.
- `createMarketDataProvider(config)` / `MarketDataConfig` /
  `provider:'alpaca'` union — replaced by `marketDataFactory`.
- `broker:account-info` channel — renamed to `broker:account`.
- Two-socket Alpaca streaming, OPRA option feed, and MessagePack/msgpack framing
  — replaced by the single Massive JSON socket. `@msgpack/msgpack` is unused.

## Notable behavior

- Streaming is **fully implemented** (`connect()` / `stream()` / `disconnect()`
  over the Massive socket); it does not throw `streaming_unsupported` for
  supported feeds.
- The bulk `market-data:option-snapshots` channel was **retained**; singular and
  chain channels were added alongside it.
- Renderer reads quotes via the namespaced preload bridge
  (`window.api.marketData.*`) and market status via `window.api.broker.*`;
  per-tick pushes arrive through `onStockQuote` / `onStreamError`.
- `STALE_THRESHOLD_MS` for quote staleness lives in
  `src/renderer/src/hooks/useStockQuotes.ts`.

# Research & Architecture Decisions — Market-Data Migration (Alpaca → Massive)

These decisions describe the **current** market-data architecture and supersede
the Alpaca-era rationale recorded in US-31/US-32/US-39.

## ADR: Massive replaces Alpaca as the market-data provider

- **Decision:** Live quotes and option snapshots come from **Massive** (a
  Polygon-compatible delayed-data vendor) via `MassiveMarketDataProvider`
  (`src/main/integrations/massive-market-data.ts`). The original
  `AlpacaMarketDataProvider` was removed. The interface contract in
  `src/main/integrations/market-data-provider.ts` is provider-agnostic, so the
  swap touched only the concrete implementation + factory.
- **Why:** Massive provides the needed delayed stock + option data on a simpler
  REST-plus-single-socket surface, decoupled from the Alpaca SDK.
- **Superseded:** US-31/US-39 ADRs that named `AlpacaMarketDataProvider`, the
  Alpaca SDK for REST, and Alpaca feed URLs.

## ADR: REST over `fetch`, key as query param

- **Decision:** REST calls hit `https://api.massive.com` using the built-in
  `fetch`, with the API key passed as an `apiKey` query parameter (not a Bearer
  header and not via an Alpaca SDK client). Stock snapshots use
  `/v2/snapshot/locale/us/markets/stocks/tickers/{ticker}`.
- **Why:** No SDK dependency; Massive's API is a plain REST surface. `StockQuote`
  carries `prevClose` and a 4-dp `changePercent` derived from the snapshot's
  previous-day bar.

## ADR: Single JSON WebSocket for streaming (replaces two-socket / MessagePack)

- **Decision:** Streaming uses one WebSocket, `wss://delayed.massive.com/stocks`,
  exchanging JSON frames: `{ action: 'auth', params: <apiKey> }` then
  `{ action: 'subscribe', params: 'AM.*' }` (aggregate-minute messages).
- **Why:** Massive multiplexes on one socket with JSON framing.
- **Superseded:** the Alpaca two-socket design (separate stock/option sockets),
  the OPRA option feed, and MessagePack/msgpack framing — none of which exist in
  the current code. `@msgpack/msgpack` is no longer used.

## ADR: Env-switched `marketDataFactory` (replaces `createMarketDataProvider`)

- **Decision:** `marketDataFactory` (`src/main/integrations/market-data-factory.ts`)
  exposes `configure()`, `create()`, `recreate()`, and `disconnect()`. It returns
  the `FakeMarketDataProvider` when `FAKE_MARKET_DATA === 'true'`, otherwise a
  `MassiveMarketDataProvider` built from `MASSIVE_API_KEY`; it throws
  "Market data provider not configured…" when neither is set.
- **Why:** Centralizes provider selection behind env config and gives e2e a
  deterministic in-process fake. Replaces the original
  `createMarketDataProvider(config)` + `MarketDataConfig` + `provider:'alpaca'`
  discriminated union.
- **Superseded:** the US-31/US-32 factory ADRs.

## ADR: Broker concerns split onto a dedicated `broker:*` namespace

- **Decision:** Account, market clock/session, and activities were removed from
  the `MarketDataProvider` interface and live on a separate `BrokerProvider`
  (`AlpacaBrokerProvider`, `src/main/integrations/alpaca-broker.ts`) exposed on
  `broker:account`, `broker:market-status`, and `broker:activities`. Quote and
  option reads remain on `market-data:*`.
- **Why:** Market data and broker are distinct vendors with distinct lifecycles
  (the broker stays Alpaca; market data moved to Massive). Splitting the
  interfaces keeps each provider cohesive. There is no `market-data:market-status`
  channel — market status is a broker concern (`broker:market-status`).
- **Superseded:** US-32/US-39 ADRs that documented account/status under
  `market-data:*` or the channel `broker:account-info` (now `broker:account`).

## ADR: Bulk option-snapshots channel retained, singular + chain added

- **Decision:** `market-data:option-snapshots` (bulk) was **retained**; the
  singular `market-data:option-snapshot` and `market-data:option-chain` channels
  were **added** alongside it. The provider method is singular
  `getOptionSnapshot` plus `getOptionChainSnapshot`.
- **Why:** Different call sites need single-contract, bulk, and full-chain reads.
- **Superseded:** the US-39 claim that the bulk endpoint was deleted/replaced.

## ADR: Structured `MarketDataError` codes, HTTP-mapped

- **Decision:** Provider failures throw `MarketDataError` with a
  `MarketDataErrorCode` of `auth_failed | network_error | not_found |
rate_limited | streaming_unsupported`, mapped from HTTP status. There is no
  `stream_disconnected` or `subscription_failed` code.
- **Why:** Stable, renderer-actionable error vocabulary independent of vendor.

## ADR: `MarketDataFeed` type; `buildOccSymbol` shared leaf

- **Decision:** The feed union is named `MarketDataFeed`
  (`'stockQuotes' | 'optionQuotes' | 'optionTrades'`). `buildOccSymbol` lives in
  the shared leaf `src/shared/option-symbol.ts`; `src/main/core/option-symbol.ts`
  re-exports it for main-process callers and the renderer imports it from shared.
- **Why:** One OCC builder usable from both processes; renamed feed type for
  clarity.
- **Superseded:** the `DataFeed` name and the `src/main/core/option-symbol.ts`
  "definition" claim (it is now a re-export).

## Open questions

None — this records shipped state.

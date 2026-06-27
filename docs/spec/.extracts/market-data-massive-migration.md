---
plan: market-data-massive-migration
source: plans/market-data-massive-migration/
extracted_at: 2026-06-27
status: complete
supersedes: [us-31, us-32, us-39]
---

# Extract: market-data-massive-migration

> Retro plan: authoritative current-state record for the market-data provider
> layer. Supersedes the market-data portions of us-31, us-32, us-39 (Alpaca-era).

## Summary

The live market-data layer was migrated from Alpaca's market-data API to the **Massive** provider (a Polygon-compatible delayed-data vendor). A provider-agnostic `MarketDataProvider` interface, an env-switched `marketDataFactory`, and a `MassiveMarketDataProvider` (REST over `fetch` + a single JSON WebSocket) replace the original `AlpacaMarketDataProvider`. In the same change the broker concerns (account, market clock/session, activities) were split out of the market-data interface into a separate `BrokerProvider` (`AlpacaBrokerProvider`) on a dedicated `broker:*` IPC namespace, while quote/option reads stay on `market-data:*`. No database or schema changes — integration/IPC-layer only. The broker remains Alpaca; only the market-data vendor changed. (`plans/market-data-massive-migration/plan.md`, `results.md`)

## Architecture Decisions

### ADR: Massive replaces Alpaca as the market-data provider

- **Decision:** Quotes and option snapshots come from Massive via `MassiveMarketDataProvider` (`src/main/integrations/massive-market-data.ts`); `AlpacaMarketDataProvider` was removed. The interface (`src/main/integrations/market-data-provider.ts`) is provider-agnostic, so only the concrete impl + factory changed.
- **Why:** Massive supplies the needed delayed stock + option data on a simpler REST-plus-single-socket surface, decoupled from the Alpaca SDK.
- **Supersedes:** us-31/us-39 ADRs naming `AlpacaMarketDataProvider`, the Alpaca SDK for REST, and Alpaca feed URLs.
- **Source:** `plans/market-data-massive-migration/research.md`

### ADR: REST over `fetch`, key as query param

- **Decision:** REST hits `https://api.massive.com` via built-in `fetch`, key passed as an `apiKey` query param (no Bearer header, no SDK client); stock snapshots use `/v2/snapshot/locale/us/markets/stocks/tickers/{ticker}`.
- **Why:** No SDK dependency; plain REST. `StockQuote` carries `prevClose` and a 4-dp `changePercent` from the previous-day bar.
- **Source:** `plans/market-data-massive-migration/research.md`

### ADR: Single JSON WebSocket for streaming (replaces two-socket / MessagePack)

- **Decision:** One WebSocket `wss://delayed.massive.com/stocks`, JSON frames — `{action:'auth',params:<apiKey>}` then `{action:'subscribe',params:'AM.*'}` (aggregate-minute).
- **Why:** Massive multiplexes on one socket with JSON framing.
- **Supersedes:** the Alpaca two-socket design, OPRA option feed, and MessagePack/msgpack framing — none exist in current code; `@msgpack/msgpack` is unused.
- **Source:** `plans/market-data-massive-migration/research.md`

### ADR: Env-switched `marketDataFactory` (replaces `createMarketDataProvider`)

- **Decision:** `marketDataFactory` (`src/main/integrations/market-data-factory.ts`) exposes `configure()`/`create()`/`recreate()`/`disconnect()`; returns `FakeMarketDataProvider` when `FAKE_MARKET_DATA==='true'`, else `MassiveMarketDataProvider` from `MASSIVE_API_KEY`; throws "Market data provider not configured…" when neither is set.
- **Why:** Centralizes provider selection behind env config; deterministic in-process fake for e2e. Replaces `createMarketDataProvider(config)` + `MarketDataConfig` + `provider:'alpaca'` union.
- **Supersedes:** the us-31/us-32 factory ADRs.
- **Source:** `plans/market-data-massive-migration/research.md`

### ADR: Broker concerns split onto a dedicated `broker:*` namespace

- **Decision:** Account, market clock/session, and activities moved off `MarketDataProvider` onto a separate `BrokerProvider` (`AlpacaBrokerProvider`, `src/main/integrations/alpaca-broker.ts`) on `broker:account`, `broker:market-status`, `broker:activities`. Quote/option reads stay on `market-data:*`. There is no `market-data:market-status` channel.
- **Why:** Market data and broker are distinct vendors with distinct lifecycles (broker stays Alpaca; market data moved to Massive).
- **Supersedes:** us-32/us-39 ADRs documenting account/status under `market-data:*` or the channel `broker:account-info` (now `broker:account`).
- **Source:** `plans/market-data-massive-migration/research.md`

### ADR: Bulk option-snapshots channel retained, singular + chain added

- **Decision:** `market-data:option-snapshots` (bulk) retained; singular `market-data:option-snapshot` and `market-data:option-chain` added alongside it. Provider methods: `getOptionSnapshot` (singular) + `getOptionChainSnapshot`.
- **Why:** Different call sites need single-contract, bulk, and full-chain reads.
- **Supersedes:** the us-39 claim that the bulk endpoint was deleted/replaced.
- **Source:** `plans/market-data-massive-migration/research.md`

### ADR: Structured `MarketDataError` codes, HTTP-mapped

- **Decision:** Failures throw `MarketDataError` with `MarketDataErrorCode` ∈ `auth_failed | network_error | not_found | rate_limited | streaming_unsupported`, mapped from HTTP status. No `stream_disconnected` / `subscription_failed`.
- **Why:** Stable, renderer-actionable error vocabulary independent of vendor.
- **Source:** `plans/market-data-massive-migration/research.md`

### ADR: `MarketDataFeed` type; `buildOccSymbol` shared leaf

- **Decision:** Feed union is `MarketDataFeed` (`'stockQuotes' | 'optionQuotes' | 'optionTrades'`). `buildOccSymbol` lives in `src/shared/option-symbol.ts`; `src/main/core/option-symbol.ts` re-exports it.
- **Why:** One OCC builder usable from both processes; clearer feed-type name.
- **Supersedes:** the `DataFeed` name and the `src/main/core/option-symbol.ts` "definition" claim (now a re-export).
- **Source:** `plans/market-data-massive-migration/research.md`

## Contracts

### MarketDataProvider interface

- **Type:** provider interface
- **Shape:**

```typescript
type MarketDataErrorCode = 'auth_failed' | 'network_error' | 'not_found' | 'rate_limited' | 'streaming_unsupported'
class MarketDataError extends Error { readonly code: MarketDataErrorCode }
type MarketDataFeed = 'stockQuotes' | 'optionQuotes' | 'optionTrades'
interface MarketDataProvider {
  getStockQuotes(tickers: string[]): Promise<StockQuote[]>
  getOptionSnapshot(occSymbol: string): Promise<OptionSnapshot>
  getOptionChainSnapshot(underlying: string, filter?: OptionChainFilter): Promise<OptionSnapshot[]>
  supportsStreaming(feed: MarketDataFeed): boolean
  connect(feeds?: MarketDataFeed[]): Promise<void>
  stream(feed: MarketDataFeed, /* handlers */): /* subscription */
  disconnect(): Promise<void>
}
```

- `StockQuote` includes `prevClose` + 4-dp `changePercent`; `OptionSnapshot` has optional `greeks?` and top-level `impliedVolatility?`.
- **Source:** `plans/market-data-massive-migration/contracts/market-data-provider.md`
- **Implementation:** `src/main/integrations/market-data-provider.ts`, `massive-market-data.ts`, `fake-market-data.ts`

### marketDataFactory

- **Type:** factory
- **Shape:** `marketDataFactory.{configure(),create(),recreate(),disconnect()}`; fake when `FAKE_MARKET_DATA==='true'`, else Massive from `MASSIVE_API_KEY`.
- **Source:** `plans/market-data-massive-migration/contracts/market-data-provider.md`
- **Implementation:** `src/main/integrations/market-data-factory.ts`

### IPC channels

- **Type:** IPC handlers / push events
- **`market-data:*`:** `stock-quotes`, `set-stock-quote-tickers`, `stock-quote` (push), `stream-error` (push), `option-snapshots` (bulk), `option-snapshot`, `option-chain` — `src/main/ipc/market-data.ts`. No `market-data:market-status`.
- **`broker:*`:** `broker:account`, `broker:market-status`, `broker:activities` — `src/main/ipc/broker.ts`.
- **Source:** `plans/market-data-massive-migration/contracts/market-data-provider.md`

## Schema Changes

None. Integration/IPC-layer migration only; no tables, columns, indexes, or migration files added or altered. (`plans/market-data-massive-migration/data-model.md`)

## Acceptance Criteria

Retro plan (records shipped state) — no story AC list. Done-state: live quotes/option snapshots are served by Massive through the provider-agnostic interface; broker concerns are on `broker:*`; e2e runs against `FakeMarketDataProvider`.

## Decisions & Tradeoffs

- The broker stays Alpaca (`AlpacaBrokerProvider`); only the market-data vendor changed — splitting the interfaces keeps each provider cohesive.
- Massive API key is a query param, not a Bearer header.
- `@msgpack/msgpack` remains a dependency but is unused after the JSON-socket switch.

## Source Code References

- `src/main/integrations/market-data-provider.ts`
- `src/main/integrations/massive-market-data.ts`
- `src/main/integrations/fake-market-data.ts`
- `src/main/integrations/market-data-factory.ts`
- `src/main/integrations/integration-errors.ts`
- `src/main/integrations/alpaca-broker.ts`, `broker-provider.ts`, `broker-factory.ts`
- `src/main/ipc/market-data.ts`, `src/main/ipc/broker.ts`
- `src/shared/option-symbol.ts` (re-exported by `src/main/core/option-symbol.ts`)
- `src/renderer/src/hooks/useStockQuotes.ts` (`STALE_THRESHOLD_MS`)

Removed: `AlpacaMarketDataProvider` / `src/main/integrations/alpaca-market-data.ts`; `createMarketDataProvider` / `MarketDataConfig`; the `broker:account-info` channel name; two-socket/MessagePack streaming.

## Open Questions

None — records shipped state.

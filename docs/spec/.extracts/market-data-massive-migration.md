---
plan: market-data-massive-migration
source: plans/market-data-massive-migration/
extracted_at: 2026-06-29
status: complete
supersedes: [us-31, us-32, us-39]
---

# Extract: market-data-massive-migration

> Retro plan: authoritative current-state record for the market-data provider
> layer. Supersedes the market-data portions of us-31, us-32, us-39 (Alpaca-era).
> Source-verified against `src/main/integrations/`, `src/main/ipc/`,
> `src/main/core/option-symbol.ts`, and `src/preload/index.ts` on the
> extraction date; a few shapes corrected below where code differs from the
> plan's prose.

## Summary

The live market-data layer was migrated from Alpaca's market-data API to the **Massive** provider (a Polygon-compatible delayed-data vendor). A provider-agnostic `MarketDataProvider` type, an env-switched `marketDataFactory`, and a `MassiveMarketDataProvider` (REST over `fetch` + a single JSON WebSocket) replace the original `AlpacaMarketDataProvider`. In the same change the broker concerns (account, market clock/session, activities) were split out of the market-data interface into a separate `BrokerProvider` (`AlpacaBrokerProvider`) on a dedicated `broker:*` IPC namespace, while quote/option reads stay on `market-data:*`. No database or schema changes — integration/IPC-layer only. The broker remains Alpaca; only the market-data vendor changed. (`plans/market-data-massive-migration/plan.md`, `results.md`)

## Architecture Decisions

### ADR: Massive replaces Alpaca as the market-data provider

- **Decision:** Quotes and option snapshots come from Massive via `MassiveMarketDataProvider` (`src/main/integrations/massive-market-data.ts`); `AlpacaMarketDataProvider` (`src/main/integrations/alpaca-market-data.ts`) was removed. The interface (`src/main/integrations/market-data-provider.ts`) is provider-agnostic, so only the concrete impl + factory changed.
- **Why:** Massive supplies the needed delayed stock + option data on a simpler REST-plus-single-socket surface, decoupled from the Alpaca SDK.
- **Supersedes:** us-31/us-39 ADRs naming `AlpacaMarketDataProvider`, the Alpaca SDK for REST, and Alpaca feed URLs.
- **Source:** `plans/market-data-massive-migration/research.md`

### ADR: REST over `fetch`, key as query param

- **Decision:** REST hits `https://api.massive.com` (`BASE_URL`) via built-in `fetch`, key passed as an `apiKey` query param (no Bearer header, no SDK client); stock snapshots use `/v2/snapshot/locale/us/markets/stocks/tickers/{ticker}`, option reads use `/v3/snapshot/options/{underlying}[/{O:contract}]`.
- **Why:** No SDK dependency; plain REST. `StockQuote` carries `prevClose` and a 4-dp `changePercent` from the snapshot's `todaysChangePerc`. (Massive returns aggregate bars, not live bid/ask, so the last-minute close is used as `price`/`bid`/`ask`.)
- **Source:** `plans/market-data-massive-migration/research.md`; verified in `src/main/integrations/massive-market-data.ts`

### ADR: Single JSON WebSocket for streaming (replaces two-socket / MessagePack)

- **Decision:** One WebSocket `wss://delayed.massive.com/stocks` (`WS_URL`), JSON frames — `{action:'auth',params:<apiKey>}` then `{action:'subscribe',params:'AM.*'}` (aggregate-minute, `ev:'AM'`). Stream is exposed as an RxJS `Observable<StreamEvent<...>>` filtered to the subscribed symbol set.
- **Why:** Massive multiplexes on one socket with JSON framing.
- **Supersedes:** the Alpaca two-socket design, OPRA option feed, and MessagePack/msgpack framing — none exist in current code. (`@msgpack/msgpack` remains a declared dependency in `package.json` but is no longer imported anywhere in `src/`.)
- **Source:** `plans/market-data-massive-migration/research.md`

### ADR: Env-switched `marketDataFactory` (replaces `createMarketDataProvider`)

- **Decision:** `marketDataFactory` (`src/main/integrations/market-data-factory.ts`) exposes `configure()`/`create()`/`recreate()`/`disconnect()`; returns `FakeMarketDataProvider` when `FAKE_MARKET_DATA==='true'`, else `MassiveMarketDataProvider` from the configured key loader; throws "Market data provider not configured. Set MASSIVE_API_KEY or FAKE_MARKET_DATA=true." when neither is set.
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

- **Decision:** Failures throw `MarketDataError` with `MarketDataErrorCode` ∈ `auth_failed | network_error | not_found | rate_limited | streaming_unsupported | unknown`, mapped from HTTP status (401/403 → `auth_failed`, 429 → `rate_limited` after `MAX_RETRIES` with `Retry-After` backoff, 404 → `not_found`, other non-ok / unexpected → `unknown`). No `stream_disconnected` / `subscription_failed`.
- **Defined in** `src/main/integrations/market-data-provider.ts` — `MarketDataError`, `MarketDataErrorCode`, and `MarketDataFeed` all live there (the type-only provider module), **not** in `integration-errors.ts`, which exports only `isNetworkError`. Broker failures use a separate `BrokerError` in `src/main/integrations/broker-provider.ts`.
- **`streaming_unsupported`** is thrown only by `FakeMarketDataProvider`; the Massive provider never raises it.
- **Why:** Stable, renderer-actionable error vocabulary independent of vendor.
- **Source:** `plans/market-data-massive-migration/research.md`. (Code adds an `unknown` member not listed in the plan/contract.)

### ADR: `MarketDataFeed` type; `buildOccSymbol` shared leaf

- **Decision:** Feed union is `MarketDataFeed` (`'stockQuotes' | 'optionQuotes' | 'optionTrades'`). `buildOccSymbol` / `BuildOccSymbolInput` live in `src/shared/option-symbol.ts`; `src/main/core/option-symbol.ts` re-exports them.
- **Why:** One OCC builder usable from both processes; clearer feed-type name.
- **Supersedes:** the `DataFeed` name and the `src/main/core/option-symbol.ts` "definition" claim (now a re-export).
- **Source:** `plans/market-data-massive-migration/research.md`

## Contracts

### MarketDataProvider type

- **Type:** provider interface (declared as a `type`, not `interface`, in source)
- **Shape (as shipped — corrected from the plan's contract file):**

```typescript
type MarketDataErrorCode =
  | 'auth_failed'
  | 'network_error'
  | 'not_found'
  | 'rate_limited'
  | 'streaming_unsupported'
  | 'unknown'
class MarketDataError extends Error { readonly code: MarketDataErrorCode }
type MarketDataFeed = 'stockQuotes' | 'optionQuotes' | 'optionTrades'
type MarketDataProvider = {
  getStockQuotes(tickers: string[]): Promise<Map<string, StockQuote>>
  getOptionSnapshot(contractId: string): Promise<OptionSnapshot>
  getOptionChainSnapshot(filter: OptionChainFilter): Promise<OptionSnapshot[]>
  supportsStreaming(feed: MarketDataFeed): boolean
  connect(feeds?: MarketDataFeed[]): Promise<void>
  disconnect(): Promise<void>
  stream(feed: MarketDataFeed, symbols: string[]): Observable<StreamEvent<StockQuote | OptionSnapshot>>
}
```

- `StockQuote` includes `prevClose` + 4-dp `changePercent` (plus `price`, `bid`, `ask`, `change`, `volume`, `timestamp`); `OptionSnapshot` has optional `greeks?` (4-dp delta/gamma/theta/vega) and top-level `impliedVolatility?` (no longer nested under `greeks`). `OptionSnapshot.openInterest` and `volume` are typed `number | null` and come back `null` from Massive snapshots.
- `OptionChainFilter` carries `underlying` plus optional `expirationFrom/To`, `type` (`'put' | 'call'`), `strikeFrom/To`, `limit`, `cursor`. The strike and expiration bounds are typed **`string`** (not `number`) in source.
- `connect(feeds?)` accepts a `feeds` arg in the type, but `MassiveMarketDataProvider` ignores it and always connects its single stock-quote socket.
- **Source:** `plans/market-data-massive-migration/contracts/market-data-provider.md`
- **Implementation:** `src/main/integrations/market-data-provider.ts`, `massive-market-data.ts`, `fake-market-data.ts`
- **Note (drift from contract file):** the plan's contract documented `getStockQuotes(): Promise<StockQuote[]>`, `getOptionChainSnapshot(underlying, filter?)`, and a hand-wavy `stream(feed, /* handlers */): /* subscription */`. Source ships `Promise<Map<string, StockQuote>>`, a single `filter` arg, and an RxJS `Observable` return.

### marketDataFactory

- **Type:** factory object
- **Shape (as shipped):**

```typescript
const marketDataFactory = {
  configure(next: { loadMassiveApiKey: () => string }): void  // resets cache
  create(): MarketDataProvider     // Fake when FAKE_MARKET_DATA==='true', else Massive from configured key loader
  recreate(): void                 // clears the cached provider (returns void, not a provider)
  disconnect(): Promise<void>
}
```

- Default key loader reads `process.env.MASSIVE_API_KEY`. The wired loader (`src/main/integrations/massive-credentials.ts`, `loadMassiveApiKey`) prefers `MAIN_VITE_MASSIVE_API_KEY` (electron-vite `.env`) and falls back to `process.env.MASSIVE_API_KEY`.
- **Source:** `plans/market-data-massive-migration/contracts/market-data-provider.md`
- **Implementation:** `src/main/integrations/market-data-factory.ts`, `massive-credentials.ts`

### Massive transport

- **Type:** REST + WebSocket transport (provider-internal)
- **REST:** `https://api.massive.com`, key as `?apiKey=`; stock snapshot `/v2/snapshot/locale/us/markets/stocks/tickers/{ticker}`; option snapshot `/v3/snapshot/options/{underlying}/{O:contract}`; option chain `/v3/snapshot/options/{underlying}` with `expiration_date.gte/lte`, `contract_type`, `strike_price.gte/lte`, `limit`, `cursor`; paginates via `next_url` when no `limit`.
- **WebSocket:** single `wss://delayed.massive.com/stocks`, JSON — `{action:'auth',params:<apiKey>}`, then on `auth_success` `{action:'subscribe',params:'AM.*'}`; `ev:'AM'` aggregate-minute frames become `StockQuote` ticks.
- **Source:** `plans/market-data-massive-migration/contracts/market-data-provider.md`; `src/main/integrations/massive-market-data.ts`

### IPC channels

- **Type:** IPC handlers / push events
- **`market-data:*`** (`src/main/ipc/market-data.ts`): `stock-quotes` (batch read), `set-stock-quote-tickers` (set streamed ticker set), `stock-quote` (push), `stream-error` (push), `option-snapshots` (bulk), `option-snapshot` (single), `option-chain`. Also two test-only handlers (`test:trigger-stock-tick`, `test:trigger-stream-error`) for e2e. No `market-data:market-status`.
- **`broker:*`** (`src/main/ipc/broker.ts`): `broker:account`, `broker:market-status`, `broker:activities`.
- **Preload bridge** (`src/preload/index.ts`): `window.api.marketData.*`, `window.api.broker.{account,activities,marketStatus}`, plus top-level `onStockQuote` / `onStreamError` event subscriptions.
- **Renderer adapter** (`src/renderer/src/api/market-data.ts`) currently wraps only `stock-quotes` and the bulk `option-snapshots`; the singular `option-snapshot` and `option-chain` channels exist on the main/preload side but are not yet wrapped by the renderer adapter.
- **Source:** `plans/market-data-massive-migration/contracts/market-data-provider.md`

## Schema Changes

None. Integration/IPC-layer migration only; no tables, columns, indexes, or migration files added or altered. The unrelated `ivr_snapshot` table (migration `007`) and all wheel-domain tables are untouched. Market-data quotes/snapshots are read live and cached client-side (TanStack Query), never persisted to SQLite. (`plans/market-data-massive-migration/data-model.md`)

## Acceptance Criteria

Retro plan (records shipped state) — no story AC list. Done-state: live quotes/option snapshots are served by Massive through the provider-agnostic interface; broker concerns are on `broker:*`; e2e runs against `FakeMarketDataProvider` (`FAKE_MARKET_DATA=true`, `FAKE_MARKET_DATA_ERROR` to force an error code).

## Decisions & Tradeoffs

- The broker stays Alpaca (`AlpacaBrokerProvider`); only the market-data vendor changed — splitting the interfaces keeps each provider cohesive. `AlpacaBrokerProvider` is the only surviving `Alpaca*` class in `src/main/integrations/`.
- Massive API key is a query param, not a Bearer header.
- Massive stock snapshots are aggregate bars (no live bid/ask), so `price`/`bid`/`ask` all carry the last-minute close.
- `@msgpack/msgpack` remains a declared dependency but is unused after the JSON-socket switch.
- `src/main/integrations/alpaca.ts` retains `@deprecated` JSDoc pointing at `createMarketDataProvider()` from the (now-removed) factory naming — stale comment, not load-bearing.

## Source Code References

- `src/main/integrations/market-data-provider.ts`
- `src/main/integrations/massive-market-data.ts`
- `src/main/integrations/massive-credentials.ts`
- `src/main/integrations/fake-market-data.ts`
- `src/main/integrations/market-data-factory.ts`
- `src/main/integrations/integration-errors.ts` (exports only `isNetworkError`; `MarketDataError`/`MarketDataErrorCode`/`MarketDataFeed` live in `market-data-provider.ts`)
- `src/main/integrations/alpaca-broker.ts`, `broker-provider.ts` (`BrokerError`), `broker-factory.ts` (`brokerFactory` object: `configure`/`create`/`recreate`; `create()` throws `BrokerError('auth_failed')` when uncredentialed)
- `src/main/ipc/market-data.ts`, `src/main/ipc/broker.ts`
- `src/shared/option-symbol.ts` (re-exported by `src/main/core/option-symbol.ts`)
- `src/preload/index.ts` (`marketData` / `broker` bridge, `onStockQuote` / `onStreamError`)
- `src/renderer/src/hooks/useStockQuotes.ts` (`STALE_THRESHOLD_MS = 5 * 60 * 1000`)

Removed: `AlpacaMarketDataProvider` / `src/main/integrations/alpaca-market-data.ts`; `createMarketDataProvider` / `MarketDataConfig`; the `broker:account-info` channel name; two-socket/MessagePack streaming.

## Open Questions

None — records shipped state.

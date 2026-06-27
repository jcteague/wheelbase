# Contract — Market-Data Provider & IPC Surface (current)

Authoritative current-state contract for the market-data layer after the Massive
migration. Supersedes the Alpaca-era contracts in US-31/US-32/US-39.

## `MarketDataProvider` interface

`src/main/integrations/market-data-provider.ts`

```typescript
type MarketDataErrorCode =
  | 'auth_failed'
  | 'network_error'
  | 'not_found'
  | 'rate_limited'
  | 'streaming_unsupported'

class MarketDataError extends Error {
  readonly code: MarketDataErrorCode
}

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

- `StockQuote` includes `prevClose` and a 4-dp `changePercent`.
- `OptionSnapshot` has optional `greeks?` and a top-level `impliedVolatility?`
  (IV is no longer nested under `greeks`).
- **Implementation:** `MassiveMarketDataProvider`
  (`src/main/integrations/massive-market-data.ts`,
  `MassiveMarketDataConfig = { apiKey: string }`); `FakeMarketDataProvider`
  (`src/main/integrations/fake-market-data.ts`) for e2e.

## Factory

`src/main/integrations/market-data-factory.ts`

```typescript
const marketDataFactory = {
  configure(/* … */): void
  create(): MarketDataProvider     // Fake when FAKE_MARKET_DATA==='true', else Massive from MASSIVE_API_KEY
  recreate(): MarketDataProvider
  disconnect(): Promise<void>
}
// throws "Market data provider not configured. Set MASSIVE_API_KEY or FAKE_MARKET_DATA=true."
```

## Massive transport

- REST: `https://api.massive.com`, key as `?apiKey=` query param; stock snapshot
  path `/v2/snapshot/locale/us/markets/stocks/tickers/{ticker}`.
- WebSocket: single socket `wss://delayed.massive.com/stocks`, JSON frames —
  `{action:'auth',params:<apiKey>}` then `{action:'subscribe',params:'AM.*'}`.

## IPC channels

### `market-data:*` (quotes / options)

- `market-data:stock-quotes` — batch stock quote read
- `market-data:set-stock-quote-tickers` — set the streamed ticker set
- `market-data:stock-quote` — **push** event (per-tick)
- `market-data:stream-error` — **push** event
- `market-data:option-snapshots` — bulk option snapshots (**retained**)
- `market-data:option-snapshot` — single contract snapshot
- `market-data:option-chain` — full chain snapshot

Registered in `src/main/ipc/market-data.ts`. There is **no**
`market-data:market-status` channel.

### `broker:*` (broker concerns — `AlpacaBrokerProvider`)

- `broker:account` — account info (formerly `broker:account-info`)
- `broker:market-status` — market clock / session
- `broker:activities` — broker activities

Registered in `src/main/ipc/broker.ts`.

## OCC symbol builder

`buildOccSymbol` / `BuildOccSymbolInput` are defined in
`src/shared/option-symbol.ts` and re-exported by `src/main/core/option-symbol.ts`.

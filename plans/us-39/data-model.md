# Data Model: Provider Interface Split

This plan introduces no database tables or migrations. All types are TypeScript interfaces and Zod schemas at the integration boundary.

---

## Two Independent Interfaces

### `MarketDataProvider`

Defined in `src/main/integrations/market-data-provider.ts`. Replaces the existing combined interface; broker methods are removed.

```typescript
export interface MarketDataProvider {
  getStockQuotes(tickers: string[]): Promise<Map<string, StockQuote>>
  getOptionSnapshot(contractId: string): Promise<OptionSnapshot>
  getOptionChainSnapshot(filter: OptionChainFilter): Promise<OptionSnapshot[]>
  supportsStreaming(feed: MarketDataFeed): boolean
  connect(): Promise<void>
  disconnect(): Promise<void>
  stream(
    feed: MarketDataFeed,
    symbols: string[]
  ): Observable<StreamEvent<StockQuote | OptionSnapshot>>
}

export type MarketDataFeed = 'stockQuotes' | 'optionQuotes' | 'optionTrades'

export class MarketDataError extends Error {
  readonly code: MarketDataErrorCode
}
export type MarketDataErrorCode =
  | 'auth_failed'
  | 'network_error'
  | 'rate_limited'
  | 'streaming_unsupported'
  | 'unknown'
```

### `BrokerProvider`

New file `src/main/integrations/broker-provider.ts`.

```typescript
export interface BrokerProvider {
  getAccountInfo(): Promise<AccountInfo>
  getActivities(filter: ActivityFilter): Promise<BrokerActivity[]>
  getMarketStatus(): Promise<MarketStatus>
}

export class BrokerError extends Error {
  readonly code: BrokerErrorCode
}
export type BrokerErrorCode =
  | 'auth_failed'
  | 'network_error'
  | 'rate_limited'
  | 'environment_mismatch'
  | 'unknown'
```

The interfaces share **no methods and no error types**. A consumer importing `MarketDataProvider` does not transitively pull in any broker SDK.

---

## Shared Types (re-homed to broker-provider.ts)

```typescript
export type AccountInfo = {
  buyingPower: string
  portfolioValue: string
  cash: string
  environment: 'paper' | 'live'
  accountNumberMasked: string // first 2 + "…" + last 3
}

export type BrokerActivity = {
  activityId: string
  activityType: string // "OPASN", "OPEXP", "OPXRC", …
  symbol: string
  qty: number
  price: string // 2dp
  transactionTime: string // ISO-8601
}

export type ActivityFilter = {
  type: string
  since?: string // ISO-8601
}

export type MarketStatus = {
  isOpen: boolean
  nextOpen: string
  nextClose: string
  session: 'regular' | 'pre' | 'post' | 'closed'
}
```

---

## Updated Market Data Types

### `StockQuote` (unchanged shape; stays on market-data-provider.ts)

```typescript
{
  price: string // 2dp
  bid: string // 2dp
  ask: string // 2dp
  change: string // 2dp
  changePercent: string // 2dp
  prevClose: string // 2dp
  volume: number
  timestamp: string // ISO-8601
}
```

### `OptionSnapshot` (BREAKING CHANGE: Greeks + IV become optional)

```typescript
{
  bid: string
  ask: string
  mid: string                                          // (bid + ask) / 2, 2dp
  lastTrade: string
  openInterest: number | null
  volume: number | null
  greeks?: {                                           // ← was required
    delta: string                                      // 4dp
    gamma: string
    theta: string
    vega: string
  }
  impliedVolatility?: string                           // ← split out of greeks; 4dp
  timestamp: string
}
```

**Migration impact:** every renderer component reading `snapshot.greeks.delta` must handle `snapshot.greeks?.delta`. Greeks panel (US-34 mockup) renders "—" when absent. See plan area "Renderer audit for optional Greeks."

### `OptionChainFilter` (new)

```typescript
{
  underlying: string
  expirationFrom?: string  // ISO date
  expirationTo?: string    // ISO date
  type?: 'put' | 'call'
  strikeFrom?: string      // decimal
  strikeTo?: string        // decimal
  limit?: number           // default 250 (Massive max)
  cursor?: string          // for pagination via next_url
}
```

---

## Massive HTTP Wire Mapping

| Provider method               | Massive endpoint                                              | Notes                                                 |
| ----------------------------- | ------------------------------------------------------------- | ----------------------------------------------------- |
| `getStockQuotes([ticker])`    | `GET /v3/quotes/{ticker}/last`                                | One request per ticker; parallelised with Promise.all |
| `getOptionSnapshot(contract)` | `GET /v3/snapshot/options/{underlying}/{contract}`            | Underlying parsed from OCC symbol                     |
| `getOptionChainSnapshot(...)` | `GET /v3/snapshot/options/{underlying}` with query parameters | Cursor pagination via `next_url`                      |

Massive auth on every request: `Authorization: Bearer ${apiKey}`. API key loaded once at provider construction from Electron `safeStorage`.

---

## Alpaca Wire Mapping (Broker side)

| Provider method     | Alpaca endpoint                                    | Notes                                 |
| ------------------- | -------------------------------------------------- | ------------------------------------- |
| `getAccountInfo()`  | `GET /v2/account`                                  | Account number masked to `XX…YYY`     |
| `getActivities(f)`  | `GET /v2/account/activities/{type}?date={f.since}` | Sort descending by `transaction_time` |
| `getMarketStatus()` | `GET /v2/clock`                                    | Session derived from `is_open` + time |

Base URL switches between `paper-api.alpaca.markets` (paper) and `api.alpaca.markets` (live) per stored credential.

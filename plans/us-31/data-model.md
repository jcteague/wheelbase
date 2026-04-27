# Data Model: US-31 — Market Data Provider Adapter

This story introduces no database tables or migrations. All types are in-memory TypeScript interfaces and Zod schemas used at the integration boundary.

---

## Core Interface: `MarketDataProvider`

Defined in `src/main/integrations/market-data-provider.ts`. This is the provider-agnostic contract that all services consume.

### Methods

| Method                            | Input                | Output                        | Description                                                                           |
| --------------------------------- | -------------------- | ----------------------------- | ------------------------------------------------------------------------------------- |
| `getStockQuotes(tickers)`         | `string[]`           | `Map<string, StockQuote>`     | Latest quote per ticker; unknown tickers omitted                                      |
| `getOptionSnapshots(contractIds)` | `string[]`           | `Map<string, OptionSnapshot>` | Snapshot per OCC symbol                                                               |
| `getActivities(filter)`           | `ActivityFilter`     | `BrokerActivity[]`            | Activities sorted by transactionTime desc                                             |
| `getAccountInfo()`                | —                    | `AccountInfo`                 | Buying power, cash, environment                                                       |
| `getMarketStatus()`               | —                    | `MarketStatus`                | Open/closed, session type, next open/close                                            |
| `supportsStreaming(feed)`         | `DataFeed`           | `boolean`                     | Whether this provider can stream the given feed                                       |
| `connect()`                       | —                    | `Promise<void>`               | Open all WebSocket connections                                                        |
| `disconnect()`                    | —                    | `Promise<void>`               | Close all connections, complete all streams                                           |
| `stream(feed, symbols)`           | `DataFeed, string[]` | `Observable<StreamEvent>`     | Returns an Observable that emits events; unsubscribe via `subscription.unsubscribe()` |

---

## Types

### `StockQuote`

```typescript
{
  price: string // last trade or mid, 2dp
  bid: string // best bid, 2dp
  ask: string // best ask, 2dp
  change: string // daily change, 2dp
  changePercent: string // daily change %, 2dp
  volume: number // daily volume
  timestamp: string // ISO-8601
}
```

**Validation:** `price`, `bid`, `ask`, `change`, `changePercent` are decimal strings. `volume` is a non-negative integer. `timestamp` is ISO-8601.

### `OptionSnapshot`

```typescript
{
  bid: string // 2dp
  ask: string // 2dp
  mid: string // (bid + ask) / 2, 2dp
  lastTrade: string // 2dp
  openInterest: number | null // null if provider doesn't supply
  volume: number | null // null if provider doesn't supply
  greeks: {
    delta: string // 4dp
    gamma: string // 4dp
    theta: string // 4dp
    vega: string // 4dp
    iv: string // 4dp (implied volatility)
  }
  timestamp: string // ISO-8601
}
```

**Validation:** `mid` must equal `(bid + ask) / 2` (computed by the adapter, not the API). All money values are decimal strings. Greeks are decimal strings with 4dp. `openInterest` and `volume` are nullable (Alpaca does not provide them).

### `BrokerActivity`

```typescript
{
  activityId: string
  activityType: string // e.g., "OPASN", "OPEXP", "OPXRC"
  symbol: string
  qty: number
  price: string // 2dp
  transactionTime: string // ISO-8601
}
```

**Validation:** Results sorted by `transactionTime` descending. `qty` is a positive integer. `price` is a decimal string.

### `ActivityFilter`

```typescript
{
  type: string             // Activity type code (e.g., "OPASN")
  since?: string           // ISO date string (YYYY-MM-DD)
}
```

### `AccountInfo`

```typescript
{
  buyingPower: string // decimal string
  portfolioValue: string // decimal string
  cash: string // decimal string
  environment: 'paper' | 'live'
}
```

**Validation:** `environment` is derived from the provider's configuration, not the API response.

### `MarketStatus`

```typescript
{
  isOpen: boolean
  nextOpen: string // ISO-8601
  nextClose: string // ISO-8601
  session: 'regular' | 'pre' | 'post' | 'closed'
}
```

**Validation:** `session` is derived from clock timestamp vs. calendar times. See research.md for derivation logic.

### `DataFeed`

```typescript
type DataFeed = 'stockQuotes' | 'optionQuotes' | 'optionTrades'
```

### `StreamEvent<T>`

```typescript
{
  feed: DataFeed
  symbol: string
  data: T // StockQuote or OptionSnapshot depending on feed
  timestamp: string // ISO-8601
}
```

Consumers subscribe via RxJS:

```typescript
import { Subscription } from 'rxjs'

const sub: Subscription = provider.stream('stockQuotes', ['AAPL', 'MSFT']).subscribe({
  next: (event) => console.log(event.symbol, event.data.price),
  error: (err) => console.error(err) // StreamError or MarketDataError
})

// Later:
sub.unsubscribe() // sends WebSocket unsubscribe, cleans up
```

### `StreamError`

```typescript
{
  feed: DataFeed
  code: string // e.g., "stream_disconnected"
  message: string
  reconnectable: boolean
}
```

Emitted through the Observable error channel. Consumers handle via the `error` callback in `subscribe()` or via `catchError` operator.

### `MarketDataError`

```typescript
class MarketDataError extends Error {
  code:
    | 'auth_failed'
    | 'network_error'
    | 'rate_limited'
    | 'stream_disconnected'
    | 'streaming_unsupported'
    | 'subscription_failed'
    | 'unknown'
}
```

---

## Factory

### `createMarketDataProvider(config)`

Defined in `src/main/integrations/market-data-factory.ts`.

```typescript
interface MarketDataConfig {
  provider: 'alpaca' // extensible union for future providers
  keyId: string
  secretKey: string
  paper: boolean
  dataFeed?: 'sip' | 'iex' | 'delayed_sip' // stock feed, default 'sip'
  optionFeed?: 'opra' | 'indicative' // option feed, default 'opra'
}
```

Returns a `MarketDataProvider`. Services import `createMarketDataProvider`, never `AlpacaMarketDataProvider` directly.

---

## Relationships

```
MarketDataProvider (interface)
  ├── getStockQuotes() → Map<string, StockQuote>
  ├── getOptionSnapshots() → Map<string, OptionSnapshot>
  ├── getActivities() → BrokerActivity[]
  ├── getAccountInfo() → AccountInfo
  ├── getMarketStatus() → MarketStatus
  ├── supportsStreaming() → boolean
  ├── connect() → Promise<void>
  ├── disconnect() → Promise<void>
  └── stream() → Observable<StreamEvent<T>>

AlpacaMarketDataProvider implements MarketDataProvider
  ├── Uses @alpacahq/typescript-sdk for REST calls
  ├── Uses ws for stock WebSocket (JSON)
  ├── Uses ws + @msgpack/msgpack for option WebSocket (MessagePack)
  ├── Uses RxJS Subject internally to bridge WebSocket events → Observable
  └── Sends WebSocket unsubscribe on Observable teardown

createMarketDataProvider(config) → MarketDataProvider
  └── Factory that constructs the appropriate provider
```

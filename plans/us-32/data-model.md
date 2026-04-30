# Data Model: US-32 — Live Underlying Price on Position List

This story introduces no SQLite schema, no migrations, and no persistent state. All data is transient — fetched from the `MarketDataProvider`, held in renderer memory, and discarded on app close.

## Existing Domain Types (US-31 — reused)

These types already exist in `src/main/integrations/market-data-provider.ts`. US-32 consumes them but does not modify them.

### `StockQuote` (provider type)

```ts
type StockQuote = {
  price: string // 2dp, e.g. "182.45"
  bid: string // 2dp
  ask: string // 2dp
  change: string // 2dp signed, set on REST seed only
  changePercent: string // 4dp, set on REST seed only
  volume: number
  timestamp: string // ISO-8601
}
```

US-31 left `change` / `changePercent` hardcoded to `"0.00"` in `mapQuoteToStockQuote`. **US-32 fills this gap** for the REST path by using `getStocksSnapshots()` (which returns `prev_daily_bar.c`) and computing change in the adapter. The stream path leaves `change` blank — the renderer recomputes it from a remembered `prevClose`.

### `MarketStatus` (provider type)

```ts
type MarketStatus = {
  isOpen: boolean
  nextOpen: string // ISO-8601
  nextClose: string // ISO-8601
  session: 'regular' | 'pre' | 'post' | 'closed'
}
```

### `MarketDataError`

`MarketDataErrorCode = 'auth_failed' | 'network_error' | 'rate_limited' | 'stream_disconnected' | 'streaming_unsupported' | 'subscription_failed' | 'unknown'`. US-32 surfaces all of these to the renderer through IPC error envelopes or stream-error events.

### `StreamEvent<T>` and `StreamError`

```ts
type StreamEvent<T> = { feed: DataFeed; symbol: string; data: T; timestamp: string }
type StreamError = { feed: DataFeed; code: string; message: string; reconnectable: boolean }
```

US-32 only consumes `StreamEvent<StockQuote>`. `StreamError` is forwarded to the renderer via a dedicated channel for surfacing connection failures.

---

## New IPC-Flat Types (`src/preload/index.d.ts`)

These shape the contract between main and renderer. They mirror the provider types but flatten `Map`s to plain objects and add a `prevClose` field that the renderer needs.

### `IpcStockQuote`

```ts
type IpcStockQuote = {
  price: string
  bid: string
  ask: string
  prevClose: string | null // 2dp; set on REST snapshot, null on stream tick
  volume: number
  timestamp: string
}
```

`change` and `changePercent` are intentionally **omitted** from the IPC type because the renderer computes them client-side from `(price, prevClose)`. This avoids two divergent values when prevClose drifts and keeps the math in one place.

### `IpcMarketStatus`

```ts
type IpcMarketStatus = {
  isOpen: boolean
  nextOpen: string
  nextClose: string
  session: 'regular' | 'pre' | 'post' | 'closed'
}
```

### `IpcSetStockQuoteTickersPayload`

```ts
type IpcSetStockQuoteTickersPayload = { tickers: string[] }
```

**Validation rules** (Zod schema `SetStockQuoteTickersPayloadSchema` in `src/main/schemas.ts`):

- `tickers`: array of non-empty strings of length 1–10.
- Up to 50 tickers.
- Empty array is valid — main process tears down any existing stream subscription and replies `{ ok: true, subscribedTickers: [] }`.

### `IpcSetStockQuoteTickersResult`

```ts
type IpcSetStockQuoteTickersResult =
  | { ok: true; subscribedTickers: string[] }
  | { ok: false; errors: ApiFieldError[] }
```

### `IpcGetMarketStatusResult`

```ts
type IpcGetMarketStatusResult =
  | { ok: true; status: IpcMarketStatus }
  | { ok: false; errors: ApiFieldError[] }
```

### `IpcGetStockQuotesPayload` / `IpcGetStockQuotesResult` (REST seed)

```ts
type IpcGetStockQuotesPayload = { tickers: string[] }

type IpcGetStockQuotesResult =
  | { ok: true; quotes: Record<string, IpcStockQuote> } // every entry has prevClose populated
  | { ok: false; errors: ApiFieldError[] }
```

Same Zod validation rules as `SetStockQuoteTickersPayloadSchema`. Per-ticker absence still means "unavailable" on the renderer.

### Push event payloads

```ts
type IpcStockQuoteEvent = {
  ticker: string
  quote: IpcStockQuote // prevClose: null on a tick
}

type IpcStreamErrorEvent = {
  feed: 'stockQuotes' | 'optionQuotes' | 'optionTrades'
  code: string
  message: string
  reconnectable: boolean
}
```

There is no separate `stock-quote-snapshot` push event — the snapshot is delivered via the request/response `market-data:stock-quotes` call, which TanStack Query consumes as its `queryFn`.

### Preload bridge additions (`window.api`)

```ts
getStockQuotes: (payload: IpcGetStockQuotesPayload) => Promise<IpcGetStockQuotesResult>
setStockQuoteTickers: (payload: IpcSetStockQuoteTickersPayload) => Promise<IpcSetStockQuoteTickersResult>
getMarketStatus: () => Promise<IpcGetMarketStatusResult>
onStockQuote:  (cb: (event: IpcStockQuoteEvent) => void) => () => void
onStreamError: (cb: (event: IpcStreamErrorEvent) => void) => () => void
```

The `on*` methods return an `unsubscribe` function (wraps `ipcRenderer.removeListener`).

---

## Renderer-Side Types (`src/renderer/src/api/market-data.ts`)

The renderer reuses the IPC shapes directly — TanStack Query owns freshness via `dataUpdatedAt`, so there's no `lastUpdateAt` field on the per-quote record.

### `StockQuote` (renderer alias)

```ts
type StockQuote = {
  price: string
  bid: string
  ask: string
  prevClose: string | null
  volume: number
  timestamp: string
}
```

Same shape as `IpcStockQuote`.

### `StockQuotesByTicker`

```ts
type StockQuotesByTicker = Record<string, StockQuote>
```

This is the value held in the TanStack Query cache.

### `MarketStatus`

Same shape as `IpcMarketStatus`. Re-exported.

---

## Cache Update Behavior

The TanStack Query cache for `['market-data', 'stock-quotes', sortedTickers]` holds `StockQuotesByTicker`. Updates come from two sources:

| Source                                 | Cache Action                                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `queryFn` resolves (REST seed)         | `setQueryData` replaces the whole map; every entry has `prevClose` set; `dataUpdatedAt` bumped.                                                               |
| `onStockQuote` event (single tick)     | `setQueryData(key, prev => ({ ...prev, [ticker]: { ...event.quote, prevClose: prev?.[ticker]?.prevClose ?? null } }))`. `dataUpdatedAt` bumped automatically. |
| Tick for a ticker not in current state | Same merger — entry added with `prevClose: null` until the next REST refetch fills it.                                                                        |
| `onStreamError` event                  | `setQueryError` (or set a sibling state); the staleness banner uses both `dataUpdatedAt` and an in-hook `streamError` flag.                                   |

The query's `staleTime: Infinity` prevents auto-refetch by timer — stream ticks are the live update mechanism. `refetchOnWindowFocus: true` re-pulls the REST seed when the user re-focuses the app, ensuring `prevClose` is current after the stream might have drifted.

---

## Derived UI States

Computed in the renderer, not transmitted.

### Per-Row Change

```ts
function deriveChange(
  price: string,
  prevClose: string | null
): {
  change: string | null
  up: boolean
}
```

- If `prevClose === null`: `change = null`, `up = false` (renderer omits the change line).
- Else: `change = (parseFloat(price) - parseFloat(prevClose)).toFixed(2)`; `up = change >= 0`.

### `MarketStatusDisplay`

```ts
type MarketStatusDisplay = 'LIVE' | 'EXT' | 'CLOSED' | 'DELAYED'
```

Derivation in `PositionsListPage` / `MarketStatusPill`:

| Condition                                                         | Display     |
| ----------------------------------------------------------------- | ----------- |
| `streamError != null`                                             | `'DELAYED'` |
| `Date.now() - dataUpdatedAt > 300_000` (TanStack Query freshness) | `'DELAYED'` |
| `session === 'regular'`                                           | `'LIVE'`    |
| `session === 'pre'` or `session === 'post'`                       | `'EXT'`     |
| `session === 'closed'` (or session unknown and no data yet)       | `'CLOSED'`  |

Stale check **takes precedence** so a stuck stream always surfaces visually.

### Stale Threshold

```ts
const STALE_THRESHOLD_MS = 5 * 60 * 1000 // 300_000
```

`dataUpdatedAt` is supplied by the TanStack Query result. It is bumped automatically by both `queryFn` resolution and `setQueryData` calls (i.e., every stream tick).

---

## TanStack Query Keys

```ts
const marketDataQueryKeys = {
  stockQuotes: (tickers: string[]) =>
    ['market-data', 'stock-quotes', tickers.slice().sort().join(',')] as const,
  marketStatus: ['market-data', 'market-status'] as const
}
```

`tickers.slice().sort()` keeps the cache key stable across input ordering.

---

## State Transitions (UI)

No state machine. The renderer derives the UI per render:

1. Mount, query is `isLoading`: cells show `—` while the REST seed is in flight.
2. Query resolves: cells show `price` + signed `change`.
3. Tick arrived for a ticker: price updates in place via `setQueryData`; no spinner, no flash.
4. Ticker requested but absent from `query.data`: cell shows `—` with tooltip `Price unavailable`.
5. `Date.now() - query.dataUpdatedAt > 300_000`: banner appears, status pill becomes `DELAYED`.
6. `streamError` flag set: banner shows immediately (does not wait for staleness threshold).

---

## Provider-Level Gap to Fill

`mapQuoteToStockQuote()` in `src/main/integrations/alpaca-market-data.ts` currently returns `change: '0.00'`. US-32 modifies `getStockQuotes()` in the adapter to:

1. Switch the underlying SDK call from `getStocksQuotesLatest` to `getStocksSnapshots` (raw response cast — see US-31 research note).
2. Read `latest_quote.bp`/`ap` for current bid/ask.
3. Read `prev_daily_bar.c` for previous close.
4. Compute `change = mid − prevClose`, `changePercent = change / prevClose`.
5. Return `StockQuote` with all fields populated.

The provider's `StockQuote` type already has `change`/`changePercent` fields — only the implementation needs updating. The IPC layer adds the new `prevClose` field on top.

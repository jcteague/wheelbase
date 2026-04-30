# IPC Contract: `market-data:set-stock-quote-tickers`

Renderer-initiated request/response. Tells the main process which tickers to subscribe to on the WebSocket stream. Main process responds with an ack and then emits `stock-quote` events as ticks arrive. The initial snapshot is **not** delivered through this channel — the renderer fetches it separately via `market-data:stock-quotes` (REST).

## Channel

`market-data:set-stock-quote-tickers`

## Handler Location

`src/main/ipc/market-data.ts` — `registerMarketDataHandlers(provider: MarketDataProvider, getWindow: () => BrowserWindow | null)`.

The handler closes over an injected `MarketDataProvider` (singleton from `src/main/index.ts`) and a getter for the active `BrowserWindow` (used to address `webContents.send`).

## Payload (renderer → main)

```ts
type IpcSetStockQuoteTickersPayload = {
  tickers: string[]
}
```

### Zod Schema (`src/main/schemas.ts`)

```ts
export const SetStockQuoteTickersPayloadSchema = z.object({
  tickers: z.array(z.string().min(1).max(10)).max(50)
})

export type SetStockQuoteTickersPayload = z.infer<typeof SetStockQuoteTickersPayloadSchema>
```

- `tickers` is required.
- Each ticker is a non-empty string ≤ 10 characters.
- Up to 50 tickers per call.
- Empty array is valid: handler tears down any existing stream subscription, sends an empty snapshot event, and returns `{ ok: true, subscribedTickers: [] }`.

## Response Shape (main → renderer)

```ts
type IpcSetStockQuoteTickersResult =
  | { ok: true; subscribedTickers: string[] }
  | { ok: false; errors: Array<{ field: string; code: string; message: string }> }
```

### Error Mapping

| Source                                     | IPC Error Code          | Field        |
| ------------------------------------------ | ----------------------- | ------------ |
| Zod validation failure                     | (issue.code)            | (issue path) |
| `MarketDataError('auth_failed', …)`        | `auth_failed`           | `__root__`   |
| `MarketDataError('network_error', …)`      | `network_error`         | `__root__`   |
| `MarketDataError('rate_limited', …)`       | `rate_limited`          | `__root__`   |
| `MarketDataError('streaming_unsupported')` | `streaming_unsupported` | `__root__`   |
| Other thrown errors                        | `internal_error`        | `__root__`   |

## Behavior

1. Parse payload with `SetStockQuoteTickersPayloadSchema`. On failure, return `{ ok: false, errors: [...] }`.
2. Tear down any prior stream subscription (`prevSubscription?.unsubscribe()`).
3. If `tickers.length === 0`, return `{ ok: true, subscribedTickers: [] }`. No further events.
4. Else:
   - If provider is not yet connected, call `await provider.connect()`.
   - Subscribe to `provider.stream('stockQuotes', tickers)`. On each `StreamEvent<StockQuote>`, emit `webContents.send('market-data:stock-quote', { ticker: event.symbol, quote: { …flatten event.data, prevClose: null } })`.
   - On Observable error, emit `webContents.send('market-data:stream-error', { feed: 'stockQuotes', code, message, reconnectable: true })` and clear the subscription handle.
   - Store the new subscription handle for the next teardown.
   - Return `{ ok: true, subscribedTickers: tickers }`.

The handler **never throws** to the renderer (CLAUDE.md rule).

The REST seed (current price + `prevClose`) is fetched separately by the renderer via `market-data:stock-quotes`, driven by TanStack Query's `queryFn`. Splitting the seed and the stream control keeps the cache refreshable on window focus without restarting the WebSocket.

## Adapter Notes (`src/main/integrations/alpaca-market-data.ts`)

US-32 updates `getStockQuotes(tickers)` to use `getStocksSnapshots` (cast to a raw response that includes `latest_quote` + `prev_daily_bar`) so each `StockQuote` has accurate `change`, `changePercent`, **and a `prevClose` field** that the IPC `market-data:stock-quotes` handler reads when building `IpcStockQuote.prevClose`.

The provider's `StockQuote` type gains `prevClose: string` — additive, non-breaking for US-31 consumers. Stream-mapped quotes (`mapQuoteToStockQuote`) leave `prevClose` as `''` or omit it; the IPC `set-stock-quote-tickers` handler always sets `prevClose: null` on the tick events it forwards to the renderer.

## Examples

### Successful subscribe

**Payload:** `{ "tickers": ["AAPL", "MSFT", "TSLA"] }`

**Response:** `{ "ok": true, "subscribedTickers": ["AAPL", "MSFT", "TSLA"] }`

**Followed by per-tick push:** `market-data:stock-quote` event (repeats per broker tick):

```json
{
  "ticker": "AAPL",
  "quote": {
    "price": "182.50",
    "bid": "182.49",
    "ask": "182.51",
    "prevClose": null,
    "volume": 12500050,
    "timestamp": "2026-04-27T15:30:01-04:00"
  }
}
```

### Empty subscribe (renderer cleared positions)

**Payload:** `{ "tickers": [] }`
**Response:** `{ "ok": true, "subscribedTickers": [] }`. No further `stock-quote` events.

### Auth failure

```json
{
  "ok": false,
  "errors": [
    { "field": "__root__", "code": "auth_failed", "message": "stream: authentication failed" }
  ]
}
```

### Validation failure

**Payload:** `{ "tickers": "AAPL" }`

```json
{
  "ok": false,
  "errors": [
    { "field": "tickers", "code": "invalid_type", "message": "Expected array, received string" }
  ]
}
```

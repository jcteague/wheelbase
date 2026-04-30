# IPC Contract: `market-data:stock-quotes`

Renderer-initiated request/response. Fetches a one-shot REST snapshot of stock quotes including `prevClose`. Used as the `queryFn` of TanStack Query's `useStockQuotes` hook.

## Channel

`market-data:stock-quotes`

## Handler Location

`src/main/ipc/market-data.ts` — registered alongside the stream-control and market-status handlers in `registerMarketDataHandlers(provider, getWindow)`.

## Payload (renderer → main)

```ts
type IpcGetStockQuotesPayload = {
  tickers: string[]
}
```

### Zod Schema (`src/main/schemas.ts`)

```ts
export const GetStockQuotesPayloadSchema = z.object({
  tickers: z.array(z.string().min(1).max(10)).max(50)
})

export type GetStockQuotesPayload = z.infer<typeof GetStockQuotesPayloadSchema>
```

- `tickers` is required.
- Each ticker is a non-empty string ≤ 10 characters.
- Up to 50 tickers per call.
- Empty array is valid: handler returns `{ ok: true, quotes: {} }` without calling the provider.

## Response Shape (main → renderer)

```ts
type IpcGetStockQuotesResult =
  | { ok: true; quotes: Record<string, IpcStockQuote> }
  | { ok: false; errors: Array<{ field: string; code: string; message: string }> }

type IpcStockQuote = {
  price: string // 2dp
  bid: string // 2dp
  ask: string // 2dp
  prevClose: string | null // 2dp; populated on REST seed; null on stream tick
  volume: number
  timestamp: string // ISO-8601
}
```

On the REST seed path, `prevClose` is **always populated** for every returned ticker. A requested ticker that has no quote (unknown symbol, halted) is **absent** from the `quotes` object.

### Error Mapping

| Source                                | IPC Error Code   | Field        |
| ------------------------------------- | ---------------- | ------------ |
| `MarketDataError('auth_failed', …)`   | `auth_failed`    | `__root__`   |
| `MarketDataError('network_error', …)` | `network_error`  | `__root__`   |
| `MarketDataError('rate_limited', …)`  | `rate_limited`   | `__root__`   |
| Other thrown errors                   | `internal_error` | `__root__`   |
| Zod validation failure                | (issue.code)     | (issue path) |

## Behavior

1. Parse payload with `GetStockQuotesPayloadSchema`. On failure, return `{ ok: false, errors: [...] }`.
2. If `tickers.length === 0`, return `{ ok: true, quotes: {} }`.
3. Call `provider.getStockQuotes(tickers)` → `Map<string, StockQuote>`.
4. Convert the map into a plain `Record<string, IpcStockQuote>`. Each entry copies `price`, `bid`, `ask`, `volume`, `timestamp` directly; `prevClose` is taken from the provider's `StockQuote.prevClose` (added in this story).
5. Return `{ ok: true, quotes: <record> }`.
6. On `MarketDataError`, return `{ ok: false, errors: [{ field: '__root__', code, message }] }`.
7. On any other error, log `logger.error({ err }, 'market_data_stock_quotes_unhandled_error')` and return `{ ok: false, errors: [{ field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }] }`.

The handler **never throws** to the renderer.

## Preload Bridge

`src/preload/index.ts`:

```ts
getStockQuotes: (payload: IpcGetStockQuotesPayload) => invoke('market-data:stock-quotes', payload)
```

`src/preload/index.d.ts` extends `window.api`:

```ts
getStockQuotes: (payload: IpcGetStockQuotesPayload) => Promise<IpcGetStockQuotesResult>
```

## Renderer Adapter (`src/renderer/src/api/market-data.ts`)

```ts
export async function getStockQuotes(tickers: string[]): Promise<StockQuotesByTicker> {
  const result = await window.api.getStockQuotes({ tickers })
  if (!result.ok) {
    throw apiError(502, { detail: result.errors })
  }
  return result.quotes
}
```

`502` (upstream) flags TanStack Query to set `isError`, which the page uses to keep the cells dashed and surface an error banner.

## TanStack Query Integration

```ts
useQuery({
  queryKey: marketDataQueryKeys.stockQuotes(tickers),
  queryFn: () => getStockQuotes(tickers),
  enabled: tickers.length > 0,
  staleTime: Infinity, // ticks bump dataUpdatedAt; no time-based refetch
  refetchOnWindowFocus: true // refresh prevClose after wake/focus
})
```

## Examples

### Successful seed

**Payload:** `{ "tickers": ["AAPL", "MSFT", "TSLA"] }`

**Response:**

```json
{
  "ok": true,
  "quotes": {
    "AAPL": {
      "price": "182.45",
      "bid": "182.44",
      "ask": "182.46",
      "prevClose": "181.00",
      "volume": 12500000,
      "timestamp": "2026-04-27T15:30:00-04:00"
    },
    "MSFT": {
      "price": "418.30",
      "bid": "418.29",
      "ask": "418.31",
      "prevClose": "420.00",
      "volume": 8200000,
      "timestamp": "2026-04-27T15:30:00-04:00"
    },
    "TSLA": {
      "price": "248.10",
      "bid": "248.09",
      "ask": "248.11",
      "prevClose": "246.00",
      "volume": 15800000,
      "timestamp": "2026-04-27T15:30:00-04:00"
    }
  }
}
```

### Unknown ticker (per-ticker absent)

**Payload:** `{ "tickers": ["AAPL", "ZZZZZ"] }`

**Response:** `{ "ok": true, "quotes": { "AAPL": { … } } }`

### Auth failure

```json
{
  "ok": false,
  "errors": [
    {
      "field": "__root__",
      "code": "auth_failed",
      "message": "getStockQuotes: authentication failed"
    }
  ]
}
```

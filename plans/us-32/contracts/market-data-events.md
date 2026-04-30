# IPC Contract: Market-Data Push Events (Main → Renderer)

These channels are **one-way** — main process emits, renderer listens. The renderer never invokes them. Used to deliver streaming updates from the WebSocket-backed `MarketDataProvider` to the renderer's TanStack Query cache.

## Channels

| Channel                    | Payload Type          | Frequency                                      |
| -------------------------- | --------------------- | ---------------------------------------------- |
| `market-data:stock-quote`  | `IpcStockQuoteEvent`  | Per stream tick (high frequency, market hours) |
| `market-data:stream-error` | `IpcStreamErrorEvent` | When the underlying WebSocket fails            |

The initial snapshot is **not** a push event — it is delivered as the response to the `market-data:stock-quotes` request/response call (see `market-data-stock-quotes.md`). Push events carry only deltas.

## Emission Site

`src/main/ipc/market-data.ts` — inside the Observable subscription's `next` / `error` callbacks set up in the `set-stock-quote-tickers` handler. Uses `mainWindow.webContents.send(channel, payload)`.

## Payloads

### `IpcStockQuoteEvent`

```ts
type IpcStockQuoteEvent = {
  ticker: string
  quote: IpcStockQuote // prevClose is always null on a tick
}
```

The renderer's TanStack Query cache merges the tick into the existing entry, carrying `prevClose` forward from whatever the REST seed provided.

### `IpcStreamErrorEvent`

```ts
type IpcStreamErrorEvent = {
  feed: 'stockQuotes' | 'optionQuotes' | 'optionTrades'
  code: string // mirrors provider StreamError.code
  message: string
  reconnectable: boolean
}
```

For US-32, `feed` is always `'stockQuotes'`. The renderer treats the event as a signal to surface the stale-data banner immediately (without waiting for the 5-min freshness timeout).

## Preload Bridge

`src/preload/index.ts`:

```ts
onStockQuote: (cb: (event: IpcStockQuoteEvent) => void) => {
  const listener = (_: unknown, event: IpcStockQuoteEvent) => cb(event)
  ipcRenderer.on('market-data:stock-quote', listener)
  return () => ipcRenderer.removeListener('market-data:stock-quote', listener)
},
onStreamError: (cb: (event: IpcStreamErrorEvent) => void) => {
  const listener = (_: unknown, event: IpcStreamErrorEvent) => cb(event)
  ipcRenderer.on('market-data:stream-error', listener)
  return () => ipcRenderer.removeListener('market-data:stream-error', listener)
}
```

Each `on*` returns an unsubscribe function so callers clean up listeners deterministically.

## Renderer Consumer

The single consumer is the stream bridge inside `useStockQuotes(tickers)` (in `src/renderer/src/hooks/useStockQuotes.ts`). The hook registers listeners in a `useEffect`, calls `queryClient.setQueryData(...)` per tick, and unsubscribes on unmount or ticker change.

```ts
useEffect(() => {
  if (tickers.length === 0) return

  let cancelled = false
  void window.api.setStockQuoteTickers({ tickers }).then((res) => {
    if (cancelled || !res.ok) {
      // swallow on cancel; surface on error
    }
  })

  const offTick = window.api.onStockQuote((event) => {
    queryClient.setQueryData<StockQuotesByTicker>(queryKey, (prev) => {
      const prevForTicker = prev?.[event.ticker]
      return {
        ...(prev ?? {}),
        [event.ticker]: {
          ...event.quote,
          prevClose: event.quote.prevClose ?? prevForTicker?.prevClose ?? null
        }
      }
    })
  })

  const offErr = window.api.onStreamError((event) => {
    setStreamError(event)
  })

  return () => {
    cancelled = true
    offTick()
    offErr()
    void window.api.setStockQuoteTickers({ tickers: [] })
  }
}, [queryClient, queryKey, tickers])
```

## Examples

### Tick event

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

### Stream error

```json
{
  "feed": "stockQuotes",
  "code": "stream_disconnected",
  "message": "stockQuotes stream disconnected",
  "reconnectable": true
}
```

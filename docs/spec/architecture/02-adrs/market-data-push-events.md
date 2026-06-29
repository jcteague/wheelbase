# ADR: Two push event channels for market data (tick + stream error)

<!-- generated:from us-32,market-data-massive-migration -->

## Decision

Live market-data updates flow from main to renderer via two **push event** channels (one-way `webContents.send`, fire-and-forget):

- `market-data:stock-quote` — emitted per stream tick. Payload: `{ ticker, quote: IpcStockQuote }` where `quote.prevClose` is always `null` on a tick.
- `market-data:stream-error` — emitted when the provider's Observable errors (`StreamError`). Payload: `{ feed, code, message, reconnectable }`. The renderer treats this as an immediate signal to surface the stale-data banner without waiting for the freshness timeout.

The initial REST snapshot is delivered via the request/response `market-data:stock-quotes` invoke (consumed by TanStack Query's `queryFn`), **not** via a push event.

Preload surfaces the two subscriptions at the top level of the bridge as `window.api.onStockQuote(cb)` and `window.api.onStreamError(cb)`, each returning an unsubscribe function that wraps `ipcRenderer.removeListener`. (The request/response market-data reads are namespaced under `window.api.marketData.*`, but these two event subscriptions stay flat on `window.api`.)

Two **test-only** IPC handlers drive the channels in e2e: `test:trigger-stock-tick` and `test:trigger-stream-error`. They let Playwright fire a tick or a stream error deterministically without a live WebSocket, paired with `FakeMarketDataProvider` (`FAKE_MARKET_DATA=true`).

## Context / Why

- Snapshot vs delta is a meaningful distinction: snapshot replaces the renderer's whole map; delta merges one ticker. Sending both as one channel would force the renderer to disambiguate by shape, which is fragile.
- Stream errors need an out-of-band signal because they're asynchronous WebSocket failures, not a response to a specific renderer-initiated call.
- Splitting the channels makes preload subscriptions and tests trivially scoped: tests can fire either channel without coordinating shapes.

## Alternatives considered

- **One unified `market-data:stock-quote-event` channel with `kind: 'snapshot' | 'tick'`** — works but adds a discriminator-check level of indirection in every receiver; two channels are simpler.
- **Push events for snapshots too** — rejected; the snapshot is a response to a request and fits the request/response IPC pattern cleanly. Push events are for unsolicited deltas.
- **Single error event mixing stream and request errors** — rejected; request errors are returned in the IPC envelope (`{ ok: false, errors: [...] }`); stream errors are out-of-band.

## Consequences

- `useStockQuotes(tickers)` registers listeners on both channels and merges ticks into the cached `setQueryData` map. Stream errors set a local `streamError` state and override the market-status pill to `DELAYED` (see ADR [market-status-pill](./market-status-pill.md)).
- Adding new market-data feeds (option quotes, option trades) extends `feed` to `'optionQuotes' | 'optionTrades'` on the error event; per-feed push channels follow the same naming.
- Tests in the renderer fire ticks via `page.evaluate` stubbing of `window.api.onStockQuote`; the bridge contract is preserved.

## Sources

- [extract: us-32](../../.extracts/us-32.md) — ADR "Push Event Channels (main → renderer)"; ADR "IPC Error Mapping — Two Pathways"
- [extract: market-data-massive-migration](../../.extracts/market-data-massive-migration.md) — § "IPC channels" (`stock-quote`/`stream-error` pushes, `test:trigger-*` handlers, flat `onStockQuote`/`onStreamError` bridge)
- [feature: us-32-live-position-prices](../../features/us-32-live-position-prices.md)
<!-- /generated -->

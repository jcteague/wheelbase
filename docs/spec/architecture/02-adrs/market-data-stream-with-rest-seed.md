# ADR: Stream-first market data with one-shot REST seed

<!-- generated:from us-32,market-data-massive-migration,us-99 -->

## Decision

Live underlying prices reach the renderer through two complementary paths off the single `MarketDataProvider`:

1. **One-shot REST seed.** On every change to the active-ticker list, the main process fires a single `provider.getStockQuotes(tickers)` REST call. This seeds the renderer with the current price **and** the previous-close baseline (`prevClose`) needed to compute the daily-change figure. The REST seed is the **only** source of `prevClose`.
2. **Live stream.** After the seed, all updates flow through `provider.stream('stockQuotes', tickers)` — a single WebSocket exposed as an RxJS `Observable<StreamEvent<…>>`, filtered to the subscribed symbol set. Minute-bar frames become `StockQuote` ticks.

`change` / `changePercent` are computed in the adapter on the REST path and **omitted** from stream ticks. Stream frames carry no previous-close, so the renderer carries `prevClose` forward from the cached seed value and recomputes `change` itself on each render (`PriceCell.tsx`).

**Same feed for both paths (US-99).** The seed and the stream must come from the same data feed, or the first tick jumps against the seed. With Alpaca both are **IEX**: `GET /v2/stocks/snapshots?symbols=…&feed=iex` (one batched request) and `wss://stream.data.alpaca.markets/v2/iex` (`bars` channel). See [iex-feed-for-seed-and-stream](./iex-feed-for-seed-and-stream.md).

## Context / Why

- Pure REST polling wastes the streaming infrastructure US-31 already built and lags by up to 60 s.
- Pure streaming with no seed leaves the price column blank until the first tick (which can be slow in low-liquidity windows) and makes `change` uncomputable — no previous-close arrives on a stream frame.
- Stream-only with "remember the first tick of the session" drifts when the app is opened mid-session: the first observed tick isn't the open price.
- Combining streaming (for live updates) with a single REST call (for the per-day baseline) gives both real-time movement and accurate daily change with one initial round-trip.

## Alternatives considered

- **Pure REST polling** — story's original suggestion; wastes streaming, lags by up to 60 s.
- **Pure streaming, no seed** — rows blank until first tick; no `change` computable.
- **Stream-only with client-remembered "first price"** — drifts mid-session.
- **Compute change in main process per tick** — requires main to remember `prevClose` per ticker; same problem moved one layer up.
- **Stream events that carry `prevClose` on every tick** — the frame doesn't include it; main would have to inject it from cache, adding bookkeeping.
- **`delayed_sip` for the REST seed** (US-99) — consolidated quotes, but 15 minutes stale and a different feed from the real-time IEX stream.

## Consequences

- The renderer hook `useStockQuotes(tickers)` runs the REST seed as its `queryFn` and bridges stream ticks into the TanStack Query cache via `setQueryData` — see ADR [market-data-tanstack-cache](./market-data-tanstack-cache.md).
- `IpcStockQuote` carries `prevClose: string | null`: populated on the REST seed, `null` on a stream tick. The renderer merges by carrying the cached value forward (`event.quote.prevClose ?? prev?.[ticker]?.prevClose ?? null`).
- `change` / `changePercent` are **not** in `IpcStockQuote` — they're derived in the renderer per render from `(price, prevClose)`. This keeps the math in one place and prevents drift between a REST-returned `change` and a renderer-computed one after a tick.
- The REST seed maps `price = latestTrade.p`, real `bid`/`ask` from `latestQuote`, `prevClose = prevDailyBar.c`, `volume = dailyBar.v`; a snapshot without `latestTrade` is omitted from the map. Stream `b` frames map `price = bid = ask = c`, `volume = v`, empty `change`/`changePercent`/`prevClose`.
- The stream rides one websocket with per-symbol `bars` subscriptions reconciled on each `stream()` call (the free plan has no wildcard and a 30-symbol cap) — see [per-symbol-ws-subscription-reconciliation](./per-symbol-ws-subscription-reconciliation.md).

## Current state

The stream-first + one-shot-REST-seed design is intact and has now survived two vendor swaps: Alpaca (two-socket / MessagePack, US-31/32) → Massive (single JSON socket, `AM.*` wildcard, `market-data-massive-migration`) → Alpaca IEX (single JSON socket, per-symbol `bars`, US-99). In every version `prevClose` seeds only from the REST call and the renderer recomputes `change`/`changePercent` per render.

## Sources

- [extract: us-32](../../.extracts/us-32.md) — ADR "Transport — Stream-First with REST Seed"; ADR "Daily Change Calculation Split (Adapter vs Renderer)"
- [extract: market-data-massive-migration](../../.extracts/market-data-massive-migration.md) — historical Massive transport
- [extract: us-99](../../.extracts/us-99.md) — ADR "Stock data from IEX for both REST seeds and the stream"
- [feature: us-32-live-position-prices](../../features/us-32-live-position-prices.md), [feature: us-99-alpaca-market-data-provider](../../features/us-99-alpaca-market-data-provider.md)
<!-- /generated -->

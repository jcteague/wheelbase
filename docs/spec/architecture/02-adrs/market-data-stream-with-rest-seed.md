# ADR: Stream-first market data with one-shot REST seed
<!-- generated:from us-32 -->

## Decision

Live underlying prices are delivered to the renderer via the `MarketDataProvider`'s `stream('stockQuotes', tickers)` Observable. On every change to the ticker list, the main process also fires a one-shot `provider.getStockQuotes(tickers)` REST call to seed the renderer with both the current price **and** the previous-close baseline (`prev_daily_bar.c`) needed to compute the daily-change figure. After the seed, all updates flow through the WebSocket; the seed is the only source of `prevClose`.

`change` and `changePercent` are computed in the adapter on the REST path and **omitted** from stream events (Alpaca stream frames carry only `bp`/`ap`/`bs`/`as`/`t`). The renderer carries `prevClose` forward from the cached snapshot value and recomputes `change` itself on each render.

## Context / Why

- Pure REST polling wastes the streaming infrastructure US-31 already built and lags by up to 60 s.
- Pure streaming with no seed leaves the price column blank until the first tick (which can be slow in low-liquidity windows) and makes `change` uncomputable (no prev-close on the stream frame).
- Stream-only with "remember first tick of the session" drifts when the app is opened mid-session — the first observed tick isn't the open price.
- Combining streaming (for live updates) with a single REST call (for the per-day baseline) gives both real-time movement and accurate daily change with one initial round-trip.

## Alternatives considered

- **Pure REST polling** — story's original suggestion; wastes streaming, lags by up to 60 s.
- **Pure streaming, no seed** — rows blank until first tick; no `change` computable.
- **Stream-only with client-remembered "first price"** — drifts mid-session.
- **Compute change in main process per tick** — requires main to remember prev_close per ticker; same problem moved one layer up.

## Consequences

- The renderer hook `useStockQuotes(tickers)` runs the REST seed as its `queryFn` and bridges stream events into the TanStack Query cache via `setQueryData` — see ADR [market-data-tanstack-cache](./market-data-tanstack-cache.md).
- `IpcStockQuote` gains a `prevClose: string | null` field: populated on REST seed, `null` on stream tick. The renderer merges by carrying forward the cached value.
- `change` / `changePercent` are **not** in `IpcStockQuote` — they're derived in the renderer per render. This keeps the math in one place and prevents drift between REST-returned `change` and renderer-computed `change` after a tick.
- The REST adapter uses `getStocksSnapshots()` (returns `latest_quote` + `prev_daily_bar`) instead of `getStocksQuotesLatest`; per-entry, `mid = (bid+ask)/2`, `prevClose = prev_daily_bar.c`, `change = mid − prevClose`.

## Sources

- [extract: us-32](../../.extracts/us-32.md) — ADR "Transport — Stream-First with REST Seed"; ADR "Daily Change Calculation Split (Adapter vs Renderer)"
- [feature: us-32-live-position-prices](../../features/us-32-live-position-prices.md)
<!-- /generated -->

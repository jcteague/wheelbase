# ADR: Stream-first market data with one-shot REST seed

<!-- generated:from us-32,market-data-massive-migration -->

## Decision

Live underlying prices reach the renderer through two complementary paths off the single `MarketDataProvider`:

1. **One-shot REST seed.** On every change to the active-ticker list, the main process fires a single `provider.getStockQuotes(tickers)` REST call. This seeds the renderer with the current price **and** the previous-close baseline (`prevClose`) needed to compute the daily-change figure. The REST seed is the **only** source of `prevClose`.
2. **Live stream.** After the seed, all updates flow through `provider.stream('stockQuotes', tickers)` — a single JSON WebSocket exposed as an RxJS `Observable<StreamEvent<…>>`, filtered to the subscribed symbol set. Aggregate-minute (`ev:'AM'`) frames become `StockQuote` ticks.

`change` / `changePercent` are computed in the adapter on the REST path and **omitted** from stream ticks. Stream frames carry no previous-close, so the renderer carries `prevClose` forward from the cached seed value and recomputes `change` itself on each render (`PriceCell.tsx`).

The current provider is `MassiveMarketDataProvider` (`src/main/integrations/massive-market-data.ts`), a Polygon-compatible delayed-data vendor. The interface (`src/main/integrations/market-data-provider.ts`) is provider-agnostic; an env-switched `marketDataFactory` selects Massive (or `FakeMarketDataProvider` for e2e). See [market-data-massive-migration](../../features/market-data-massive-migration.md).

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

## Consequences

- The renderer hook `useStockQuotes(tickers)` runs the REST seed as its `queryFn` and bridges stream ticks into the TanStack Query cache via `setQueryData` — see ADR [market-data-tanstack-cache](./market-data-tanstack-cache.md).
- `IpcStockQuote` carries `prevClose: string | null`: populated on the REST seed, `null` on a stream tick. The renderer merges by carrying the cached value forward (`event.quote.prevClose ?? prev?.[ticker]?.prevClose ?? null`).
- `change` / `changePercent` are **not** in `IpcStockQuote` — they're derived in the renderer per render from `(price, prevClose)`. This keeps the math in one place and prevents drift between a REST-returned `change` and a renderer-computed one after a tick.
- The REST adapter calls the Massive stock-snapshot endpoint `GET /v2/snapshot/locale/us/markets/stocks/tickers/{ticker}` and derives `prevClose` from the snapshot's previous-day bar plus `change`/`changePercent` from the aggregate-bar fields (`todaysChange` / `todaysChangePerc`). Massive returns aggregate bars with no live bid/ask, so `price`/`bid`/`ask` all carry the last-minute close.
- The stream rides a single WebSocket (`wss://delayed.massive.com/stocks`, JSON: `{action:'auth',params:<apiKey>}` then `{action:'subscribe',params:'AM.*'}`) rather than a per-feed socket — see [market-data-massive-migration](../../features/market-data-massive-migration.md).

## Current state

The stream-first + one-shot-REST-seed design is intact and current. The transport was migrated from Alpaca to **Massive** (Polygon-compatible) in the `market-data-massive-migration` retro plan; the Alpaca two-socket / MessagePack streaming and the `bp`/`ap`/`bs`/`as`/`t` quote-frame shape no longer exist in the codebase. Streaming is now a single JSON WebSocket surfaced as an RxJS Observable; `prevClose` still seeds only from the REST call, and the renderer still recomputes `change`/`changePercent` per render.

## Sources

- [extract: us-32](../../.extracts/us-32.md) — ADR "Transport — Stream-First with REST Seed"; ADR "Daily Change Calculation Split (Adapter vs Renderer)"
- [extract: market-data-massive-migration](../../.extracts/market-data-massive-migration.md) — ADRs "Single JSON WebSocket for streaming", "REST over `fetch`", "Massive replaces Alpaca as the market-data provider"
- [feature: us-32-live-position-prices](../../features/us-32-live-position-prices.md)
- [feature: market-data-massive-migration](../../features/market-data-massive-migration.md)
<!-- /generated -->

# US-32: Live Position Prices

<!-- generated:from us-32,market-data-massive-migration -->

## Summary

Adds a live `Price` column to the Positions list (between `Phase` and `Strike`) showing real-time underlying price and signed daily change, plus a session-aware market status pill in the page header. The renderer's TanStack Query cache is seeded once via REST and then continuously updated by WebSocket ticks bridged through push events from the US-31 `MarketDataProvider`. A stale-data banner surfaces when no quotes have arrived for >5 minutes or a stream error fires.

## Acceptance criteria

- During regular hours, each active position row shows the underlying's current price with a green `LIVE` indicator.
- Prices update from stream ticks with no full reload or spinner.
- Signed daily change displays next to price (green for positive, red for negative).
- When the market is closed, last close shows with a gray `CLOSED` indicator; in pre/post sessions, the indicator is amber `EXT`.
- Missing quotes render `—` with an "unavailable" tooltip; other position data still displays.
- When the last update is >5 min old, an amber banner appears and the pill switches to `DELAYED`.

## What was built

A stream-first market-data pipeline for stock quotes. The main process owns a single `MarketDataProvider` instance — today a `MassiveMarketDataProvider` built lazily via `marketDataFactory.create()` and connected on first subscription request. `src/main/ipc/market-data.ts` exposes two request/response handlers (`stock-quotes`, `set-stock-quote-tickers`) plus two fire-and-forget push events (`stock-quote`, `stream-error`); market-status is served separately by the broker handler `broker:market-status`. On every active-ticker change the renderer calls `setStockQuoteTickers`, which tears down the prior subscription, subscribes to the provider's RxJS `Observable` (`provider.stream('stockQuotes', tickers)`, fed by Massive's single JSON WebSocket aggregate-minute frames), and forwards each frame as a `market-data:stock-quote` event.

The renderer's `useStockQuotes` hook uses TanStack Query as the single cache: a REST seed (via `queryFn`) populates `prevClose` once per ticker from Massive's stock snapshot endpoint; subsequent stream ticks merge into the cache via `setQueryData`, carrying `prevClose` forward. `change` and `changePercent` are computed at render time from `(price, prevClose)`. Staleness is detected from `dataUpdatedAt` against `STALE_THRESHOLD_MS` (5 min → `DELAYED`), and `useMarketStatus` polls `broker:market-status` every 60s for session boundaries. Three new presentational components — `MarketStatusPill`, `PriceCell`, `StaleDataBanner` — plus changes to `PositionCard` and `PositionsListPage` deliver the UI.

## Revisions

- **us-32** (original): shipped the live Price column, market-status pill, and stale-data banner against the Alpaca-era `MarketDataProvider` — REST seed via Alpaca `getStocksSnapshots` (`prev_daily_bar.c`) and the Alpaca streaming socket.
- **market-data-massive-migration**: re-pointed the whole pipeline at the Massive provider. `getStockQuotes` now returns `Promise<Map<string, StockQuote>>` from `MassiveMarketDataProvider`; the REST seed reads Massive's snapshot endpoint (`/v2/snapshot/locale/us/markets/stocks/tickers/{ticker}`) for `prevClose`; streaming is a single JSON WebSocket (`wss://delayed.massive.com/stocks`, aggregate-minute `AM` frames) exposed as an RxJS `Observable`; the provider is built via `marketDataFactory.create()` (not `createMarketDataProvider`); and market status moved off `market-data:*` onto the broker namespace as `broker:market-status` — there is no `market-data:market-status` channel.

## Architecture decisions

- Stream-first transport with REST seed for `prevClose`; provider lifecycle, push event channels, and stale-data detection → [domain/market-data.md](../domain/market-data.md)
- IPC handler shape (`{ ok: true, ... } | { ok: false, errors }`) and `MarketDataError` → IPC error code mapping → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `prevClose` is sourced from the market-data provider's stock-quote payload so the renderer can compute `change`/`changePercent`; the provider is Massive-based (see [us-31](./us-31-market-data-provider-adapter.md)), not the Alpaca SDK → [domain/market-data.md](../domain/market-data.md)
- Renderer state shape: single TanStack Query cache as the bridge between REST seed and stream ticks; `useStockQuotes` + `useMarketStatus` as two TanStack-backed hooks → [domain/market-data.md](../domain/market-data.md)
- Renderer-side ADRs without dedicated topic pages:
  - **Daily change computed renderer-side** from `(price, prevClose)`; stream ticks emit `prevClose: null` and the renderer carries the seed value forward.
  - **Stale precedence** — `streamError != null` or `now − dataUpdatedAt > 300_000` overrides `session` and forces the pill to `DELAYED`.
  - **Type sharing** — IPC-flat types live in `src/preload/index.d.ts`; renderer re-exports aliases from `src/renderer/src/api/market-data.ts` so renderer code never imports from `src/main/`.

## Contracts touched

- `market-data:stock-quotes` — REST snapshot handler returning the envelope `{ quotes: Record<string, IpcStockQuote> }` (keyed by ticker; the renderer adapter unwraps `result.quotes`), not a bare record → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `market-data:set-stock-quote-tickers` — subscription mutation; manages stream lifecycle and connects the provider on demand → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `broker:market-status` — request/response for session info, polled every 60 s by `useMarketStatus`; there is no `market-data:market-status` channel → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `market-data:stock-quote` (push event) — per-tick delta forwarded from the Observable; `prevClose` always `null` → [domain/market-data.md](../domain/market-data.md)
- `market-data:stream-error` (push event) — relays provider `StreamError`; renderer surfaces the banner immediately → [domain/market-data.md](../domain/market-data.md)
- `GetStockQuotesPayloadSchema` / `SetStockQuoteTickersPayloadSchema` — Zod: `tickers: TickerListSchema` = `z.array(z.string().min(1).max(MAX_TICKER_LENGTH)).max(MAX_TICKERS_PER_REQUEST)`, where the constants are `MAX_TICKER_LENGTH = 10` and `MAX_TICKERS_PER_REQUEST = 50` → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `StockQuote` (provider type) — extended with `prevClose: string` → [domain/market-data.md](../domain/market-data.md)
- `IpcStockQuote` — IPC-flat shape with `prevClose: string | null` (set on REST seed, null on tick) → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- Preload bridge: stock quotes are namespaced as `window.api.marketData.stockQuotes` and market status as `window.api.broker.marketStatus`; `setStockQuoteTickers`, `onStockQuote`, `onStreamError` are flat on `window.api` → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `marketDataQueryKeys.stockQuotes` — `['market', 'stock-quotes', [...tickers].sort().join(',')]` (prefix is `'market'`). Market status is not in `marketDataQueryKeys`; it lives in `brokerQueryKeys.marketStatus = ['broker', 'market-status']`, consumed by `useMarketStatus`.

## Source files

- `src/main/integrations/market-data-provider.ts` — provider-agnostic interface; `StockQuote` carries `prevClose`; `getStockQuotes` returns `Promise<Map<string, StockQuote>>`
- `src/main/integrations/massive-market-data.ts` — `MassiveMarketDataProvider`: REST snapshot seed (`prevClose` from previous-day bar) + single-JSON-WebSocket stream bridge
- `src/main/integrations/market-data-factory.ts` — `marketDataFactory` (`configure`/`create`/`recreate`/`disconnect`)
- `src/main/ipc/broker.ts` — serves `broker:market-status` (no `market-data:market-status` channel)
- `src/main/schemas.ts` — added `GetStockQuotesPayloadSchema`, `SetStockQuoteTickersPayloadSchema`
- `src/main/ipc/market-data.ts` — new: `registerMarketDataHandlers` + stream-to-push bridge
- `src/main/index.ts` — provider singleton, `before-quit` disconnect
- `src/preload/index.ts`, `src/preload/index.d.ts` — bridge methods + IPC-flat types
- `src/renderer/src/api/market-data.ts` — renderer adapter and renderer-side type aliases
- `src/renderer/src/hooks/marketDataQueryKeys.ts`
- `src/renderer/src/hooks/useMarketStatus.ts`
- `src/renderer/src/hooks/useStockQuotes.ts` — REST seed + stream bridge
- `src/renderer/src/components/MarketStatusPill.tsx`
- `src/renderer/src/components/PriceCell.tsx`
- `src/renderer/src/components/StaleDataBanner.tsx`
- `src/renderer/src/components/PositionCard.tsx` — inserted `PriceCell` between Phase and Strike
- `src/renderer/src/pages/PositionsListPage.tsx` — derives tickers, mounts pill + banner
- `src/renderer/src/lib/market-status.ts` — `deriveMarketStatusDisplay` (refactor extraction)
- `src/renderer/src/index.css` — `@keyframes wb-pulse`
- `e2e/live-underlying-price.spec.ts` — 7 e2e tests (one per AC)
<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->

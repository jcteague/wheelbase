# US-32: Live Position Prices

<!-- generated:from us-32 -->

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

A stream-first market-data pipeline for stock quotes. The main process owns a single `MarketDataProvider` instance (connected lazily on first subscription request), and `src/main/ipc/market-data.ts` exposes three request/response handlers (`stock-quotes`, `set-stock-quote-tickers`, `market-status`) plus two fire-and-forget push events (`stock-quote`, `stream-error`). On every active-ticker change the renderer calls `setStockQuoteTickers`, which tears down the prior Observable subscription, subscribes to `provider.stream('stockQuotes', tickers)`, and forwards each frame as a `market-data:stock-quote` event.

The renderer's `useStockQuotes` hook uses TanStack Query as the single cache: a REST seed (via `queryFn`) populates `prevClose` once per ticker; subsequent stream ticks merge into the cache via `setQueryData`, carrying `prevClose` forward. `change` and `changePercent` are computed at render time from `(price, prevClose)`. Staleness is detected from `dataUpdatedAt` (>5 min → `DELAYED`), and `useMarketStatus` polls `market-data:market-status` every 60s for session boundaries. Three new presentational components — `MarketStatusPill`, `PriceCell`, `StaleDataBanner` — plus changes to `PositionCard` and `PositionsListPage` deliver the UI.

## Architecture decisions

- Stream-first transport with REST seed for `prevClose`; provider lifecycle, push event channels, and stale-data detection → [domain/market-data.md](../domain/market-data.md)
- IPC handler shape (`{ ok: true, ... } | { ok: false, errors }`) and `MarketDataError` → IPC error code mapping → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- Alpaca SDK switch from `getStocksQuotesLatest` to `getStocksSnapshots` so `prev_daily_bar.c` is available to compute `change`/`changePercent` in the adapter → [contracts/alpaca-integration.md](../contracts/alpaca-integration.md)
- Renderer state shape: single TanStack Query cache as the bridge between REST seed and stream ticks; `useStockQuotes` + `useMarketStatus` as two TanStack-backed hooks → [domain/market-data.md](../domain/market-data.md)
- Renderer-side ADRs without dedicated topic pages:
  - **Daily change computed renderer-side** from `(price, prevClose)`; stream ticks emit `prevClose: null` and the renderer carries the seed value forward.
  - **Stale precedence** — `streamError != null` or `now − dataUpdatedAt > 300_000` overrides `session` and forces the pill to `DELAYED`.
  - **Type sharing** — IPC-flat types live in `src/preload/index.d.ts`; renderer re-exports aliases from `src/renderer/src/api/market-data.ts` so renderer code never imports from `src/main/`.

## Contracts touched

- `market-data:stock-quotes` — REST snapshot handler returning `Record<string, IpcStockQuote>` keyed by ticker → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `market-data:set-stock-quote-tickers` — subscription mutation; manages stream lifecycle and connects the provider on demand → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `market-data:market-status` — request/response for session info, polled every 60 s → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `market-data:stock-quote` (push event) — per-tick delta forwarded from the Observable; `prevClose` always `null` → [domain/market-data.md](../domain/market-data.md)
- `market-data:stream-error` (push event) — relays provider `StreamError`; renderer surfaces the banner immediately → [domain/market-data.md](../domain/market-data.md)
- `GetStockQuotesPayloadSchema` / `SetStockQuoteTickersPayloadSchema` — Zod: `tickers: z.array(z.string().min(1).max(10)).max(50)` → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `StockQuote` (provider type) — extended with `prevClose: string` → [contracts/alpaca-integration.md](../contracts/alpaca-integration.md)
- `IpcStockQuote` — IPC-flat shape with `prevClose: string | null` (set on REST seed, null on tick) → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- Preload bridge: `window.api.getStockQuotes`, `setStockQuoteTickers`, `getMarketStatus`, `onStockQuote`, `onStreamError` → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `marketDataQueryKeys` — `['market-data', 'stock-quotes', sortedTickers.join(',')]`, `['market-data', 'market-status']`.

## Source files

- `src/main/integrations/market-data-provider.ts` — extended `StockQuote` with `prevClose`
- `src/main/integrations/market-data-factory.ts`
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

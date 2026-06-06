# ADR: TanStack Query as the single cache for live stock quotes

<!-- generated:from us-32 -->

## Decision

Live stock quotes live in a single TanStack Query cache entry: `queryKey: ['market-data', 'stock-quotes', sortedTickers.join(',')]`, `queryFn` calls `market-data:stock-quotes` (the REST snapshot), `staleTime: Infinity` (so stream ticks are the only live signal), `refetchOnWindowFocus: true` (refresh `prevClose` when the user comes back).

In the same hook (`useStockQuotes(tickers)`), a side effect:

1. Calls `window.api.setStockQuoteTickers(sortedTickers)` to (re)subscribe.
2. Registers `onStockQuote` / `onStreamError` listeners.
3. Merges each tick into the cached map via `queryClient.setQueryData(queryKey, prev => mergeTick(prev, event))`, carrying `prevClose` forward from the cached value (`event.quote.prevClose ?? prev?.[ticker]?.prevClose ?? null`).

`useMarketStatus()` is a sibling hook with `refetchInterval: 60_000`, `staleTime: 30_000` — see ADR [market-status-pill](./market-status-pill.md).

`tickers.slice().sort()` keeps the cache key stable across input ordering.

## Context / Why

- TanStack Query is already the project's server-state cache; using it for live quotes means one cache, one stale-time clock, and one dedup story.
- `setQueryData` is TanStack Query's intended escape hatch for push-based mutations.
- `dataUpdatedAt` (bumped by both `queryFn` resolution and `setQueryData`) is the natural freshness signal for the stale-data detection (see ADR [market-data-stale-detection](./market-data-stale-detection.md)).
- Sharing the cache means multiple components on the same ticker list reuse data without duplicate fetches.

## Alternatives considered

- **Custom `useSyncExternalStore` external store** — duplicates state machinery, requires bespoke tests for caching/stale logic.
- **Two-store mix (TanStack Query for REST, `useSyncExternalStore` for stream)** — two stores fight each other; React 19 may render a stale view in the brief gap before the merged hook re-syncs.
- **Plain `useState` per component** — loses dedup, loses cache.

## Consequences

- `useStockQuotes` returns `UseQueryResult<StockQuotesByTicker> & { streamError: IpcStreamErrorEvent | null }`. Effect cleanup resets `streamError` so a successful re-subscribe clears the stale flag.
- `marketDataQueryKeys` lives in `src/renderer/src/hooks/marketDataQueryKeys.ts` and exports `stockQuotes(tickers)` and `marketStatus`.
- The `enabled: sortedTickers.length > 0` guard prevents the REST query from firing when there are no tickers to subscribe to.
- Renderer never imports from `src/main/`; IPC-flat types live in `src/preload/index.d.ts`, re-exported with renderer aliases via `src/renderer/src/api/market-data.ts`.

## Sources

- [extract: us-32](../../.extracts/us-32.md) — ADR "Renderer State — Single TanStack Query Cache + Stream Bridge"; ADR "Two TanStack Query-Backed Hooks"; ADR "Type Sharing Across the Bridge"
- [feature: us-32-live-position-prices](../../features/us-32-live-position-prices.md)
<!-- /generated -->

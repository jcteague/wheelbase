# ADR: TanStack Query as the single cache for live stock quotes

<!-- generated:from us-32,market-data-massive-migration -->

## Decision

Live stock quotes are read live from the market-data provider and cached **client-side in TanStack Query** — never persisted to SQLite. They live in a single TanStack Query cache entry: `queryKey: ['market', 'stock-quotes', sortedTickers.join(',')]`, `queryFn` calls `market-data:stock-quotes` (the REST snapshot via the provider), `staleTime: Infinity` (so stream ticks are the only live signal), `refetchOnWindowFocus: true` (refresh `prevClose` when the user comes back).

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
- Quotes are inherently transient (delayed Massive data, valid only for the moment they arrive), so there is nothing worth durably storing — they are held in renderer memory and discarded on app close. This is why no SQLite table, migration, or persistence path exists for market data.

## Alternatives considered

- **Custom `useSyncExternalStore` external store** — duplicates state machinery, requires bespoke tests for caching/stale logic.
- **Two-store mix (TanStack Query for REST, `useSyncExternalStore` for stream)** — two stores fight each other; React 19 may render a stale view in the brief gap before the merged hook re-syncs.
- **Plain `useState` per component** — loses dedup, loses cache.
- **Persisting quotes to SQLite** — never considered worthwhile: market-data reads are delayed snapshots with no journaling value, unlike the wheel-domain tables that are the source of truth.

## Consequences

- `useStockQuotes` returns `UseQueryResult<StockQuotesByTicker> & { streamError: IpcStreamErrorEvent | null; stale: boolean; minutesAgo: number }`. Effect cleanup resets `streamError` so a successful re-subscribe clears the stale flag.
- `marketDataQueryKeys` lives in `src/renderer/src/hooks/marketDataQueryKeys.ts` and exports `stockQuotes(tickers)` (and `optionSnapshots(symbols)`). The market-status key is **not** in this family — it lives on `brokerQueryKeys.marketStatus`, and `useMarketStatus()` reads from `../api/broker` (see ADR [market-status-pill](./market-status-pill.md) and [vendor-scoped-query-keys](./vendor-scoped-query-keys.md)).
- The `enabled: sortedTickers.length > 0` guard prevents the REST query from firing when there are no tickers to subscribe to.
- Renderer never imports from `src/main/`; IPC-flat types live in `src/preload/index.d.ts`, re-exported with renderer aliases via `src/renderer/src/api/market-data.ts`.
- The underlying provider is `MassiveMarketDataProvider` (Massive replaced Alpaca for market data; the broker stays Alpaca on a separate `broker:*` namespace). The cache contract is provider-agnostic — switching vendors does not touch this hook (see ADR [market-data-provider-interface](./market-data-provider-interface.md)).

## Sources

- [extract: us-32](../../.extracts/us-32.md) — ADR "Renderer State — Single TanStack Query Cache + Stream Bridge"; ADR "Two TanStack Query-Backed Hooks"; ADR "Type Sharing Across the Bridge"
- [extract: market-data-massive-migration](../../.extracts/market-data-massive-migration.md) — Schema Changes ("read live and cached client-side (TanStack Query), never persisted to SQLite"); ADR "Massive replaces Alpaca as the market-data provider"
- [feature: us-32-live-position-prices](../../features/us-32-live-position-prices.md)
<!-- /generated -->

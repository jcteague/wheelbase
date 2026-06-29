---
page: docs/spec/architecture/02-adrs/market-data-tanstack-cache.md
audited_at: 2026-06-29
findings: 3
---

# Audit: docs/spec/architecture/02-adrs/market-data-tanstack-cache.md

## Verified (12)

- ✓ Quotes cached client-side in TanStack Query via `useQuery` — `src/renderer/src/hooks/useStockQuotes.ts:38`.
- ✓ Never persisted to SQLite — no market-data table/column in `migrations/` (grep for `stock_quote|market_data|quote` returns nothing).
- ✓ `queryFn` calls the provider REST snapshot via `market-data:stock-quotes` — `getStockQuotes` → `window.api.marketData.stockQuotes` (`src/renderer/src/api/market-data.ts:40-41`), preload channel `market-data:stock-quotes` (`src/preload/index.ts:51`), handler registered at `src/main/ipc/market-data.ts:29`.
- ✓ `staleTime: Infinity` — `src/renderer/src/hooks/useStockQuotes.ts:42`.
- ✓ `refetchOnWindowFocus: true` — `src/renderer/src/hooks/useStockQuotes.ts:43`.
- ✓ Side effect calls `setStockQuoteTickers(sortedTickers)` to (re)subscribe — `src/renderer/src/hooks/useStockQuotes.ts:54`.
- ✓ Registers `onStockQuote` / `onStreamError` listeners — `src/renderer/src/hooks/useStockQuotes.ts:75,81`.
- ✓ Merges each tick via `queryClient.setQueryData(queryKey, prev => mergeTick(prev, event))` carrying `prevClose` forward (`event.quote.prevClose ?? prev?.[ticker]?.prevClose ?? null`) — `src/renderer/src/hooks/useStockQuotes.ts:76-78` and `mergeTick` at lines 6-15.
- ✓ `useMarketStatus()` sibling hook with `refetchInterval: 60_000`, `staleTime: 30_000` — `src/renderer/src/hooks/useMarketStatus.ts:6-7,14-15`; reads `brokerQueryKeys.marketStatus` from `../api/broker`, **not** the market-data key family (`useMarketStatus.ts:2,11`; key defined `src/renderer/src/hooks/brokerQueryKeys.ts:4` as `['broker', 'market-status']`).
- ✓ `enabled: sortedTickers.length > 0` guard — `src/renderer/src/hooks/useStockQuotes.ts:41`.
- ✓ `marketDataQueryKeys` lives in `src/renderer/src/hooks/marketDataQueryKeys.ts` and exports `stockQuotes(tickers)` and `optionSnapshots(symbols)` — file confirmed.
- ✓ Sorted/stable cache key across input ordering — `[...tickers].sort().join(',')` (`marketDataQueryKeys.ts:3`) and `tickers.slice().sort()` derivation (`useStockQuotes.ts:30`).
- ✓ Underlying provider is `MassiveMarketDataProvider` — `src/main/integrations/massive-market-data.ts:104`, wired in `src/main/integrations/market-data-factory.ts:19`.

## Drift (2)

- ✗ Page (line 7) claims `queryKey: ['market-data', 'stock-quotes', sortedTickers.join(',')]`, but the actual key prefix is `'market'`, not `'market-data'`: `marketDataQueryKeys.stockQuotes` returns `['market', 'stock-quotes', [...tickers].sort().join(',')]` (`src/renderer/src/hooks/marketDataQueryKeys.ts:2-3`). Suggested fix: change the documented key to `['market', 'stock-quotes', sortedTickers.join(',')]`.

- ✗ Page (line 36) claims `useStockQuotes` returns `UseQueryResult<StockQuotesByTicker> & { streamError: IpcStreamErrorEvent | null }`. The actual type also adds `stale: boolean` and `minutesAgo: number`, and the `UseQueryResult` error type param is `Error` not the default — `UseQueryResult<StockQuotesByTicker, Error> & { streamError: IpcStreamErrorEvent | null; stale: boolean; minutesAgo: number }` (`src/renderer/src/hooks/useStockQuotes.ts:20-24`). Suggested fix: extend the documented return shape to include `stale` and `minutesAgo` (these feed the stale-detection ADR).

## Unverifiable (1)

- ? Page (line 39) claims "Renderer never imports from `src/main/`; IPC-flat types live in `src/preload/index.d.ts`, re-exported with renderer aliases via `src/renderer/src/api/market-data.ts`." `market-data.ts` does define/re-export renderer-aliased types (`StockQuote`, `StockQuotesByTicker`, etc.) and imports nothing from `src/main/`; the codebase-wide "renderer never imports from src/main" invariant is narrative and not mechanically verified here.

## Missing files (0)

- None. Linked ADRs (`market-status-pill.md`, `market-data-stale-detection.md`, `vendor-scoped-query-keys.md`, `market-data-provider-interface.md`) and the extracts/feature pages referenced are sibling-relative; existence not exhaustively checked but no broken-path indicators found in the cited claims.

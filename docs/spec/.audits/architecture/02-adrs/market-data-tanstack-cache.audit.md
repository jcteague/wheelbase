---
page: docs/spec/architecture/02-adrs/market-data-tanstack-cache.md
audited_at: 2026-06-27
findings: 3
---

# Audit: market-data-tanstack-cache.md

## Verified (7)

- ✓ Single TanStack Query cache entry with `staleTime: Infinity`, `refetchOnWindowFocus: true`, `enabled: sortedTickers.length > 0` — `src/renderer/src/hooks/useStockQuotes.ts:39-43`.
- ✓ `queryFn` calls the REST snapshot via `getStockQuotes(sortedTickers)` — `src/renderer/src/hooks/useStockQuotes.ts:40`.
- ✓ Side effect calls `setStockQuoteTickers(sortedTickers)` to (re)subscribe and registers `onStockQuote` / `onStreamError` — `src/renderer/src/hooks/useStockQuotes.ts:54,75,81`.
- ✓ Ticks merged via `queryClient.setQueryData(queryKey, prev => mergeTick(prev, event))` carrying `prevClose` forward — `src/renderer/src/hooks/useStockQuotes.ts:76,12`.
- ✓ Stable cache key via `tickers.slice().sort()` — `src/renderer/src/hooks/useStockQuotes.ts:30`; key builder sorts: `[...tickers].sort().join(',')` — `src/renderer/src/hooks/marketDataQueryKeys.ts:3`.
- ✓ `marketDataQueryKeys` lives at `src/renderer/src/hooks/marketDataQueryKeys.ts` and exports `stockQuotes(tickers)`.
- ✓ Renderer-aliased IPC types re-exported via `src/renderer/src/api/market-data.ts` (e.g. `prevClose: string | null` at line 7); renderer does not import from `src/main/`.

## Drift (3)

- ✗ Page (line 7) claims `queryKey: ['market-data', 'stock-quotes', ...]`. Actual first segment is `'market'`, not `'market-data'`: `['market', 'stock-quotes', ...]` — `src/renderer/src/hooks/marketDataQueryKeys.ts:3` (confirmed by test `marketDataQueryKeys.test.ts:6` asserting `[0] === 'market'`). Suggested fix: update the page key to `['market', 'stock-quotes', ...]`.
- ✗ Page (line 35) claims `marketDataQueryKeys` exports `marketStatus`. It does not — the module exports only `stockQuotes` and `optionSnapshots` (`marketDataQueryKeys.ts:1-6`). The market-status key lives in `brokerQueryKeys.marketStatus` and is used by `useMarketStatus` — `src/renderer/src/hooks/useMarketStatus.ts:11`. Suggested fix: remove the `marketStatus` claim and note it lives on `brokerQueryKeys`.
- ✗ Page (line 15, 34) implies `useMarketStatus` is in the market-data family. It actually reads from `../api/broker` and `brokerQueryKeys` — `src/renderer/src/hooks/useMarketStatus.ts:2,11`. Minor: cadence values `refetchInterval: 60_000`, `staleTime: 30_000` are correct (lines 6-7).

## Unverifiable (1)

- ? Return type claim `UseQueryResult<StockQuotesByTicker> & { streamError: ... }` and "cleanup resets streamError" — partially narrative; effect registers `onStreamError` (line 81) but the exact returned shape was not fully traced. Flag for human review.

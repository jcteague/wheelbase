---
page: docs/spec/architecture/02-adrs/market-data-tanstack-cache.md
audited_at: 2026-09-28
findings: 3
---

# Audit: market-data-tanstack-cache.md

## Verified (9)

- ✓ Query key `['market', 'stock-quotes', sorted.join(',')]` — `src/renderer/src/hooks/marketDataQueryKeys.ts:3-4`; used in `useStockQuotes.ts:35`.
- ✓ `queryFn` → `getStockQuotes` (REST), `staleTime: Infinity`, `refetchOnWindowFocus: true`, `enabled: sortedTickers.length > 0` — `src/renderer/src/hooks/useStockQuotes.ts:38-44`.
- ✓ Effect calls `window.api.setStockQuoteTickers({ tickers: sortedTickers })`, registers `onStockQuote` / `onStreamError`, merges via `setQueryData(queryKey, prev => mergeTick(prev, event))` — `useStockQuotes.ts:46-92`; carry-forward at `:12`.
- ✓ Ticker list sorted for a stable key (`tickers.slice().sort()`) — `useStockQuotes.ts:29`.
- ✓ Return type `UseQueryResult<StockQuotesByTicker, Error> & { streamError; stale; minutesAgo }` — `useStockQuotes.ts:20-24`; cleanup resets `streamError` — `:86-91`.
- ✓ `marketDataQueryKeys` exports `stockQuotes` and `optionSnapshots` — `marketDataQueryKeys.ts:3-6`.
- ✓ `useMarketStatus()` `refetchInterval: 60_000`, `staleTime: 30_000` — `src/renderer/src/hooks/useMarketStatus.ts:6-16`.
- ✓ No SQLite table for live quotes — no stock-quote table in `migrations/` (quotes held in the TanStack cache only).
- ✓ `src/preload/index.d.ts` and `src/renderer/src/api/market-data.ts` exist and carry the flat IPC types.

## Drift (3)

- ✗ Line 37 says the market-status key "is **not** in this family — it lives on `brokerQueryKeys.marketStatus`, and `useMarketStatus()` reads from `../api/broker`". Since US-116 it is `marketDataQueryKeys.marketStatus = ['market', 'status']` (`marketDataQueryKeys.ts:2`), and `useMarketStatus` imports `getMarketStatus` from `../api/market-data` (`useMarketStatus.ts:2, 11-12`). Suggested fix: match the market-status-pill ADR.
- ✗ Line 40 says the underlying provider "is `MassiveMarketDataProvider` (Massive replaced Alpaca …)". The factory builds `AlpacaMarketDataProvider` (`src/main/integrations/market-data-factory.ts:17-22`); no `massive-*` file exists in `src/main/integrations/`. Massive was retired by US-99.
- ✗ Line 25 rationale describes quotes as "delayed Massive data" in the present tense; current quotes are Alpaca IEX real-time (`alpaca-market-data-mappers.ts:27`, `alpaca-market-data.ts:56`). Minor wording drift tied to the item above.

## Unverifiable (2)

- ? "One cache, one stale-time clock, one dedup story" and React 19 two-store tearing rationale — design intent.
- ? Line 39 "Renderer never imports from `src/main/`" — broad invariant; `api/market-data.ts` notes it hand-mirrors main types (`api/market-data.ts:21-22`), consistent, but not exhaustively checked. Also the renderer `api/market-data.ts` defines its own types rather than re-exporting from `index.d.ts`.

## Missing files (0)

None.

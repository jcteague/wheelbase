---
page: docs/spec/architecture/02-adrs/market-data-stream-with-rest-seed.md
audited_at: 2026-06-27
findings: 5
---

# Audit: market-data-stream-with-rest-seed.md

## Verified (4)

- ✓ `provider.stream('stockQuotes', tickers)` returns an Observable — `src/main/integrations/massive-market-data.ts:256` and the interface `src/main/integrations/market-data-provider.ts:91`.
- ✓ `provider.getStockQuotes(tickers)` exists and is the REST seed used by the service — `src/main/integrations/massive-market-data.ts:185`, called in `src/main/services/market-data.ts:45`.
- ✓ `IpcStockQuote` carries `prevClose: string | null` and does NOT carry `change` / `changePercent` — `src/preload/index.d.ts:210-217`. Confirmed by negative assertions in `src/main/ipc/market-data.test.ts:291-292`.
- ✓ Renderer carries `prevClose` forward from the cached value: `event.quote.prevClose ?? prev?.[event.ticker]?.prevClose ?? null` — `src/renderer/src/hooks/useStockQuotes.ts:12`.

## Drift (1)

- ✗ Page (Consequences, line 30) claims "The REST adapter uses `getStocksSnapshots()` (returns `latest_quote` + `prev_daily_bar`) instead of `getStocksQuotesLatest`; per-entry, `mid = (bid+ask)/2`, `prevClose = prev_daily_bar.c`". The shipped provider is **Massive**, not Alpaca. `getStockQuotes` calls `GET /v2/snapshot/locale/us/markets/stocks/tickers/{ticker}` and derives values from `min.c` (price), `prevDay.c` (prevClose), `todaysChange` / `todaysChangePerc` — `src/main/integrations/massive-market-data.ts:185-209`. There is no `getStocksSnapshots()`, no `latest_quote`/`prev_daily_bar`, and no `(bid+ask)/2` mid in this path (Massive carries no live bid/ask; bid/ask are set equal to price). Suggested fix: rewrite the Alpaca-specific Consequences bullet to describe the Massive snapshot endpoint.

## Unverifiable (2)

- ? "Alpaca stream frames carry only `bp`/`ap`/`bs`/`as`/`t`" — the implementation pivoted to Massive (aggregate bar ticks), so the Alpaca frame-shape claim is no longer mechanically checkable against src and is narrative/historical.
- ? "the seed is the only source of `prevClose`" / change-recomputed-per-render rationale — design narrative; PriceCell recomputes change client-side (`src/renderer/src/components/PriceCell.tsx:21`) which is consistent, but the "only source" framing is narrative.

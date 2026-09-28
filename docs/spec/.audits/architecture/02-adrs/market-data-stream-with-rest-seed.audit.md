---
page: docs/spec/architecture/02-adrs/market-data-stream-with-rest-seed.md
audited_at: 2026-09-28
findings: 0
---

# Audit: market-data-stream-with-rest-seed.md

## Verified (9)

- ✓ REST seed via `provider.getStockQuotes(tickers)` — `src/main/services/market-data.ts:43-49`, invoked from `market-data:stock-quotes` (`src/main/ipc/market-data.ts:43-49`).
- ✓ Stream via `provider.stream('stockQuotes', tickers)` Observable — `services/market-data.ts:116`.
- ✓ `IpcStockQuote` has `prevClose: string | null` and no `change`/`changePercent` — `services/market-data.ts:11-18`; ticks set `prevClose: null` (`:117-118`).
- ✓ Renderer merge `event.quote.prevClose ?? prev?.[event.ticker]?.prevClose ?? null` — `src/renderer/src/hooks/useStockQuotes.ts:12`.
- ✓ Change recomputed in renderer from `(price, prevClose)` — `src/renderer/src/components/PriceCell.tsx:20-21`.
- ✓ IEX feed for both paths: `STOCK_FEED = 'iex'` (`src/main/integrations/alpaca-market-data-mappers.ts:27`), stream URL `wss://stream.data.alpaca.markets/v2/iex` (`alpaca-market-data.ts:56`).
- ✓ REST mapping `price = latestTrade.p`, bid/ask from `latestQuote`, `prevClose = prevDailyBar.c`, `volume = dailyBar.v`, omitted when no `latestTrade` — `alpaca-market-data-mappers.ts:56-73` (bid/ask fall back to trade price when `latestQuote` absent).
- ✓ Bar frame mapping `price = bid = ask = c`, `volume = v`, empty `change`/`changePercent`/`prevClose` — `mapBar`, `alpaca-market-data-mappers.ts:413-431`.
- ✓ `useStockQuotes` uses REST as `queryFn` and bridges ticks with `setQueryData` — `useStockQuotes.ts:39-43, 75-80`.

## Drift (0)

None.

## Unverifiable (2)

- ? Rationale (polling lag, mid-session drift) and rejected alternatives — design intent.
- ? Vendor history Alpaca → Massive → Alpaca IEX — framed as history.

## Missing files (0)

None.

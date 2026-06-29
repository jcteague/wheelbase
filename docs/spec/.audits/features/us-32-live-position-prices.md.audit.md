---
page: docs/spec/features/us-32-live-position-prices.md
audited_at: 2026-06-29
findings: 2
---

# Audit: docs/spec/features/us-32-live-position-prices.md

Page has been revised since the prior audit (2026-06-27): the Massive migration,
`broker:market-status` channel, namespaced preload bridge, and `TickerListSchema`
constants are now documented correctly. Remaining drift is limited to two
contract-precision claims.

## Verified (19)

- ✓ All 21 cited source files exist (`src/main/integrations/market-data-provider.ts`, `massive-market-data.ts`, `market-data-factory.ts`, `src/main/ipc/broker.ts`, `src/main/schemas.ts`, `src/main/ipc/market-data.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`, `src/renderer/src/api/market-data.ts`, `hooks/marketDataQueryKeys.ts`, `hooks/useMarketStatus.ts`, `hooks/useStockQuotes.ts`, `components/MarketStatusPill.tsx`, `PriceCell.tsx`, `StaleDataBanner.tsx`, `PositionCard.tsx`, `pages/PositionsListPage.tsx`, `lib/market-status.ts`, `index.css`, `e2e/live-underlying-price.spec.ts`).
- ✓ IPC request/response handlers `market-data:stock-quotes` and `market-data:set-stock-quote-tickers` registered in `src/main/ipc/market-data.ts:29,37`.
- ✓ Push events `market-data:stock-quote` and `market-data:stream-error` sent in `src/main/ipc/market-data.ts:45,46`.
- ✓ Market status served on broker namespace as `broker:market-status` (`src/main/ipc/broker.ts:24`); no `market-data:market-status` channel — confirmed by negative grep and test assertion `market-data.test.ts:593`.
- ✓ `registerMarketDataHandlers` exported from `src/main/ipc/market-data.ts:23`.
- ✓ `GetStockQuotesPayloadSchema` / `SetStockQuoteTickersPayloadSchema` in `src/main/schemas.ts:363,368`; `TickerListSchema` = `z.array(z.string().min(1).max(MAX_TICKER_LENGTH)).max(MAX_TICKERS_PER_REQUEST)` (`schemas.ts:359-361`); `MAX_TICKER_LENGTH = 10`, `MAX_TICKERS_PER_REQUEST = 50` (`schemas.ts:356-357`).
- ✓ Provider type `StockQuote` carries `prevClose: string` (`market-data-provider.ts:25,31`); `getStockQuotes(...)` returns `Promise<Map<string, StockQuote>>` (`market-data-provider.ts:85`); `stream(...)` present (`:91`).
- ✓ `marketDataFactory` exposes `configure`/`create`/`recreate`/`disconnect` (`market-data-factory.ts:28-41`).
- ✓ `IpcStockQuote` is IPC-flat with `prevClose: string | null` (`src/preload/index.d.ts:210,214`).
- ✓ Preload bridge: `window.api.marketData.stockQuotes` (`index.ts:50-51`), `window.api.broker.marketStatus` (`index.ts:38`; d.ts:447); `setStockQuoteTickers`, `onStockQuote`, `onStreamError` flat on `window.api` (`index.ts:30,33,34`).
- ✓ Massive stream is single JSON WebSocket `wss://delayed.massive.com/stocks` with aggregate-minute `AM` frames (`massive-market-data.ts:17,25,286,294`); REST snapshot endpoint `/v2/snapshot/locale/us/markets/stocks/tickers/{ticker}` (`:190`); `prevClose` from previous-day/last-minute bar (`:193`).
- ✓ `useStockQuotes`: REST seed via `queryFn: () => getStockQuotes(...)` (`useStockQuotes.ts:40`); stream ticks merge via `queryClient.setQueryData` carrying `prevClose` forward (`:12,76`); staleness from `dataUpdatedAt` against `STALE_THRESHOLD_MS = 5 * 60 * 1000` (`:17,99-100`).
- ✓ `change`/`changePercent` computed at render time from `(price, prevClose)` in `PriceCell.tsx:21-24` (decimal.js).
- ✓ Stale precedence forces `DELAYED`: `deriveMarketStatusDisplay` returns `'DELAYED'` when stale, else `LIVE`/`EXT`/`CLOSED` by session (`lib/market-status.ts:18-26`).
- ✓ `useMarketStatus` polls `broker:market-status` every 60s: `REFETCH_INTERVAL_MS = 60_000`, `refetchInterval` set (`useMarketStatus.ts:6,14`).
- ✓ `PriceCell` renders `—` with `title="Price unavailable"` and "unavailable" subtext when quote missing (`PriceCell.tsx:37-39`).
- ✓ `PriceCell` follows Phase (`PhaseBadge`) and precedes Strike in `PositionCard.tsx:119-128`.
- ✓ `@keyframes wb-pulse` in `src/renderer/src/index.css:299` (token `--animate-wb-pulse` at :104).
- ✓ `e2e/live-underlying-price.spec.ts` has 7 tests, one per AC (AC-1..AC-7), written with `it(...)` (`:181,196,225,247,268,300,324`).
- ✓ `src/main/index.ts`: provider configured/created via `marketDataFactory` (`:143,152`) and `before-quit` calls `marketDataFactory.disconnect()` (`:259-261`).

## Drift (2)

- ✗ Page line 51 claims `marketDataQueryKeys` = `['market-data', 'stock-quotes', sortedTickers.join(',')]` and `['market-data', 'market-status']`. Actual code (`marketDataQueryKeys.ts:2-3`) uses prefix `'market'`, not `'market-data'`: `['market', 'stock-quotes', [...tickers].sort().join(',')]`. There is no `market-status` entry in `marketDataQueryKeys` — the market-status key lives in `brokerQueryKeys.marketStatus = ['broker', 'market-status']` (`brokerQueryKeys.ts:4`), consumed by `useMarketStatus.ts:11`. Suggested fix: change to `['market', 'stock-quotes', ...]` and replace `['market-data', 'market-status']` with `brokerQueryKeys.marketStatus = ['broker', 'market-status']`.

- ✗ Page line 42 describes `market-data:stock-quotes` as "returning `Record<string, IpcStockQuote>` keyed by ticker." The handler returns the envelope payload `{ quotes: Record<string, IpcStockQuote> }` (`src/main/ipc/market-data.ts:31-33`; type `IpcGetStockQuotesResult = IpcResult<{ quotes: Record<string, IpcStockQuote> }>` at `index.d.ts:234`); the renderer adapter unwraps `result.quotes` (`api/market-data.ts:45`). Suggested fix: note the result is wrapped as `{ quotes: Record<string, IpcStockQuote> }`, not a bare record.

## Unverifiable (0)

(none)

## Missing files (0)

All cross-links resolve (`../domain/market-data.md`, `../contracts/ipc-handlers.md`, `./us-31-market-data-provider-adapter.md`).

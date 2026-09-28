---
page: docs/spec/features/us-32-live-position-prices.md
audited_at: 2026-09-28
findings: 7
---

# Audit: docs/spec/features/us-32-live-position-prices.md

## Verified (22)

- ✓ `market-data:stock-quotes` handler registered, returns `{ quotes }` envelope — `src/main/ipc/market-data.ts:43-49`
- ✓ `market-data:set-stock-quote-tickers` handler registered — `src/main/ipc/market-data.ts:51`
- ✓ `market-data:market-status` served from the market-data handler module — `src/main/ipc/market-data.ts:88`
- ✓ Push events `market-data:stock-quote` / `market-data:stream-error` — `src/main/ipc/market-data.ts:37,40`
- ✓ `src/main/ipc/broker.ts` registers only `broker:account` and `broker:activities` — `src/main/ipc/broker.ts:9,16`; no `broker:market-status` anywhere
- ✓ `registerMarketDataHandlers` exists — `src/main/ipc/market-data.ts:30`
- ✓ `TickerListSchema` = `z.array(z.string().min(1).max(MAX_TICKER_LENGTH)).max(MAX_TICKERS_PER_REQUEST)`, constants 10 / 50 — `src/main/schemas.ts:382-387`
- ✓ `GetStockQuotesPayloadSchema` / `SetStockQuoteTickersPayloadSchema` — `src/main/schemas.ts:389,394`
- ✓ `StockQuote.prevClose: string` — `src/main/integrations/market-data-provider.ts:32`
- ✓ `getStockQuotes(tickers): Promise<Map<string, StockQuote>>` — `src/main/integrations/market-data-provider.ts:131`; `stream(...)` on the port — `:146`
- ✓ `marketDataFactory` with `configure`/`create`/`recreate`/`disconnect` — `src/main/integrations/market-data-factory.ts:26-41`
- ✓ `before-quit` disconnects provider — `src/main/index.ts:337-340`
- ✓ `IpcStockQuote.prevClose: string | null` — `src/preload/index.d.ts:212-216`; stream ticks forced to `prevClose: null` — `src/main/services/market-data.ts:118`
- ✓ Preload: `window.api.marketData.stockQuotes`; flat `setStockQuoteTickers`, `onStockQuote`, `onStreamError` — `src/preload/index.ts:31-35,53`
- ✓ `marketDataQueryKeys.stockQuotes` = `['market','stock-quotes', sorted.join(',')]` — `src/renderer/src/hooks/marketDataQueryKeys.ts:3-4`
- ✓ `useMarketStatus` polls every 60 s — `src/renderer/src/hooks/useMarketStatus.ts:6,14`
- ✓ `useStockQuotes`: `STALE_THRESHOLD_MS = 5 min`, `setQueryData` merge, `dataUpdatedAt` staleness, `prevClose` carried forward — `src/renderer/src/hooks/useStockQuotes.ts:12,17,76,99-100`
- ✓ `deriveMarketStatusDisplay` with stale → `DELAYED` precedence — `src/renderer/src/lib/market-status.ts:18-22`
- ✓ `@keyframes wb-pulse` — `src/renderer/src/index.css:304`
- ✓ `PriceCell` mounted in `PositionCard` — `src/renderer/src/components/PositionCard.tsx:13,136`
- ✓ `MarketStatusPill.tsx`, `StaleDataBanner.tsx`, `PositionsListPage.tsx`, `api/market-data.ts` exist
- ✓ `e2e/live-underlying-price.spec.ts` exists with 7 tests

## Drift (7)

- ✗ "What was built" says the provider is "today a `MassiveMarketDataProvider`" and the stream is "fed by Massive's single JSON WebSocket aggregate-minute frames". `marketDataFactory` builds `AlpacaMarketDataProvider` (or `FakeMarketDataProvider`) — `src/main/integrations/market-data-factory.ts:17-22`; the stream is Alpaca IEX `wss://stream.data.alpaca.markets/v2/iex` — `src/main/integrations/alpaca-market-data.ts:56`. Suggested fix: describe Alpaca as the current provider (Massive retired by US-99).
- ✗ Says the REST seed reads `prevClose` "from Massive's stock snapshot endpoint". Seed is Alpaca `/v2/stocks/snapshots`, `prevDailyBar.c` — `src/main/integrations/alpaca-market-data-mappers.ts:43-59`.
- ✗ Architecture decisions: "the provider is Massive-based (see us-31), not the Alpaca SDK". Current provider is Alpaca REST/WebSocket in `alpaca-market-data.ts`.
- ✗ Source files lists `src/main/integrations/massive-market-data.ts` (see Missing). Replace with `alpaca-market-data.ts` / `alpaca-market-data-mappers.ts`.
- ✗ Contracts: "market status as `window.api.broker.marketStatus`". Actual is `window.api.marketData.marketStatus` → `market-data:market-status` — `src/preload/index.ts:56`; the `broker` namespace has only `account`/`activities` — `src/preload/index.ts:36-38`.
- ✗ Contracts: "Market status is not in `marketDataQueryKeys`; it lives in `brokerQueryKeys.marketStatus = ['broker','market-status']`". Actual is `marketDataQueryKeys.marketStatus = ['market','status']` — `src/renderer/src/hooks/marketDataQueryKeys.ts:2`, consumed at `src/renderer/src/hooks/useMarketStatus.ts:11`; `brokerQueryKeys` has no `marketStatus` — `src/renderer/src/hooks/brokerQueryKeys.ts:1-6`.
- ✗ Source files lists `src/main/ipc/market-data.ts` twice, once as "new". A duplicate entry (minor).

## Unverifiable (3)

- ? Price column position "between Phase and Strike". Consistent with `TABLE_COLUMNS` (`src/renderer/src/pages/PositionsListPage.tsx:28-39`), but the visual layout needs a human check.
- ? Renderer never imports from `src/main/` (type-sharing ADR). Narrative; not checked across every file.
- ? Revisions narrative (Alpaca → Massive → back). Historical framing, not a code claim.

## Missing files (1)

- ✗ `src/main/integrations/massive-market-data.ts` does not exist.

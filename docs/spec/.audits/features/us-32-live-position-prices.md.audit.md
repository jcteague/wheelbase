---
page: docs/spec/features/us-32-live-position-prices.md
audited_at: 2026-06-27
findings: 7
---

# Audit: docs/spec/features/us-32-live-position-prices.md

UI layer largely intact. Drift concentrated in the preload bridge surface, the
`market-status` IPC channel, the Zod schema literal, and the (now-removed)
Alpaca SDK switch claim.

## Verified (8)

- ✓ `src/main/ipc/market-data.ts` registers `market-data:stock-quotes`
  (`:29`), `market-data:set-stock-quote-tickers` (`:37`), and sends push
  events `market-data:stock-quote` (`:45`) and `market-data:stream-error`
  (`:46`).
- ✓ `GetStockQuotesPayloadSchema` and `SetStockQuoteTickersPayloadSchema`
  exist in `src/main/schemas.ts:363,368`.
- ✓ Hooks `useStockQuotes.ts`, `useMarketStatus.ts`, `marketDataQueryKeys.ts`
  all present in `src/renderer/src/hooks/`.
- ✓ Components `MarketStatusPill.tsx`, `PriceCell.tsx`, `StaleDataBanner.tsx`
  present in `src/renderer/src/components/`.
- ✓ `deriveMarketStatusDisplay` exists in
  `src/renderer/src/lib/market-status.ts:18`.
- ✓ `e2e/live-underlying-price.spec.ts` exists.
- ✓ Preload exposes `setStockQuoteTickers`, `onStockQuote`, `onStreamError`
  (`src/preload/index.ts:30-34`).
- ✓ All `../` and `./` spec links resolve.

## Drift (4)

- ✗ Page claims preload bridge methods `window.api.getStockQuotes`,
  `getMarketStatus` (Contracts section, "Preload bridge" bullet). These flat
  names are NOT in `src/preload/index.ts`. Stock quotes are exposed as
  `window.api.marketData.stockQuotes` (`preload/index.ts:51`); market status
  as `window.api.broker.marketStatus` (`:38`). Only `setStockQuoteTickers`,
  `onStockQuote`, `onStreamError` are flat on `window.api`.

- ✗ Page claims a `market-data:market-status` request/response handler
  "polled every 60 s" (Contracts + ADR bullets). No `market-status` handler
  exists in `src/main/ipc/market-data.ts`. Market status is served by
  `broker:market-status` instead (preload `broker.marketStatus`).
  `useMarketStatus` no longer talks to a `market-data:market-status` channel.

- ✗ ADR: "Alpaca SDK switch from `getStocksQuotesLatest` to
  `getStocksSnapshots` so `prev_daily_bar.c` is available." Grep finds neither
  `getStocksSnapshots` nor `prev_daily_bar` in `src/main/integrations/`. The
  market-data provider is now Massive-based (see US-31 audit), so this
  Alpaca-SDK rationale no longer reflects the code.

- ✗ Page states `GetStockQuotesPayloadSchema` uses
  `tickers: z.array(z.string().min(1).max(10)).max(50)` (Contracts section).
  Actual schema uses `tickers: TickerListSchema`
  (`schemas.ts:359-364`) = `z.array(z.string().min(1).max(MAX_TICKER_LENGTH))
.max(MAX_TICKERS_PER_REQUEST)`. The literal `10`/`50` bounds are now
  indirected through named constants; verify the constant values still equal
  `10`/`50` before treating the documented numbers as accurate.

## Unverifiable (0)

## Missing files (0)

Suggested fix: update the Preload bridge bullet to the
`marketData.stockQuotes` / `broker.marketStatus` namespaces, drop the
`market-data:market-status` handler claim (point `useMarketStatus` doc at
`broker:market-status`), remove the Alpaca-SDK `getStocksSnapshots` ADR, and
re-express the schema bounds via `TickerListSchema`.

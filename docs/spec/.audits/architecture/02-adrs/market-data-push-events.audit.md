---
page: docs/spec/architecture/02-adrs/market-data-push-events.md
audited_at: 2026-06-27
findings: 0
---

# Audit: market-data-push-events.md

## Verified (6)

- ✓ Two push channels via `webContents.send`: `market-data:stock-quote` (per tick, payload `{ ticker, quote }`) and `market-data:stream-error` (`src/main/ipc/market-data.ts:45-46,91`).
- ✓ Tick `quote.prevClose` is always `null` on a tick: `onTick(..., { ...flattenStockQuote(...), prevClose: null })` (`src/main/services/market-data.ts:109`).
- ✓ `StreamError` payload shape is `{ feed, code, message, reconnectable }` (`src/main/integrations/market-data-provider.ts:75-80`), matching the documented `{ feed, code, message, reconnectable }`.
- ✓ Initial snapshot delivered via request/response `market-data:stock-quotes` invoke, not a push event (`src/main/ipc/market-data.ts` registers it as `ipcMain.handle`).
- ✓ Preload exposes `onStockQuote(cb)` and `onStreamError(cb)` returning unsubscribe fns that wrap `ipcRenderer.removeListener` (`src/preload/index.ts:11-12,33-34`).
- ✓ `MarketDataFeed` union supports `'optionQuotes' | 'optionTrades'` extension as claimed (`market-data-provider.ts`).

## Drift (0)

## Unverifiable (1)

- ? Renderer-side claims (`useStockQuotes` merges ticks via `setQueryData`, stream errors override pill to DELAYED) are covered under the stale-detection audit; the bridge contract (channels + preload subscriptions) is verified here.

## Missing files (0)

- ✓ `../../features/us-32-live-position-prices.md` exists. (Cross-ref ADR `market-status-pill` is a sibling not in this batch.)

One-line: Audited market-data-push-events.md: 6 verified, 0 drift, 1 unverifiable, 0 missing.

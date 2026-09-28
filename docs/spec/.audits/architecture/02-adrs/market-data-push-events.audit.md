---
page: docs/spec/architecture/02-adrs/market-data-push-events.md
audited_at: 2026-09-28
findings: 1
---

# Audit: market-data-push-events.md

## Verified (8)

- ✓ `market-data:stock-quote` sent via `webContents.send` with `{ ticker, quote }` — `src/main/ipc/market-data.ts:36-38`.
- ✓ Stream ticks carry `prevClose: null` — `src/main/services/market-data.ts:117-118`.
- ✓ `market-data:stream-error` sends the `StreamError` (`{ feed, code, message, reconnectable }`) — `ipc/market-data.ts:39-41`; type at `src/main/integrations/market-data-provider.ts:121-126`.
- ✓ REST snapshot delivered via request/response `market-data:stock-quotes` — `ipc/market-data.ts:43-49`; consumed as `queryFn` in `src/renderer/src/hooks/useStockQuotes.ts:40`.
- ✓ Preload exposes flat `window.api.onStockQuote` / `onStreamError`, each returning a `removeListener` unsubscribe — `src/preload/index.ts:8-14, 34-35`; reads namespaced under `marketData` (`:52`).
- ✓ Test-only handlers `test:trigger-stock-tick` and `test:trigger-stream-error` — `ipc/market-data.ts:98, 109`; paired with `FakeMarketDataProvider` under `FAKE_MARKET_DATA` (`market-data-factory.ts:18-20`).
- ✓ `useStockQuotes` listens on both channels, merges ticks with `setQueryData`, sets local `streamError` state — `useStockQuotes.ts:36, 75-92`; stale → `DELAYED` via `deriveMarketStatusDisplay` — `src/renderer/src/lib/market-status.ts:18-22`.
- ✓ `MarketDataFeed` already includes `'optionQuotes' | 'optionTrades'` — `market-data-provider.ts:112`.

## Drift (1)

- ✗ Line 34 says tests "fire ticks via `page.evaluate` stubbing of `window.api.onStockQuote`". The e2e suite calls the real bridge helpers `window.api.triggerTestTick` / `window.api.triggerStreamError` inside `page.evaluate` (`e2e/live-underlying-price.spec.ts:6, 121-140`), which invoke `test:trigger-stock-tick` / `test:trigger-stream-error` (`src/preload/index.ts:60-61`); nothing in `e2e/` stubs `onStockQuote`. Suggested fix: reword to the trigger helpers.

## Unverifiable (2)

- ? Snapshot-vs-delta and out-of-band error rationale — design intent.
- ? "per-feed push channels follow the same naming" for future feeds — forward-looking.

## Missing files (0)

None.

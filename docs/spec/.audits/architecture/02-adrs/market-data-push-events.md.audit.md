---
page: docs/spec/architecture/02-adrs/market-data-push-events.md
audited_at: 2026-06-29
findings: 1
---

# Audit: docs/spec/architecture/02-adrs/market-data-push-events.md

## Verified (13)

- ✓ `market-data:stock-quote` push event emitted per tick with payload `{ ticker, quote }` via `webContents.send` — `src/main/ipc/market-data.ts:45`.
- ✓ Tick `quote.prevClose` is always `null` on a tick — `onTick(..., { ...flattenStockQuote(...), prevClose: null })` at `src/main/services/market-data.ts:109`.
- ✓ `market-data:stream-error` push event emitted on stream error — `src/main/ipc/market-data.ts:46` (and `:91` for the test trigger).
- ✓ `StreamError` payload shape `{ feed, code, message, reconnectable }` — `src/main/integrations/market-data-provider.ts:75-80`.
- ✓ Initial REST snapshot delivered via request/response invoke `market-data:stock-quotes` (not a push) — `ipcMain.handle('market-data:stock-quotes', ...)` at `src/main/ipc/market-data.ts:29`; consumed in renderer via `window.api.marketData.stockQuotes` (`src/preload/index.ts:51`).
- ✓ Preload surfaces `window.api.onStockQuote(cb)` flat on `window.api`, wrapping `ipcRenderer.removeListener` for unsubscribe — `src/preload/index.ts:33` + `onIpcEvent` helper at `:8-14`.
- ✓ Preload surfaces `window.api.onStreamError(cb)` flat on `window.api` — `src/preload/index.ts:34`.
- ✓ Request/response market-data reads namespaced under `window.api.marketData.*` — `src/preload/index.ts:50-54`.
- ✓ Test-only handler `test:trigger-stock-tick` drives the tick channel — `src/main/ipc/market-data.ts:78` (pushes onto `fakeStockTickSubject`).
- ✓ Test-only handler `test:trigger-stream-error` drives the error channel — `src/main/ipc/market-data.ts:89`.
- ✓ Paired with `FakeMarketDataProvider` gated by `FAKE_MARKET_DATA=true` — `src/main/integrations/market-data-factory.ts:14`; `fakeStockTickSubject` exported at `src/main/integrations/fake-market-data.ts:16`.
- ✓ `useStockQuotes` registers listeners on both channels and merges ticks via `setQueryData`; stream errors set `streamError` state — `src/renderer/src/hooks/useStockQuotes.ts:75-83`, `:36`.
- ✓ Stream error overrides market-status pill to `DELAYED` — `src/renderer/src/lib/market-status.ts:22` (`if (stale) return 'DELAYED'`), with `stale: streamError !== null` at `useStockQuotes.ts:117`; `DELAYED` is a valid `MarketStatusPill` state (`MarketStatusPill.tsx:3`).

## Drift (0)

(none)

## Unverifiable (1)

- ? "Adding new market-data feeds (option quotes, option trades) extends `feed` to `'optionQuotes' | 'optionTrades'`" — `MarketDataFeed` is already `'stockQuotes' | 'optionQuotes' | 'optionTrades'` (`src/main/integrations/market-data-provider.ts:67`), so the union exists, but the claim is a forward-looking consequence rather than a current code behavior. No drift; noted as narrative.

## Missing files (0)

All referenced sources exist: `docs/spec/.extracts/us-32.md`, `docs/spec/.extracts/market-data-massive-migration.md`, `docs/spec/features/us-32-live-position-prices.md`, `docs/spec/architecture/02-adrs/market-status-pill.md`.

## Note (not a spec drift)

- The ADR correctly states the fake provider is gated by `FAKE_MARKET_DATA=true`. However the **preload code comment** at `src/preload/index.ts:56` references a stale env var name `WHEELBASE_MARKET_MOCK=true`, which does not exist anywhere in `src/` (the real flag is `FAKE_MARKET_DATA`). This is a code-comment bug, not spec drift; flagging for human review since it could mislead readers cross-referencing the ADR.

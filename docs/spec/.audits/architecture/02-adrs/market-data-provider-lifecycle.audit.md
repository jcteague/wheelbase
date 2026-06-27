---
page: docs/spec/architecture/02-adrs/market-data-provider-lifecycle.md
audited_at: 2026-06-27
findings: 3
---

# Audit: market-data-provider-lifecycle.md

## Verified (6)

- ✓ Provider instantiated once at startup: `marketDataFactory.configure(...)` + lazy `marketDataFactory.create()` wired in `src/main/index.ts:143,152`.
- ✓ `connect()` is NOT called at startup; deferred until the first non-empty `set-stock-quote-tickers` request: `subscribeToStockQuotes` calls `provider.connect([...])` only when `tickers.length > 0` and `!state.connected` (`src/main/services/market-data.ts:96-101`).
- ✓ Connect happens once per session via a `connected` flag (`state.connected = true` set after first connect, guarded by `if (!state.connected)`).
- ✓ Each `set-stock-quote-tickers` call tears down the prior subscription first: `state.activeSub?.unsubscribe(); state.activeSub = null` (`market-data.ts:92-93`).
- ✓ `setStockQuoteTickers([])` is valid and returns `{ subscribedTickers: [] }`: empty-array short-circuit returns `[]` (`market-data.ts:94`), handler returns `{ subscribedTickers }` (`src/main/ipc/market-data.ts:48`).
- ✓ `disconnect()` on `app.before-quit`: `marketDataFactory.disconnect()` called in the before-quit handler (`src/main/index.ts:259-261`).
- ✓ Three request/response handlers + two push channels exist (`stock-quotes`, `set-stock-quote-tickers`, `market-status`; push: `stock-quote`, `stream-error`).

## Drift (3)

- ✗ Page claims the `connected` flag is "a module-scoped `let connected = false` inside `src/main/ipc/market-data.ts`." Actual: the flag lives in a `StreamState` object (`{ connected, activeSub }`) created by `newStreamState()` in `src/main/services/market-data.ts:20-26` and threaded into `subscribeToStockQuotes`. It is not a module-scoped `let` in the IPC file. Suggested fix: describe the `StreamState`-held flag in the service layer.
- ✗ Page says the current Observable subscription "is held at module scope" (in the IPC file). Actual: it is held on `state.activeSub` within `StreamState`, not a module-scoped variable in `ipc/market-data.ts`.
- ✗ Page references the factory as `createMarketDataProvider(...)` (see also provider-interface ADR). Actual is `marketDataFactory.create()`; and provider error code `streaming_unsupported` plus the connect contract reference `AlpacaMarketDataProvider`'s lazy-getter bug, but the concrete provider is now `MassiveMarketDataProvider` (no `AlpacaMarketDataProvider` class exists — grep empty). The red-phase-bug note about `AlpacaMarketDataProvider` constructor is now stale.

## Unverifiable (1)

- ? `provider.connect()` is documented with no args; code calls `provider.connect(['stockQuotes'])`. Minor signature nuance — flag for human review.

## Missing files (0)

- ✓ `../../features/us-32-live-position-prices.md` exists.

One-line: Audited market-data-provider-lifecycle.md: 6 verified, 3 drift, 1 unverifiable, 0 missing.

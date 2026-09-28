---
page: docs/spec/architecture/02-adrs/market-data-lazy-credentials-stream-restart.md
audited_at: 2026-09-28
findings: 11
---

# Audit: docs/spec/architecture/02-adrs/market-data-lazy-credentials-stream-restart.md

## Verified (10)

- ✓ `AlpacaMarketDataProvider` takes `{ loadCredentials }` and resolves via `this.credentials()` on every REST call and in `connect()` — `src/main/integrations/alpaca-market-data.ts:60-80,139,161,182,224,374`.
- ✓ Missing credential → `MarketDataError('auth_failed', 'Alpaca credentials not configured')` — `alpaca-market-data.ts:78`.
- ✓ `marketDataFactory.configure({ loadActiveAlpacaCredentials })` always constructs; never throws — `src/main/integrations/market-data-factory.ts:15-33`.
- ✓ `onBrokerProviderChanged` calls `brokerFactory.recreate()` then `restartStockQuoteStream()` — `src/main/index.ts:175-192`; `marketDataFactory.recreate()` not used there.
- ✓ `registerMarketDataHandlers` returns `{ restartStockQuoteStream }` — `src/main/ipc/market-data.ts:27,115-116`.
- ✓ Restart: unsubscribe, `disconnect()`, `connected = false`, return early on empty `tickers`, else replay `subscribeToStockQuotes` and log INFO `stock_quote_stream_restarted { tickers }` — `src/main/services/market-data.ts:136-152`.
- ✓ `StreamState = { connected, activeSub, tickers }`; `newStreamState()` sets `tickers: []` — `market-data.ts:20-30`.
- ✓ `index.ts` voids the promise with a `warn` on rejection — `src/main/index.ts:189-191`.
- ✓ `screenWatchlistCandidates` keeps its `try { getProvider() }` guard — `src/main/services/screener.ts:235-250`.
- ✓ `close` handler guarded by socket identity `if (this.ws !== ws) return` — `alpaca-market-data.ts:452`; linked ADRs (`runtime-broker-provider-refresh.md`, `market-data-provider-lifecycle.md`, `per-symbol-ws-subscription-reconciliation.md`) exist.

## Drift (0)

None.

## Unverifiable (1)

- ? "`subscribeToStockQuotes` already treats a `connect()` failure as 'continue REST-only with a warning'" and `evaluateAlerts` degradation outcomes — behavioural, not traced line by line.

## Missing files (0)

None.

# ADR: One market-data provider with lazily resolved credentials; broker changes restart only the stream

<!-- generated:from us-99 -->

## Decision

`AlpacaMarketDataProvider` takes `{ loadCredentials: () => AlpacaCredentials | null }` and resolves it on **every** REST call and inside `connect()` — credentials are never cached on the instance. `marketDataFactory.configure({ loadActiveAlpacaCredentials })` always constructs the provider (it **never throws** when unconfigured); a missing credential surfaces per call as `MarketDataError('auth_failed', 'Alpaca credentials not configured')`.

Because a websocket authenticates once at connect, a credential change must reach the socket: `onBrokerProviderChanged` in `src/main/index.ts` calls `restartStockQuoteStream()` (returned by `registerMarketDataHandlers`) after `brokerFactory.recreate()`. The restart disconnects the provider, clears `StreamState.connected`, and — only when `StreamState.tickers` remembers a subscription — reconnects and replays `subscribeToStockQuotes` with the same tickers. `marketDataFactory.recreate()` is **not** used for credential changes.

This **amends** [runtime-broker-provider-refresh](./runtime-broker-provider-refresh.md) (broker changes no longer leave market data untouched — they restart the stock stream, while REST needs nothing) and [market-data-provider-lifecycle](./market-data-provider-lifecycle.md) (the factory never throws; `StreamState` carries `tickers`).

## Context / Why

- Market data now depends on the broker credentials, so a saved, removed or switched key must reach the websocket, whose auth happens at `connect()`. REST picks the new key up on the next request with no lifecycle event.
- Recreating the provider would orphan `StreamState.connected` and the renderer's push subscription; restarting the stream against the same singleton is the minimal change.
- Never throwing from the factory keeps `evaluateAlerts` and `screenWatchlistCandidates` on their existing per-call failure isolation (`auth_failed` → `provider_unavailable` / degraded) — the same trader-facing outcome as the old factory throw, without a crash path.
- `subscribeToStockQuotes` already treats a `connect()` failure as "continue REST-only with a warning", so the restart inherits AC6.

## Alternatives considered

- **Cache credentials at construction + `recreate()` on change** — the stream hazard above, plus the screener and alerts would need re-wiring.
- **Push a "credentials changed" event to the renderer and let it re-send `set-stock-quote-tickers`** — round-trips through the UI for a main-process concern.

## Consequences

- `StreamState = { connected, activeSub, tickers }`; `newStreamState()` sets `tickers: []`; `subscribeToStockQuotes` records the ticker set; an empty remembered set makes the restart teardown-only.
- `registerMarketDataHandlers` hoists its `onTick` / `onError` closures and returns `MarketDataHandlers = { restartStockQuoteStream }`; `index.ts` `void`s the promise with a `warn` on rejection. `info` `stock_quote_stream_restarted { tickers }`.
- `screenWatchlistCandidates` keeps its `try { getProvider() }` guard (still correct for the fake path), but the "unconfigured provider" outcome now arrives as per-ticker `auth_failed` from the chain pull.
- The `close` handler is guarded by socket identity (`if (this.ws !== ws) return`) so the old socket's deferred `close` cannot null the replacement installed by the restart — see [per-symbol-ws-subscription-reconciliation](./per-symbol-ws-subscription-reconciliation.md).

## Sources

- [extract: us-99](../../.extracts/us-99.md) — ADR "One provider instance with lazily resolved credentials; broker changes restart only the stream"
- [feature: us-99-alpaca-market-data-provider](../../features/us-99-alpaca-market-data-provider.md)
<!-- /generated -->

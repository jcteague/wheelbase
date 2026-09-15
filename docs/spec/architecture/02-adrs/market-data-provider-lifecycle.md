# ADR: MarketDataProvider connect-on-demand lifecycle

<!-- generated:from us-32,market-data-massive-migration,us-99,us-116 -->

## Decision

The provider is **created once** at app startup in `src/main/index.ts` via the env-switched `marketDataFactory` (see [Factory and credential loading](#factory-and-credential-loading) below). `provider.connect()` is **not** called at startup — it's deferred until the first non-empty `market-data:set-stock-quote-tickers` subscription request from the renderer. A `connected` flag ensures `connect()` is called once per app session **or per credential change**: since US-99 a broker-credential save/remove/switch restarts the stream (disconnect, clear the flag, reconnect with the new keys, replay the remembered tickers). On `app.before-quit`, `marketDataFactory.disconnect()` is called (which disconnects the cached provider).

The current Observable subscription (the one bridging stream ticks to renderer push events) is held alongside that flag. Every new `set-stock-quote-tickers` call tears down the prior subscription, optionally connects the provider (if not already), and subscribes to the new ticker set.

## Current state

- The factory is `marketDataFactory.create()` (configured via `marketDataFactory.configure(...)` and torn down via `marketDataFactory.disconnect()` in the `app.before-quit` handler), not `createMarketDataProvider(...)`. See ADR [market-data-provider-interface](./market-data-provider-interface.md).
- The `connected` flag, the active subscription and the last ticker set live in a `StreamState` object (`{ connected, activeSub, tickers }`) created by `newStreamState()` and threaded into `subscribeToStockQuotes` / `restartStockQuoteStream` in the service layer (`src/main/services/market-data.ts`). Teardown is `state.activeSub?.unsubscribe()`. `registerMarketDataHandlers` returns `{ restartStockQuoteStream }` for `index.ts` to call from `onBrokerProviderChanged` — see [market-data-lazy-credentials-stream-restart](./market-data-lazy-credentials-stream-restart.md).
- The concrete provider is `AlpacaMarketDataProvider` (US-99). `connect()` authenticates the IEX websocket and resolves on the `authenticated` frame; `stream()` then sends per-symbol `bars` subscriptions — see [per-symbol-ws-subscription-reconciliation](./per-symbol-ws-subscription-reconciliation.md). A `connect()` rejection (402 auth, 409 entitlement, network, 10 s auth timeout) is caught by `subscribeToStockQuotes`, logged, and the app continues REST-only.

## Factory and credential loading

The `marketDataFactory` (`src/main/integrations/market-data-factory.ts`) owns provider selection and the cached singleton:

- **`configure({ loadActiveAlpacaCredentials })`** — sets the credential loader and resets the cached provider. `index.ts` passes `() => settings.loadActiveAlpacaCredentials()`; the default is the shared `loadAlpacaCredentialsFromEnv` (`process.env` only — see [alpaca-credentials-runtime-env-only](./alpaca-credentials-runtime-env-only.md)).
- **`create(): MarketDataProvider`** — returns a `FakeMarketDataProvider` when `FAKE_MARKET_DATA === 'true'`, otherwise an `AlpacaMarketDataProvider` whose `loadCredentials` is the configured loader. **Never throws.** The result is cached for the session.
- **`recreate(): void`** — clears the cached provider (returns `void`, not a new provider); the next `create()` rebuilds it. Not used for credential changes.
- **`disconnect(): Promise<void>`** — disconnects and tears down the cached provider; called from `app.before-quit`.

Credentials are resolved by the provider on every REST call and inside `connect()`, never cached on the instance, so an unconfigured app starts normally and each market-data call fails with `MarketDataError('auth_failed', 'Alpaca credentials not configured')`. The fake path is what e2e runs against, so the credential loader is never invoked under `FAKE_MARKET_DATA=true`.

## Context / Why

- Connecting at startup wastes a WebSocket connection when the user is on, e.g., the New Wheel page with no active positions yet.
- Connecting on first subscription request matches user intent: the renderer has decided it wants live data.
- The renderer is the source of truth for "which tickers do we care about?" — it derives that list from `usePositions()`. Keeping subscription mutation as an explicit IPC invoke (request/response) makes intent clear and gives a clean error channel for `auth_failed` / `network_error`.
- Remembering `tickers` on `StreamState` lets the main process replay the subscription after a credential change without a renderer round-trip.

## Alternatives considered

- **`connect()` at startup unconditionally** — opens a socket the user may never use.
- **`connect()` per ticker change** — recreates the WebSocket on every position add/remove; the provider's design uses one persistent socket and reconciles per-symbol subscriptions.
- **Main process queries the DB for tickers itself** — couples market-data to DB; harder to test; doesn't compose with future "watch this ticker even though no position exists" UX.
- **Renderer subscribes per ticker individually** — multiplies IPC traffic and forces bookkeeping of N subscriptions.

## Consequences

- The main process exposes the stock-quote IPC handlers `market-data:stock-quotes` (REST snapshot) and `market-data:set-stock-quote-tickers` (subscription mutation) — alongside the option-data handlers `market-data:option-snapshots`, `market-data:option-snapshot`, and `market-data:option-chain` — plus two push event channels (`market-data:stock-quote` per tick, `market-data:stream-error` for WebSocket failures). [US-116] Market status is served on `market-data:market-status`; there is no `broker:market-status` handler.
- `setStockQuoteTickers([])` is valid — it tears down any prior subscription, sends an unsubscribe for every symbol (so the free plan's 30-symbol cap is not leaked against), and returns `{ ok: true, subscribedTickers: [] }`.
- `MarketDataError('auth_failed' | 'network_error' | 'rate_limited' | 'streaming_unsupported')` is the canonical provider error and maps to `__root__` with the matching `code` in the IPC envelope — see ADR [ipc-envelope-contract](./ipc-envelope-contract.md).
- Historical: a red-phase bug fix in US-32 made the original Alpaca provider's SDK client a lazy getter so construction never threw in e2e. The current provider has no SDK client; the equivalent guarantee is that the factory never throws.

## Sources

- [extract: us-32](../../.extracts/us-32.md) — ADR "Provider Lifecycle in the Main Process"; ADR "Renderer-Initiated Subscription Updates"
- [extract: market-data-massive-migration](../../.extracts/market-data-massive-migration.md) — ADR "Env-switched `marketDataFactory`" (historical vendor)
- [extract: us-99](../../.extracts/us-99.md) — `marketDataFactory` configuration; `StreamState.tickers` + `restartStockQuoteStream`
- [feature: us-32-live-position-prices](../../features/us-32-live-position-prices.md), [feature: us-99-alpaca-market-data-provider](../../features/us-99-alpaca-market-data-provider.md)
<!-- /generated -->

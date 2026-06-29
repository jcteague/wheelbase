# ADR: MarketDataProvider connect-on-demand lifecycle

<!-- generated:from us-32,market-data-massive-migration -->

## Decision

The provider is **created once** at app startup in `src/main/index.ts` via the env-switched `marketDataFactory` (see [Factory and credential loading](#factory-and-credential-loading) below), not via the removed `createMarketDataProvider(...)`. `provider.connect()` is **not** called at startup — it's deferred until the first non-empty `market-data:set-stock-quote-tickers` subscription request from the renderer. A `connected` flag ensures `connect()` is called only once per app session. On `app.before-quit`, `marketDataFactory.disconnect()` is called (which disconnects the cached provider).

The current Observable subscription (the one bridging stream ticks to renderer push events) is held alongside that flag. Every new `set-stock-quote-tickers` call tears down the prior subscription, optionally connects the provider (if not already), and subscribes to the new ticker set.

## Current state

- The factory is `marketDataFactory.create()` (configured via `marketDataFactory.configure(...)` and torn down via `marketDataFactory.disconnect()` in the `app.before-quit` handler), not `createMarketDataProvider(...)`. See ADR [market-data-provider-interface](./market-data-provider-interface.md).
- The `connected` flag and the active subscription are not module-scoped in `src/main/ipc/market-data.ts`. They live in a `StreamState` object (`{ connected, activeSub }`) created by `newStreamState()` and threaded into `subscribeToStockQuotes` in the service layer (`src/main/services/market-data.ts`). Teardown is `state.activeSub?.unsubscribe()`.
- The concrete provider is now `MassiveMarketDataProvider`; there is no `AlpacaMarketDataProvider` class, so the red-phase lazy-getter note below is historical (it described the original Alpaca provider).

## Factory and credential loading

The `marketDataFactory` (`src/main/integrations/market-data-factory.ts`) owns provider selection and the cached singleton:

- **`configure({ loadMassiveApiKey })`** — sets the key loader and resets the cached provider.
- **`create(): MarketDataProvider`** — returns a `FakeMarketDataProvider` when `FAKE_MARKET_DATA === 'true'`, otherwise a `MassiveMarketDataProvider` built from the configured key loader. The result is cached for the session.
- **`recreate(): void`** — clears the cached provider (returns `void`, not a new provider); the next `create()` rebuilds it.
- **`disconnect(): Promise<void>`** — disconnects and tears down the cached provider; called from `app.before-quit`.

`src/main/index.ts` calls `marketDataFactory.configure({ loadMassiveApiKey })` then `marketDataFactory.create()` at startup. The key loader (`loadMassiveApiKey`, `src/main/integrations/massive-credentials.ts`) prefers `MAIN_VITE_MASSIVE_API_KEY` (electron-vite `.env`) and falls back to `MASSIVE_API_KEY`; if neither is set it throws `"Market data provider not configured. Set MASSIVE_API_KEY or FAKE_MARKET_DATA=true."`. The fake path is what e2e runs against, so the key loader is never invoked under `FAKE_MARKET_DATA=true`.

## Context / Why

- Connecting at startup wastes a WebSocket connection when the user is on, e.g., the New Wheel page with no active positions yet.
- Connecting on first subscription request matches user intent: the renderer has decided it wants live data.
- One `connect()` per app session matches the provider's contract; multiple calls would be ambiguous.
- The renderer is the source of truth for "which tickers do we care about?" — it derives that list from `usePositions()`. Keeping subscription mutation as an explicit IPC invoke (request/response) makes intent clear and gives a clean error channel for `auth_failed` / `network_error`.

## Alternatives considered

- **`connect()` at startup unconditionally** — opens a socket the user may never use.
- **`connect()` per ticker change** — recreates the WebSocket on every position add/remove; the provider's design uses one persistent socket and multiplexes subscriptions.
- **Main process queries the DB for tickers itself** — couples market-data to DB; harder to test; doesn't compose with future "watch this ticker even though no position exists" UX.
- **Renderer subscribes per ticker individually** — multiplies IPC traffic and forces bookkeeping of N subscriptions.

## Consequences

- The main process exposes the stock-quote IPC handlers `market-data:stock-quotes` (REST snapshot) and `market-data:set-stock-quote-tickers` (subscription mutation) — alongside the option-data handlers `market-data:option-snapshots`, `market-data:option-snapshot`, and `market-data:option-chain` — plus two push event channels (`market-data:stock-quote` per tick, `market-data:stream-error` for WebSocket failures). There is no `market-data:market-status` handler; market status is served only on `broker:market-status`.
- `setStockQuoteTickers([])` is valid — it tears down any prior subscription and returns `{ ok: true, subscribedTickers: [] }`.
- `MarketDataError('auth_failed' | 'network_error' | 'rate_limited' | 'streaming_unsupported')` is the canonical provider error and maps to `__root__` with the matching `code` in the IPC envelope — see ADR [ipc-envelope-contract](./ipc-envelope-contract.md).
- A red-phase bug fix: `AlpacaMarketDataProvider` constructor used to call `createClient()` eagerly, throwing "Missing credentials" in e2e tests where `ALPACA_KEY_ID` is unset. The client is now a lazy getter — created on first use.

## Sources

- [extract: us-32](../../.extracts/us-32.md) — ADR "Provider Lifecycle in the Main Process"; ADR "Renderer-Initiated Subscription Updates"
- [extract: market-data-massive-migration](../../.extracts/market-data-massive-migration.md) — ADR "Env-switched `marketDataFactory`"; `marketDataFactory` contract; credential loader
- [feature: us-32-live-position-prices](../../features/us-32-live-position-prices.md)
<!-- /generated -->

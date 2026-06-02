# ADR: MarketDataProvider connect-on-demand lifecycle
<!-- generated:from us-32 -->

## Decision

`createMarketDataProvider(...)` is instantiated once at app startup in `src/main/index.ts`. `provider.connect()` is **not** called at startup — it's deferred until the first non-empty `market-data:set-stock-quote-tickers` subscription request from the renderer. A module-scoped `let connected = false` flag inside `src/main/ipc/market-data.ts` ensures `connect()` is called only once per app session. On `app.before-quit`, `provider.disconnect()` is called.

The current Observable subscription (the one bridging stream ticks to renderer push events) is held at module scope. Every new `set-stock-quote-tickers` call tears down the prior subscription, optionally connects the provider (if not already), and subscribes to the new ticker set.

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

- The main process exposes three IPC handlers (`market-data:stock-quotes` REST snapshot, `market-data:set-stock-quote-tickers` subscription mutation, `market-data:market-status` poll) and two push event channels (`market-data:stock-quote` per tick, `market-data:stream-error` for WebSocket failures).
- `setStockQuoteTickers([])` is valid — it tears down any prior subscription and returns `{ ok: true, subscribedTickers: [] }`.
- `MarketDataError('auth_failed' | 'network_error' | 'rate_limited' | 'streaming_unsupported')` is the canonical provider error and maps to `__root__` with the matching `code` in the IPC envelope — see ADR [ipc-envelope-contract](./ipc-envelope-contract.md).
- A red-phase bug fix: `AlpacaMarketDataProvider` constructor used to call `createClient()` eagerly, throwing "Missing credentials" in e2e tests where `ALPACA_KEY_ID` is unset. The client is now a lazy getter — created on first use.

## Sources

- [extract: us-32](../../.extracts/us-32.md) — ADR "Provider Lifecycle in the Main Process"; ADR "Renderer-Initiated Subscription Updates"
- [feature: us-32-live-position-prices](../../features/us-32-live-position-prices.md)
<!-- /generated -->

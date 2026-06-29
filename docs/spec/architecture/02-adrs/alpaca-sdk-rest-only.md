# ADR: Use Alpaca SDK for REST only; bypass it for streaming

<!-- generated:from us-31,market-data-massive-migration -->

## Original decision (us-31)

Use `@alpacahq/typescript-sdk` (v0.0.32-preview) for the REST endpoints where it works rather than rewriting them against raw `fetch`, and bypass the SDK entirely for WebSocket streaming (the SDK has no streaming support) by talking to sockets directly via the `ws` package.

## Why (us-31)

The SDK is a Deno-to-Node transpile via `dnt`, marked unmaintained, with known bugs: `getStocksSnapshots` hits the wrong path, the `getOptionsSnapshots` type omits `greeks`/`impliedVolatility`, `getActivity` ignores query params, and WebSocket support is "todo". The REST endpoints the app needed (`getAccount`, `getClock`, `getActivity`) do work, so building a full replacement HTTP client would have been wasted effort. Streaming had zero SDK support, so the provider implemented it from scratch over `ws`.

## Alternatives considered (us-31)

- **Replace the SDK entirely with raw `fetch`** — judged too much work for endpoints that already function.
- **`alpaca-trade-api-js`** — older, callback-based, weaker TypeScript support.

## Current state (market-data-massive-migration)

This ADR now applies **only to the broker side**. The market-data layer was migrated off Alpaca onto **Massive** (a Polygon-compatible delayed-data vendor), and in the same change Alpaca's market-data and SDK usage were split out:

- **Market data — no Alpaca SDK at all.** `MassiveMarketDataProvider` (`src/main/integrations/massive-market-data.ts`) talks to Massive's REST API over the global `fetch` (key appended as an `?apiKey=` query param, `BASE_URL` `https://api.massive.com`) and streams from a single JSON WebSocket (`wss://delayed.massive.com/stocks`) via the `ws` package. There is no Alpaca REST quotes call (`getStocksQuotesLatest` was never wired up), no `AlpacaMarketDataProvider`, and no MessagePack/two-socket path.
- **Broker — still the Alpaca SDK, REST only.** The only surviving `Alpaca*` class is `AlpacaBrokerProvider` (`src/main/integrations/alpaca-broker.ts`), implementing the separate `BrokerProvider` interface on the `broker:*` IPC namespace. It uses the SDK for `getAccount`, `getClock`, and `getActivity` only — exactly the REST endpoints this ADR endorsed. The broker has no streaming, so the "bypass for streaming" half of the decision no longer has an Alpaca consumer.
- **Stale comment to clean up.** `src/main/integrations/alpaca.ts` is still retained and `@deprecated`, but its JSDoc points callers at `createMarketDataProvider()` — a function that no longer exists (provider construction is now the env-switched `marketDataFactory` object). The comment is stale and not load-bearing.

## Source

- `docs/spec/.extracts/us-31.md`
- `plans/market-data-massive-migration/research.md`
- Feature page: [`../../features/us-31-market-data-provider-adapter.md`](../../features/us-31-market-data-provider-adapter.md)
<!-- /generated -->

# ADR: Use the Alpaca SDK for broker REST only; market data and streaming bypass it

<!-- generated:from us-31,market-data-massive-migration,us-99 -->

## Original decision (us-31)

Use `@alpacahq/typescript-sdk` (v0.0.32-preview) for the REST endpoints where it works rather than rewriting them against raw `fetch`, and bypass the SDK entirely for WebSocket streaming (the SDK has no streaming support) by talking to sockets directly via the `ws` package.

## Why (us-31)

The SDK is a Deno-to-Node transpile via `dnt`, marked unmaintained, with known bugs: `getStocksSnapshots` hits the wrong path, the `getOptionsSnapshots` type omits `greeks`/`impliedVolatility`, `getActivity` ignores query params, and WebSocket support is "todo". The REST endpoints the app needed (`getAccount`, `getClock`, `getActivity`) do work, so building a full replacement HTTP client would have been wasted effort. Streaming had zero SDK support, so the provider implemented it from scratch over `ws`.

## Alternatives considered (us-31)

- **Replace the SDK entirely with raw `fetch`** — judged too much work for endpoints that already function.
- **`alpaca-trade-api-js`** — older, callback-based, weaker TypeScript support.

## Current state (US-99)

Alpaca is once again the market-data vendor, but the SDK boundary did not move back:

- **Broker — the Alpaca SDK, REST only.** `AlpacaBrokerProvider` (`src/main/integrations/alpaca-broker.ts`) is the only module permitted to import `@alpacahq/typescript-sdk`, using it for `getAccount`, `getClock`, and `getActivity` — exactly the endpoints this ADR endorsed.
- **Market data — raw `fetch` and raw `ws`, no SDK.** `AlpacaMarketDataProvider` (`src/main/integrations/alpaca-market-data.ts`) calls `https://data.alpaca.markets` (`/v2/stocks/snapshots`, `/v1beta1/options/snapshots…`) and the trading host's `/v2/options/contracts` over the global `fetch` with `APCA-API-KEY-ID` / `APCA-API-SECRET-KEY` headers, and streams from `wss://stream.data.alpaca.markets/v2/iex` via the `ws` package. The very SDK bugs listed above (`getStocksSnapshots` path, `getOptionsSnapshots` typing) are the endpoints market data needs, so the SDK is not used for them. The Massive-era interlude (`massive-market-data.ts`, `?apiKey=` query auth, `wss://delayed.massive.com`) is gone.
- **Settings probes** (`src/main/services/settings-connections.ts`) call `GET {ALPACA_TRADING_BASE_URLS[env]}/v2/account` over `fetch` as before; the host map is now shared from `src/main/integrations/alpaca-hosts.ts`.
- **`src/main/integrations/alpaca.ts`** remains `@deprecated`; its comments now point at `AlpacaMarketDataProvider` / `brokerFactory` rather than the long-gone `createMarketDataProvider()`.

## Source

- `docs/spec/.extracts/us-31.md`, `docs/spec/.extracts/us-99.md`
- `plans/market-data-massive-migration/research.md` (historical), `plans/us-99/contracts/alpaca-market-data.md`
- Feature pages: [us-31](../../features/us-31-market-data-provider-adapter.md), [us-99](../../features/us-99-alpaca-market-data-provider.md)
<!-- /generated -->

# ADR: Use Alpaca SDK for REST only; bypass it for streaming

<!-- generated:from us-31,market-data-massive-migration -->

## Decision

Use `@alpacahq/typescript-sdk` (v0.0.32-preview) for the REST endpoints where it works (`getAccount`, `getClock`, `getActivity`). Bypass the SDK entirely for WebSocket streaming — that path uses the raw `ws` package directly (now in `src/main/integrations/massive-market-data.ts`; see `## Current state`). Existing REST callers stay on the SDK rather than being rewritten against `fetch`.

## Why

The SDK is a Deno-to-Node transpile via `dnt`, marked unmaintained, with known bugs (`getStocksSnapshots` hits the wrong path, `getOptionsSnapshots` type omits `greeks`/`impliedVolatility`, `getActivity` ignores query params, WebSocket support is "todo"). The endpoints we need for REST do work, though, and rewriting them against `fetch` is wasted effort. Streaming has zero SDK support so the provider implements it from scratch.

## Alternatives considered

- **Replace SDK entirely with raw `fetch`** — too much work for endpoints that already function.
- **`alpaca-trade-api-js`** — older, callback-based, weaker TypeScript support.

## Current state

The original `getStocksQuotesLatest` endpoint was never wired up; market-data quotes now come from the Massive provider's REST snapshots, not an Alpaca REST quotes call. The Alpaca SDK client (`src/main/integrations/alpaca.ts` / `alpaca-broker.ts`) is now used only for `getAccount`, `getActivity`, and `getClock`. The from-scratch `ws` streaming path described above lives in `src/main/integrations/massive-market-data.ts` (Massive / Polygon-compatible), not an Alpaca streaming provider.

## Source

- `plans/us-31/research.md`
- Feature page: `../../features/us-31-market-data-provider-adapter.md`
<!-- /generated -->

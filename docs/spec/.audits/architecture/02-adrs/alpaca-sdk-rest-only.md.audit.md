---
page: docs/spec/architecture/02-adrs/alpaca-sdk-rest-only.md
audited_at: 2026-06-29
findings: 2
---

# Audit: docs/spec/architecture/02-adrs/alpaca-sdk-rest-only.md

## Verified (12)

- ✓ Uses `@alpacahq/typescript-sdk` at `v0.0.32-preview` — `package.json:59` (`"@alpacahq/typescript-sdk": "0.0.32-preview"`).
- ✓ SDK calls isolated and bypassed for streaming via `ws` — broker imports `createClient` from the SDK (`src/main/integrations/alpaca-broker.ts:2`); market-data streaming uses `import WebSocket from 'ws'` (`src/main/integrations/massive-market-data.ts:3`).
- ✓ Market data has no Alpaca SDK — no `createClient`/SDK import anywhere in `src/main/integrations/massive-market-data.ts`; the only SDK importers are `alpaca.ts` and `alpaca-broker.ts`.
- ✓ `MassiveMarketDataProvider` exists at `src/main/integrations/massive-market-data.ts:104`.
- ✓ Talks to Massive REST over global `fetch` with key as `?apiKey=` query param — `src/main/integrations/massive-market-data.ts:149` (`fetch(this.authedUrl(url))`) and `:141` (`parsed.searchParams.set('apiKey', this.apiKey)`).
- ✓ `BASE_URL` is `https://api.massive.com` — `src/main/integrations/massive-market-data.ts:16`.
- ✓ Streams from a single JSON WebSocket `wss://delayed.massive.com/stocks` — `WS_URL` at `:17`; exactly one `new WebSocket(...)` in the file (`:268`); messages parsed via `JSON.parse` (`:279`).
- ✓ No `getStocksQuotesLatest` / `AlpacaMarketDataProvider` / MessagePack / two-socket path — grep across `src/` returns no matches for `getStocksQuotesLatest`, `AlpacaMarketDataProvider`, or `msgpack`/`messagepack`; only one `new WebSocket` exists.
- ✓ Only surviving `Alpaca*` class is `AlpacaBrokerProvider` implementing `BrokerProvider` — `class AlpacaBrokerProvider implements BrokerProvider` at `src/main/integrations/alpaca-broker.ts:92`; grep `class Alpaca` returns only this one.
- ✓ Broker uses SDK for `getAccount`, `getClock`, `getActivity` only — `src/main/integrations/alpaca-broker.ts:156` (`getAccount`), `:177` (`getActivity`), `:199` (`getClock`); no other `lazyClient.*` calls.
- ✓ Broker is on the `broker:*` IPC namespace — `src/main/ipc/broker.ts:9,16,24` register `broker:account`, `broker:activities`, `broker:market-status`.
- ✓ Stale comment in `alpaca.ts` is `@deprecated` and points at a non-existent `createMarketDataProvider()` — `src/main/integrations/alpaca.ts:17,23` carry `@deprecated Use createMarketDataProvider() from market-data-factory.ts instead`; grep finds no `createMarketDataProvider` definition anywhere (only these two JSDoc strings). The live construction path is the env-switched `marketDataFactory` object at `src/main/integrations/market-data-factory.ts:28`, wired in `src/main/index.ts:143,152,261`. This matches the ADR's own "stale comment to clean up" note exactly.

## Drift (0)

(none)

## Unverifiable (2)

- ? SDK bug claims (`getStocksSnapshots` hits wrong path, `getOptionsSnapshots` type omits `greeks`/`impliedVolatility`, `getActivity` ignores query params, WebSocket support "todo"). These describe third-party SDK behavior, not this repo's code, and none of those methods are called in `src/` (grep for `getStocksSnapshots`/`getOptionsSnapshots` returns nothing). Historical rationale; not mechanically auditable here.
- ? "REST endpoints the app needed do work" and the alternatives-considered narrative — historical decision rationale, not a checkable code claim.

## Missing files (1)

- ✗ The `Source` section cites `plans/us-31/research.md`, which does not exist (`plans/us-31/` directory is absent; only `plans/market-data-massive-migration/` survives). Per the project's known condition, plan dirs were deleted and the `.extracts` are now the durable source, so this is a systemic stale-citation rather than page-specific drift. The linked feature page `../../features/us-31-market-data-provider-adapter.md` exists and resolves correctly.

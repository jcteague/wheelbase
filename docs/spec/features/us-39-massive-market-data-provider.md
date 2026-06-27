# US-39: Massive Market Data Provider

<!-- generated:from us-39,market-data-massive-migration -->

## Summary

US-39 delivers `MassiveMarketDataProvider` — a REST-based market data adapter backed by the Massive.com API — as the second concrete implementation of the `MarketDataProvider` interface established by [US-31](./us-31-market-data-provider-adapter.md). The story completes a broker/market-data architectural split (US-31 → US-39 → US-40) that cleanly separates market data concerns (stock NBBO quotes, option snapshots with optional Greeks, paginated option chains) from broker concerns (account info, activities, market status).

The old `AlpacaMarketDataProvider` class and the combined `MarketDataProvider`/`BrokerProvider` interface are retired. In their place: a dedicated `MarketDataProvider` interface backed by `MassiveMarketDataProvider` and a separate `BrokerProvider` interface backed by `AlpacaBrokerProvider`. The IPC layer reflects this split with distinct `market-data:*` and `broker:*` channel namespaces. No database migrations were introduced.

Related stories in Epic 06 (Live Market Data):

- [US-31 — MarketDataProvider adapter interface](./us-31-market-data-provider-adapter.md)
- [US-32 — Live position prices](./us-32-live-position-prices.md)
- [US-33 — Option mid & P&L](./us-33-option-mid-pnl.md)
- [US-34 — Position cockpit](./us-34-position-cockpit.md)
- [US-37 — Paper/live broker environment toggle](./us-37-paper-live-broker-environment-toggle.md)

## Acceptance criteria

- **AC-1:** `getStockQuotes(tickers)` returns NBBO for each ticker; `mid = (bid + ask) / 2` rounded HALF_UP to 2 dp.
- **AC-2:** `getOptionSnapshot(underlying, contract)` returns a full snapshot including Greeks when the Massive response includes them.
- **AC-3:** `getOptionSnapshot` omits `greeks` and `impliedVolatility` when the Massive response omits them — no fabricated zeros.
- **AC-4:** `getOptionChainSnapshot(underlying, filters)` returns filtered option snapshots matching the supplied filters.
- **AC-5:** The Massive API key is loaded once per process and reused across all requests.
- **AC-6:** A missing or empty API key surfaces `MarketDataError` with `code: 'auth_failed'`.
- **AC-7:** A Massive 429 response triggers retry with exponential backoff (2 retries max).
- **AC-8:** A Massive 401 or 403 response surfaces `MarketDataError` with `code: 'auth_failed'`.
- **AC-9:** `supportsStreaming()` returns `true`. Streaming is now fully implemented: `connect()` opens a Massive WebSocket (auth + subscribe), and `stream(feed, symbols)` returns an `Observable` over the live tick subject filtered to the requested symbols. (The original US-39 ship only declared streaming and threw `streaming_unsupported`; a later story implemented the real WebSocket path.)

## What was built

- `MassiveMarketDataProvider` — a `MarketDataProvider` implementation that calls the Massive.com REST API using Node 20+ built-in `fetch` with `Authorization: Bearer` auth. Covers stock NBBO quotes, single-contract option snapshots, and filtered option chain lookups.
- `AlpacaBrokerProvider` — a new `BrokerProvider` implementation that contains only the broker methods previously mixed into `AlpacaMarketDataProvider` (account info, market status, activities).
- `BrokerProvider` interface — a TypeScript interface that formally separates broker concerns from market data concerns.
- New IPC handler file `src/main/ipc/broker.ts` routing `broker:*` channels to `AlpacaBrokerProvider`.
- Updated `src/main/ipc/market-data.ts` routing `market-data:*` channels to `MassiveMarketDataProvider`.
- Factory modules (`market-data-factory.ts`, `broker-factory.ts`) instantiating the correct provider based on configuration.
- `MassiveCredentials` helper in `src/main/integrations/massive-credentials.ts` for loading and validating the Massive API key at startup.
- Fake implementations (`fake-market-data.ts`, `fake-broker.ts`) for testing in both unit and E2E contexts.
- Renderer API adapters (`src/renderer/src/api/broker.ts`, `src/renderer/src/api/market-data.ts`) updated to the new channel names.
- `src/preload/index.ts` updated to expose both `market-data:*` and `broker:*` channels through the context bridge.

The `market-data:option-snapshots` bulk endpoint (from US-33) was **retained**; US-39 _added_ two new channels alongside it — single-contract lookup `market-data:option-snapshot` (singular) and filtered discovery `market-data:option-chain`. The old `AlpacaMarketDataProvider` class was deleted with no fallback.

## Architecture decisions

### REST over raw `fetch` — no SDK

Node 20+ built-in `fetch` is used directly for all Massive API calls. Massive has no official Node SDK, and wrapping `axios` or `node-fetch` would add unnecessary dependencies for straightforward REST calls.

### Bearer token auth in HTTP header

The Massive API key is sent as `Authorization: Bearer ${apiKey}` on every request. Query-string `?apiKey=` was rejected because it exposes secrets in URLs and server logs.

### Streaming declared, later implemented

At US-39 ship, `supportsStreaming()` returned `true` while `stream()` threw `MarketDataError` with `code: 'streaming_unsupported'` — signalling Massive's real capability without the Phase 2 overhead of WebSocket auth. Returning `false` was rejected to avoid misrepresenting Massive's actual API surface to future callers. This decision has since been superseded: `supportsStreaming()` (no argument) returns `true` unconditionally, and streaming is fully implemented — `connect()` opens a WebSocket and `stream(feed, symbols)` returns an `Observable` over the live tick subject.

### Optional Greeks — no fabricated zeros

`greeks` and `impliedVolatility` are typed as optional on `OptionSnapshot`. When the Massive response omits them, the adapter returns `undefined` rather than zero-filled objects. Fabricating zeros would cause the Greeks panel (see [US-34](./us-34-position-cockpit.md)) to render `0.00` instead of `—`, misleading traders into treating absent data as real values. This is a breaking change for any renderer code reading `snapshot.greeks.delta` without an optional chain; those paths must use `snapshot.greeks?.delta`.

### Market status stays on BrokerProvider

`getMarketStatus()` is not ported to `MassiveMarketDataProvider`. Massive's market-status endpoint is per-asset-class and doesn't map cleanly to the single `MarketStatus` shape. Alpaca's clock endpoint remains the authoritative source for session state across the UI.

### Old Alpaca market-data path deleted — no fallback

`AlpacaMarketDataProvider` is removed entirely. Users without Massive configured receive a clear `auth_failed` error. Maintaining both live data paths was rejected because it creates silent inconsistency: two code paths serving slightly different data shapes with no clear arbitration rule.

### Split IPC namespaces — `market-data:*` vs `broker:*`

The broker/market-data separation that US-31 introduced in the provider interface is now reflected at the IPC layer. Previously, the single combined `AlpacaMarketDataProvider` handled both sets of concerns through the same handler. Keeping mixed channels in one namespace would make the split invisible to renderers and preload code. See [IPC handlers contract](../contracts/ipc-handlers.md) for the full channel registry.

### `market-data:option-snapshots` (bulk) retained; singular + chain added

The US-33 bulk endpoint forced callers to batch OCC symbols themselves with no filter support. Rather than removing it, US-39 _added_ two new shapes alongside the retained bulk channel — `market-data:option-snapshot` for single-contract lookups and `market-data:option-chain` for filtered discovery — which match Massive's actual API surface and enable the option screener work planned for Epic 3. The bulk channel is still registered (`market-data:option-snapshots`) and exposed in preload as `getOptionSnapshots`.

## Contracts touched

See [IPC handlers](../contracts/ipc-handlers.md) for the full channel registry. The channels introduced or modified by US-39:

### `market-data:stock-quotes`

IPC request/response. Fetches NBBO quotes for a batch of tickers from Massive.

```
Request:  { tickers: string[] }
Response: { ok: true; quotes: Record<string, StockQuote> }
        | { ok: false; errors: string[] }
```

`StockQuote` carries bid, ask, and computed mid (HALF_UP to 2 dp). Implemented in `src/main/ipc/market-data.ts`.

### `market-data:option-snapshot`

IPC request/response. Fetches a single option contract snapshot by OCC symbol.

```
Request:  { underlying: string; contract: string }  // contract is OCC-format, regex-validated
Response: { ok: true; snapshot: OptionSnapshot | null }
        | { ok: false; errors: string[] }
```

`OptionSnapshot` carries bid/ask/mid, open interest, volume, and optionally `greeks` and `impliedVolatility`. Implemented in `src/main/ipc/market-data.ts`.

### `market-data:option-chain`

IPC request/response. Returns filtered option chain snapshots with cursor-based pagination shape (cursor always `null` in the initial implementation; real pagination deferred to a follow-up story).

```
Request:  {
            underlying: string;
            expirationFrom?: string;  // ISO date
            expirationTo?: string;    // ISO date
            type?: 'call' | 'put';
            strikeFrom?: number;
            strikeTo?: number;
            limit?: number;
            cursor?: string;
          }
Response: { ok: true; snapshots: OptionSnapshot[]; nextCursor: null }
        | { ok: false; errors: string[] }
```

Implemented in `src/main/ipc/market-data.ts`.

### `broker:account`, `broker:market-status`, `broker:activities`

Three new IPC request/response channels that replace broker methods previously exposed through the combined Alpaca provider. All route to `AlpacaBrokerProvider` via `src/main/ipc/broker.ts`. Payloads mirror the shapes previously documented under the old Alpaca integration — see [alpaca-integration contract](../contracts/alpaca-integration.md).

### `BrokerProvider` interface

A TypeScript interface (not an IPC channel) defined in `src/main/integrations/broker-provider.ts`. Exposes `getAccountInfo()`, `getMarketStatus()`, and `getActivities(filter)` — the broker-side subset of the former combined interface. The `MarketDataProvider` interface (established in [US-31](./us-31-market-data-provider-adapter.md)) retains the market-data subset.

## Source files

- `src/main/integrations/broker-provider.ts` — `BrokerProvider` interface definition
- `src/main/integrations/market-data-provider.ts` — `MarketDataProvider` interface (updated from US-31)
- `src/main/integrations/massive-market-data.ts` — `MassiveMarketDataProvider` implementation
- `src/main/integrations/alpaca-broker.ts` — `AlpacaBrokerProvider` implementation
- `src/main/integrations/fake-market-data.ts` — test double for `MarketDataProvider`
- `src/main/integrations/fake-broker.ts` — test double for `BrokerProvider`
- `src/main/integrations/massive-credentials.ts` — Massive API key loading and validation
- `src/main/integrations/market-data-factory.ts` — instantiates the active `MarketDataProvider`
- `src/main/integrations/broker-factory.ts` — instantiates the active `BrokerProvider`
- `src/main/ipc/market-data.ts` — IPC handlers for `market-data:*` channels
- `src/main/ipc/broker.ts` — IPC handlers for `broker:*` channels
- `src/preload/index.ts` — context bridge exposing both channel namespaces to the renderer
- `src/renderer/src/api/broker.ts` — renderer-side API adapter for `broker:*` channels
- `src/renderer/src/api/market-data.ts` — renderer-side API adapter for `market-data:*` channels
<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->

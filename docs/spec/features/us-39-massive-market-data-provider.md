# US-39: Massive Market Data Provider

<!-- generated:from us-39,market-data-massive-migration -->

## Summary

US-39 delivers `MassiveMarketDataProvider` — the live market-data adapter backed by the **Massive** API (a Polygon-compatible delayed-data vendor) — as the second concrete implementation of the provider-agnostic `MarketDataProvider` type established by [US-31](./us-31-market-data-provider-adapter.md). The story completes a broker/market-data architectural split (US-31 → US-39 → US-40) that cleanly separates market-data concerns (stock quotes, option snapshots with optional Greeks, filtered option chains) from broker concerns (account info, activities, market status). It is integration/IPC-layer only — no database or schema changes.

The old `AlpacaMarketDataProvider` class and the combined market-data/broker interface are retired. In their place: a provider-agnostic `MarketDataProvider` type backed by `MassiveMarketDataProvider`, and a separate `BrokerProvider` interface backed by `AlpacaBrokerProvider`. The broker stays Alpaca; only the market-data vendor moved to Massive. The IPC layer reflects the split with distinct `market-data:*` and `broker:*` channel namespaces. See the [market-data topic page](../domain/market-data.md) for the cross-story view of this layer.

> The shipped current state is recorded by the **market-data-massive-migration** retro plan, which supersedes the Alpaca-era portions of US-31/US-32/US-39. Where the original US-39 plan and the migration disagree (auth scheme, base URL, streaming, error codes), this page documents what shipped — see [Revisions](#revisions).

Related stories in Epic 06 (Live Market Data):

- [US-31 — MarketDataProvider adapter interface](./us-31-market-data-provider-adapter.md)
- [US-32 — Live position prices](./us-32-live-position-prices.md)
- [US-33 — Option mid & P&L](./us-33-option-mid-pnl.md)
- [US-34 — Position cockpit](./us-34-position-cockpit.md)
- [US-37 — Paper/live broker environment toggle](./us-37-paper-live-broker-environment-toggle.md)

The original US-39 story AC list, as written. Where the migration changed the shipped behaviour the AC text below is annotated; the [Revisions](#revisions) and [Architecture decisions](#architecture-decisions) sections carry the current detail.

- **AC-1:** `getStockQuotes(tickers)` returns a quote for each ticker. (Massive snapshots are aggregate bars, not live bid/ask, so `price`/`bid`/`ask` all carry the last-minute close; `StockQuote` also carries `prevClose` and a 4-dp `changePercent`.)
- **AC-2:** `getOptionSnapshot(contractId)` returns a full snapshot including Greeks when the Massive response includes them.
- **AC-3:** `getOptionSnapshot` omits `greeks` and `impliedVolatility` when the Massive response omits them — no fabricated zeros.
- **AC-4:** `getOptionChainSnapshot(filter)` returns filtered option snapshots matching the supplied filter.
- **AC-5:** The Massive API key is loaded once per process and reused across all requests.
- **AC-6:** A missing or empty API key surfaces `MarketDataError` with `code: 'auth_failed'`.
- **AC-7:** A Massive 429 response triggers retry with backoff (using the `Retry-After` header, `MAX_RETRIES` cap) before surfacing `code: 'rate_limited'`.
- **AC-8:** A Massive 401 or 403 response surfaces `MarketDataError` with `code: 'auth_failed'`.
- **AC-9:** `supportsStreaming(feed)` returns `true`. Streaming is fully implemented: `connect()` opens the Massive WebSocket (auth + subscribe), and `stream(feed, symbols)` returns an `Observable` over the live tick subject filtered to the requested symbols. (The original US-39 ship only declared streaming and threw `streaming_unsupported`; the migration implemented the real WebSocket path.)

## What was built

- `MassiveMarketDataProvider` — a `MarketDataProvider` implementation that calls the Massive REST API (`https://api.massive.com`) using Node 20+ built-in `fetch`, passing the key as an `?apiKey=` query param. Covers stock quotes, single-contract option snapshots, filtered option chains, and a single JSON WebSocket for live ticks.
- `AlpacaBrokerProvider` — a new `BrokerProvider` implementation that contains only the broker methods previously mixed into `AlpacaMarketDataProvider` (account info, market status, activities).
- `BrokerProvider` interface — a TypeScript interface that formally separates broker concerns from market data concerns.
- New IPC handler file `src/main/ipc/broker.ts` routing `broker:*` channels to `AlpacaBrokerProvider`.
- Updated `src/main/ipc/market-data.ts` routing `market-data:*` channels to `MassiveMarketDataProvider`.
- Factory modules (`market-data-factory.ts`, `broker-factory.ts`) instantiating the correct provider based on configuration.
- `MassiveCredentials` helper in `src/main/integrations/massive-credentials.ts` for loading and validating the Massive API key at startup.
- Fake implementations (`fake-market-data.ts`, `fake-broker.ts`) for testing in both unit and E2E contexts.
- Renderer API adapters (`src/renderer/src/api/broker.ts`, `src/renderer/src/api/market-data.ts`) updated to the new channel names. The market-data adapter wraps only `stock-quotes` and the bulk `option-snapshots`; the singular `option-snapshot` and `option-chain` channels exist on the main/preload side but are not yet wrapped by the renderer adapter.
- `src/preload/index.ts` updated to expose both `market-data:*` and `broker:*` channels through the context bridge.

The `market-data:option-snapshots` bulk endpoint (from US-33) was **retained**; US-39 _added_ two new channels alongside it — single-contract lookup `market-data:option-snapshot` (singular) and filtered discovery `market-data:option-chain`. The old `AlpacaMarketDataProvider` class was deleted with no fallback.

## Revisions

- **us-39** (original plan): introduced `MassiveMarketDataProvider` and the broker/market-data interface split. The plan assumed `Authorization: Bearer` auth, deferred WebSocket streaming (`stream()` threw `streaming_unsupported`), and claimed the bulk `option-snapshots` channel was replaced.
- **market-data-massive-migration** (retro, authoritative): records the shipped state and supersedes the Alpaca-era US-31/US-32/US-39 portions. Corrections vs. the original plan: auth is an `?apiKey=` **query param** (not a Bearer header); REST base is `https://api.massive.com` with v2 stock and v3 option paths paginating via `next_url`; streaming is fully implemented over a **single JSON WebSocket** `wss://delayed.massive.com/stocks` (`AM.*` aggregate-minute frames); the bulk `option-snapshots` channel was **retained** (singular + chain added alongside); `MarketDataError` codes are HTTP-mapped and include `unknown`; and Massive snapshots are aggregate bars, so the last-minute close is used as `price`/`bid`/`ask`.

## Architecture decisions

### REST over raw `fetch` — no SDK, key as query param

Node 20+ built-in `fetch` is used directly for all Massive REST calls against `https://api.massive.com` — Massive has no official Node SDK, and wrapping `axios` or `node-fetch` would add unnecessary dependencies for straightforward REST. The API key is passed as an `?apiKey=` query param (no Bearer header, no SDK client). Stock snapshots hit `/v2/snapshot/locale/us/markets/stocks/tickers/{ticker}`; option reads hit `/v3/snapshot/options/{underlying}[/{O:contract}]`, with chain filters (`expiration_date.gte/lte`, `contract_type`, `strike_price.gte/lte`, `limit`, `cursor`) paginating via `next_url` when no `limit` is given.

> The original US-39 plan specified `Authorization: Bearer ${apiKey}`; the shipped code uses the `?apiKey=` query param. This page documents the shipped behaviour per the migration retro.

### Aggregate bars as price

Massive stock snapshots are aggregate bars, not live NBBO bid/ask. The adapter therefore uses the last-minute close as `price`, `bid`, and `ask`, and carries `prevClose` plus a 4-dp `changePercent` (from the snapshot's `todaysChangePerc`) on `StockQuote`.

### Single JSON WebSocket for streaming

Streaming runs over one WebSocket, `wss://delayed.massive.com/stocks`, with JSON frames: `{action:'auth',params:<apiKey>}`, then on `auth_success` `{action:'subscribe',params:'AM.*'}`. `AM` aggregate-minute frames (`ev:'AM'`) are mapped to `StockQuote` ticks and exposed as an RxJS `Observable` filtered to the subscribed symbol set. This replaces the Alpaca-era two-socket / MessagePack design (none of which remains in code; `@msgpack/msgpack` is still a declared dependency but unused).

> At US-39 ship, `supportsStreaming()` returned `true` while `stream()` threw `streaming_unsupported` — deferring WebSocket auth past Phase 2. The migration implemented the real WebSocket path: `supportsStreaming(feed)` returns `true`, `connect(feeds?)` opens the socket (auth + subscribe), `stream(feed, symbols)` returns the `Observable`, and `disconnect()` tears it down. The `MarketDataProvider` type declares `connect(feeds?: MarketDataFeed[])`, but the Massive implementation ignores the `feeds` argument and always connects its single stock-quote socket.

### Optional Greeks — no fabricated zeros

`greeks` and `impliedVolatility` are typed as optional on `OptionSnapshot`. When the Massive response omits them, the adapter returns `undefined` rather than zero-filled objects. Fabricating zeros would cause the Greeks panel (see [US-34](./us-34-position-cockpit.md)) to render `0.00` instead of `—`, misleading traders into treating absent data as real values. This is a breaking change for any renderer code reading `snapshot.greeks.delta` without an optional chain; those paths must use `snapshot.greeks?.delta`.

### Structured `MarketDataError` codes, HTTP-mapped

Failures throw `MarketDataError` carrying a `MarketDataErrorCode` ∈ `auth_failed | network_error | not_found | rate_limited | streaming_unsupported | unknown`, mapped from the HTTP status: 401/403 → `auth_failed`, 429 → `rate_limited` (after `MAX_RETRIES` with `Retry-After` backoff), 404 → `not_found`, and any other non-ok / unexpected response → `unknown`. This gives the renderer a stable, vendor-independent error vocabulary. The Alpaca-specific `options_no_subscription` code was dropped; `unknown` is the catch-all and the e2e fake can force any code via `FAKE_MARKET_DATA_ERROR`. `MarketDataError`, `MarketDataErrorCode`, and `MarketDataFeed` are defined in `src/main/integrations/market-data-provider.ts`; broker failures use a separate `BrokerError` in `src/main/integrations/broker-provider.ts`. `integration-errors.ts` exports only the `isNetworkError` helper — neither error class lives there.

### Env-switched provider factory

`marketDataFactory` (`src/main/integrations/market-data-factory.ts`) centralizes provider selection behind env config: `configure()` / `create()` / `recreate()` / `disconnect()`. It returns `FakeMarketDataProvider` when `FAKE_MARKET_DATA==='true'`, otherwise a `MassiveMarketDataProvider` built from the configured key loader (`loadMassiveApiKey`, which prefers `MAIN_VITE_MASSIVE_API_KEY` and falls back to `process.env.MASSIVE_API_KEY`); it throws when neither key nor fake flag is set. The deterministic in-process fake keeps e2e runs offline.

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

The provider type itself (`MarketDataProvider`) is documented on the [market-data topic page](../domain/market-data.md); it ships as a `type` (not `interface`) with `getStockQuotes(tickers): Promise<Map<string, StockQuote>>`, `getOptionSnapshot(contractId)`, `getOptionChainSnapshot(filter)`, and the streaming methods (`supportsStreaming` / `connect` / `disconnect` / `stream`). The IPC channels below wrap these reads.

### `market-data:stock-quotes`

IPC request/response. Fetches quotes for a batch of tickers from Massive.

```
Request:  { tickers: string[] }
Response: { ok: true; quotes: Record<string, StockQuote> }
        | { ok: false; errors: string[] }
```

`StockQuote` carries `price`/`bid`/`ask` (all the last-minute close, since Massive returns aggregate bars), plus `prevClose`, `change`, 4-dp `changePercent`, `volume`, and `timestamp`. Implemented in `src/main/ipc/market-data.ts`. The full `market-data:*` registry (`stock-quotes`, `set-stock-quote-tickers`, `stock-quote` push, `stream-error` push, `option-snapshots`, `option-snapshot`, `option-chain`) and the `broker:*` channels live in [IPC handlers](../contracts/ipc-handlers.md).

### `market-data:option-snapshot`

IPC request/response. Fetches a single option contract snapshot by OCC symbol.

```
Request:  { underlying: string; contract: string }  // contract is OCC-format, regex-validated
Response: { ok: true; snapshot: OptionSnapshot | null }
        | { ok: false; errors: string[] }
```

`OptionSnapshot` carries bid/ask/mid, open interest, volume, and optionally `greeks` and `impliedVolatility`. `openInterest` and `volume` are typed `number | null` and come back `null` from Massive snapshots. Implemented in `src/main/ipc/market-data.ts`.

### `market-data:option-chain`

IPC request/response. Returns filtered option chain snapshots with cursor-based pagination shape (cursor always `null` in the initial implementation; real pagination deferred to a follow-up story).

```
Request:  {
            underlying: string;
            expirationFrom?: string;  // ISO date
            expirationTo?: string;    // ISO date
            type?: 'call' | 'put';
            strikeFrom?: string;      // strike bounds are strings, not numbers
            strikeTo?: string;
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

- `src/main/integrations/broker-provider.ts` — `BrokerProvider` interface plus `BrokerError` / `BrokerErrorCode`
- `src/main/integrations/market-data-provider.ts` — `MarketDataProvider` type (updated from US-31) plus `MarketDataError` / `MarketDataErrorCode` / `MarketDataFeed`
- `src/main/integrations/massive-market-data.ts` — `MassiveMarketDataProvider` implementation (REST + WebSocket)
- `src/main/integrations/alpaca-broker.ts` — `AlpacaBrokerProvider` implementation (only surviving `Alpaca*` integration)
- `src/main/integrations/fake-market-data.ts` — test double for `MarketDataProvider`
- `src/main/integrations/fake-broker.ts` — test double for `BrokerProvider`
- `src/main/integrations/massive-credentials.ts` — `loadMassiveApiKey` (prefers `MAIN_VITE_MASSIVE_API_KEY`)
- `src/main/integrations/integration-errors.ts` — `isNetworkError` helper only (error classes live in their respective provider modules, not here)
- `src/main/integrations/market-data-factory.ts` — env-switched `marketDataFactory`
- `src/main/integrations/broker-factory.ts` — instantiates the active `BrokerProvider`
- `src/main/ipc/market-data.ts` — IPC handlers for `market-data:*` channels
- `src/main/ipc/broker.ts` — IPC handlers for `broker:*` channels
- `src/shared/option-symbol.ts` — `buildOccSymbol` / `BuildOccSymbolInput` (re-exported by `src/main/core/option-symbol.ts`)
- `src/preload/index.ts` — context bridge exposing `marketData` / `broker` plus `onStockQuote` / `onStreamError`
- `src/renderer/src/api/broker.ts` — renderer-side API adapter for `broker:*` channels
- `src/renderer/src/api/market-data.ts` — renderer-side API adapter for `market-data:*` channels (wraps `stock-quotes` and bulk `option-snapshots` only; `option-snapshot` and `option-chain` not yet wrapped)
- `src/renderer/src/hooks/useStockQuotes.ts` — quote polling hook (`STALE_THRESHOLD_MS = 5 min`)

Removed by this work: `src/main/integrations/alpaca-market-data.ts` (`AlpacaMarketDataProvider`), `createMarketDataProvider` / `MarketDataConfig`, the `broker:account-info` channel name, and the two-socket / MessagePack streaming path.

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->

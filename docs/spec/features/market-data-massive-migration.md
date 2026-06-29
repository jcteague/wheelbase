# Market-Data Provider Migration: Alpaca → Massive

<!-- generated:from market-data-massive-migration -->

## Summary

The live market-data layer was migrated off Alpaca's market-data API onto the
**Massive** provider (a Polygon-compatible delayed-data vendor). A
provider-agnostic `MarketDataProvider` interface, an env-switched
`marketDataFactory`, and a `MassiveMarketDataProvider` (REST over `fetch` plus a
single JSON WebSocket) replaced the original `AlpacaMarketDataProvider`. In the
same change the **broker** concerns (account, market clock/session, activities)
were split out of the market-data interface into a separate `BrokerProvider`
(`AlpacaBrokerProvider`) on a dedicated `broker:*` IPC namespace; quote and
option reads stay on `market-data:*`. There were **no database or schema
changes** — this is an integration/IPC-layer migration only. The broker remains
Alpaca; only the market-data vendor changed.

This page records the **current shipped state** of the market-data provider
layer and **supersedes the market-data portions** of
[us-31 — Market-Data Provider Adapter](./us-31-market-data-provider-adapter.md),
[us-32 — Live Position Prices](./us-32-live-position-prices.md), and
[us-39 — Massive Market-Data Provider](./us-39-massive-market-data-provider.md)
(all Alpaca-era). Where those pages name `AlpacaMarketDataProvider`,
`createMarketDataProvider`, the Alpaca SDK for market-data REST, two-socket /
MessagePack streaming, or account/status under `market-data:*`, this page is
authoritative.

## Acceptance criteria

This is a **retro migration**, not a user story — there is no story AC list. It
records shipped state. Done-state:

- Live stock quotes and option snapshots are served by Massive through the
  provider-agnostic `MarketDataProvider` interface.
- Broker concerns (account, market status, activities) are served by
  `AlpacaBrokerProvider` on the `broker:*` namespace.
- e2e runs deterministically against the in-process `FakeMarketDataProvider`
  (`FAKE_MARKET_DATA==='true'`; `FAKE_MARKET_DATA_ERROR` forces an error code).

## What was built

**Provider interface.** `MarketDataProvider`
(`src/main/integrations/market-data-provider.ts`, declared as a `type`, not an
`interface`) is provider-agnostic, so only the concrete implementation and the
factory changed. It exposes `getStockQuotes(tickers)` returning
`Promise<Map<string, StockQuote>>`, `getOptionSnapshot(contractId)` (singular),
`getOptionChainSnapshot(filter)`, `supportsStreaming(feed)`, `connect(feeds?)`,
`disconnect()`, and `stream(feed, symbols)` returning an RxJS
`Observable<StreamEvent<…>>` filtered to the subscribed symbol set. `StockQuote`
carries `prevClose` and a 4-dp `changePercent` (from the snapshot's
`todaysChangePerc`) alongside `price`, `bid`, `ask`, `change`, `volume`,
`timestamp`; since Massive returns aggregate bars (no live bid/ask), the
last-minute close feeds `price`/`bid`/`ask`. `OptionSnapshot` has optional
`greeks?` (4-dp delta/gamma/theta/vega) and a **top-level** `impliedVolatility?`
(no longer nested under `greeks`); its `openInterest` and `volume` are typed
`number | null` and come back `null` from Massive snapshots. `OptionChainFilter`
carries `underlying` plus optional `expirationFrom/To`, `type`
(`'put' | 'call'`), `strikeFrom/To`, `limit`, and `cursor` — the strike and
expiration **bounds are typed `string`** (not `number`) in source. `connect(feeds?)`
accepts a feed list in the type, but `MassiveMarketDataProvider` **ignores it**
and always connects its single stock-quote socket. The feed union is
`MarketDataFeed` (`'stockQuotes' | 'optionQuotes' | 'optionTrades'`).

**Massive implementation.** `MassiveMarketDataProvider`
(`src/main/integrations/massive-market-data.ts`) hits `https://api.massive.com`
over the built-in `fetch`, passing the key as an `apiKey` **query param** (no
Bearer header, no SDK client). Stock snapshots use
`/v2/snapshot/locale/us/markets/stocks/tickers/{ticker}`; single option reads
use `/v3/snapshot/options/{underlying}/{O:contract}`; the chain uses
`/v3/snapshot/options/{underlying}` with `expiration_date.gte/lte`,
`contract_type`, `strike_price.gte/lte`, `limit`, and `cursor` (paginating via
`next_url` when no `limit`). Streaming uses a **single** JSON WebSocket
`wss://delayed.massive.com/stocks`: `{action:'auth',params:<apiKey>}` then, on
`auth_success`, `{action:'subscribe',params:'AM.*'}` — `ev:'AM'`
aggregate-minute frames become `StockQuote` ticks. The fake
(`fake-market-data.ts`) serves deterministic data for e2e
(`FAKE_MARKET_DATA_ERROR` forces a specific error code).

**Factory.** `marketDataFactory`
(`src/main/integrations/market-data-factory.ts`) exposes
`configure()`/`create()`/`recreate()`/`disconnect()` (`recreate()` clears the
cached provider and returns `void`). It returns `FakeMarketDataProvider` when
`FAKE_MARKET_DATA==='true'`, otherwise a `MassiveMarketDataProvider` built from
the configured key loader; it throws "Market data provider not configured. Set
MASSIVE_API_KEY or FAKE_MARKET_DATA=true." when neither is set. The wired loader
(`massive-credentials.ts`, `loadMassiveApiKey`) prefers
`MAIN_VITE_MASSIVE_API_KEY` (electron-vite `.env`) and falls back to
`process.env.MASSIVE_API_KEY`. This replaces the old
`createMarketDataProvider(config)` + `MarketDataConfig` + `provider:'alpaca'`
union.

**Broker split.** Account, market clock/session, and activities moved onto a
separate `BrokerProvider` (`AlpacaBrokerProvider`,
`src/main/integrations/alpaca-broker.ts`, selected by
`broker-factory.ts`) served on `broker:account`, `broker:market-status`, and
`broker:activities`. There is **no** `market-data:market-status` channel, and
the former `broker:account-info` channel is now `broker:account`.

**Errors.** Failures throw `MarketDataError` with a `MarketDataErrorCode` ∈
`auth_failed | network_error | not_found | rate_limited | streaming_unsupported | unknown`,
mapped from HTTP status: 401/403 → `auth_failed`, 429 → `rate_limited` (after
`MAX_RETRIES` with `Retry-After` backoff), 404 → `not_found`, other non-ok /
unexpected → `unknown`. There is no `stream_disconnected` or
`subscription_failed`. `MarketDataError`, `MarketDataErrorCode`, and
`MarketDataFeed` are all defined in
`src/main/integrations/market-data-provider.ts` (the type-only provider module),
**not** in `integration-errors.ts` — which exports only `isNetworkError`. Broker
failures use a separate `BrokerError` (`broker-provider.ts`). The
`streaming_unsupported` code is thrown **only by `FakeMarketDataProvider`**; the
Massive provider never raises it.

**OCC symbols.** `buildOccSymbol` lives in `src/shared/option-symbol.ts` (usable
from both processes); `src/main/core/option-symbol.ts` is now a re-export, not a
definition.

## Architecture decisions

- **Massive replaces Alpaca as the market-data provider** — quotes and option
  snapshots come from `MassiveMarketDataProvider`; `AlpacaMarketDataProvider`
  was removed. Massive supplies the needed delayed stock + option data on a
  simpler REST-plus-single-socket surface, decoupled from the Alpaca SDK. See
  [market-data-provider-interface](../architecture/02-adrs/market-data-provider-interface.md).
- **Provider lifecycle behind the factory** — env-switched
  `marketDataFactory` centralizes provider selection and gives a deterministic
  in-process fake for e2e, replacing `createMarketDataProvider` + the
  `provider:'alpaca'` union. See
  [market-data-provider-lifecycle](../architecture/02-adrs/market-data-provider-lifecycle.md)
  and
  [shared-massive-app-configuration](../architecture/02-adrs/shared-massive-app-configuration.md).
- **Single JSON WebSocket for streaming** — one socket
  (`wss://delayed.massive.com/stocks`) with JSON framing replaces the Alpaca
  two-socket design, OPRA option feed, and MessagePack framing.
  `@msgpack/msgpack` remains a dependency but is now unused. See
  [ws-package-streaming](../architecture/02-adrs/ws-package-streaming.md)
  (supersedes
  [msgpack-option-streaming](../architecture/02-adrs/msgpack-option-streaming.md)).
- **REST over `fetch`, key as query param** — no SDK dependency for
  market-data REST; the Massive key is an `apiKey` query param, not a Bearer
  header.
- **Broker concerns split onto `broker:*`** — market data and broker are
  distinct vendors with distinct lifecycles (broker stays Alpaca; market data
  moved to Massive), so account/status/activities moved off
  `MarketDataProvider` onto `BrokerProvider`.
- **Bulk option-snapshots channel retained; singular + chain added** —
  `market-data:option-snapshots` (bulk) stays, and singular
  `market-data:option-snapshot` plus `market-data:option-chain` were added,
  backed by `getOptionSnapshot` and `getOptionChainSnapshot`. (Supersedes the
  us-39 claim that the bulk endpoint was deleted.)
- **Structured `MarketDataError` codes, HTTP-mapped** — a stable,
  renderer-actionable error vocabulary independent of vendor. See
  [marketdataerror-structured-codes](../architecture/02-adrs/marketdataerror-structured-codes.md).
- **`buildOccSymbol` as a shared pure leaf** — one OCC builder usable from both
  processes; `MarketDataFeed` replaces the old `DataFeed` name. See
  [occ-symbol-pure-leaf](../architecture/02-adrs/occ-symbol-pure-leaf.md).

## Contracts touched

- **`MarketDataProvider` type** + `MarketDataError` / `MarketDataErrorCode`
  (`auth_failed | network_error | not_found | rate_limited |
streaming_unsupported | unknown`) / `MarketDataFeed` — all three are defined in
  `src/main/integrations/market-data-provider.ts` (not `integration-errors.ts`).
  See [market-data](../domain/market-data.md) and
  [alpaca-integration](../contracts/alpaca-integration.md). The shipped shape
  corrects the plan's contract file: source ships
  `getStockQuotes(): Promise<Map<string, StockQuote>>`, a single-`filter`
  `getOptionChainSnapshot`, an RxJS `Observable` from `stream`,
  `OptionSnapshot.openInterest`/`volume` as `number | null`, and
  `OptionChainFilter` strike/expiration bounds typed `string` (the contract
  documented a `StockQuote[]` return, a `(underlying, filter?)` signature, and a
  hand-wavy subscription).
- **`marketDataFactory`** — `configure()`/`create()`/`recreate()`/`disconnect()`;
  fake when `FAKE_MARKET_DATA==='true'`, else Massive from `MASSIVE_API_KEY`.
- **`market-data:*` IPC** — `stock-quotes`, `set-stock-quote-tickers`,
  `stock-quote` (push), `stream-error` (push), `option-snapshots` (bulk),
  `option-snapshot`, `option-chain`. No `market-data:market-status`. See
  [ipc-handlers](../contracts/ipc-handlers.md).
- **`broker:*` IPC** — `broker:account`, `broker:market-status`,
  `broker:activities` (renamed from `broker:account-info`). See
  [ipc-handlers](../contracts/ipc-handlers.md).
- **Schema** — none. No tables, columns, indexes, or migration files were added
  or altered.

## Source files

- `src/main/integrations/market-data-provider.ts` (defines `MarketDataProvider`,
  `MarketDataError`, `MarketDataErrorCode`, `MarketDataFeed`)
- `src/main/integrations/massive-market-data.ts`
- `src/main/integrations/fake-market-data.ts` (sole source of
  `streaming_unsupported`)
- `src/main/integrations/market-data-factory.ts`
- `src/main/integrations/massive-credentials.ts`
- `src/main/integrations/integration-errors.ts` (exports only `isNetworkError`)
- `src/main/integrations/alpaca-broker.ts`
- `src/main/integrations/broker-provider.ts` (`BrokerError`)
- `src/main/integrations/broker-factory.ts`
- `src/main/ipc/market-data.ts`
- `src/main/ipc/broker.ts`
- `src/shared/option-symbol.ts` (re-exported by `src/main/core/option-symbol.ts`)
- `src/renderer/src/hooks/useStockQuotes.ts` (`STALE_THRESHOLD_MS`)

Removed by this migration: `AlpacaMarketDataProvider` /
`src/main/integrations/alpaca-market-data.ts`; `createMarketDataProvider` /
`MarketDataConfig`; the `broker:account-info` channel name; the two-socket /
MessagePack streaming path.

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->

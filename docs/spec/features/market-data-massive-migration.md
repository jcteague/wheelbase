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
  (`FAKE_MARKET_DATA==='true'`).

## What was built

**Provider interface.** `MarketDataProvider`
(`src/main/integrations/market-data-provider.ts`) is provider-agnostic, so only
the concrete implementation and the factory changed. It exposes
`getStockQuotes`, `getOptionSnapshot` (singular), `getOptionChainSnapshot`,
`supportsStreaming(feed)`, `connect(feeds?)`, `stream(feed, …)`, and
`disconnect()`. `StockQuote` carries `prevClose` and a 4-dp `changePercent`
derived from the previous-day bar; `OptionSnapshot` has optional `greeks?` and a
top-level `impliedVolatility?`. The feed union is `MarketDataFeed`
(`'stockQuotes' | 'optionQuotes' | 'optionTrades'`).

**Massive implementation.** `MassiveMarketDataProvider`
(`src/main/integrations/massive-market-data.ts`) hits `https://api.massive.com`
over the built-in `fetch`, passing the key as an `apiKey` **query param** (no
Bearer header, no SDK client). Stock snapshots use
`/v2/snapshot/locale/us/markets/stocks/tickers/{ticker}`. Streaming uses a
**single** JSON WebSocket `wss://delayed.massive.com/stocks`:
`{action:'auth',params:<apiKey>}` then `{action:'subscribe',params:'AM.*'}`
(aggregate-minute). The fake (`fake-market-data.ts`) serves deterministic data
for e2e.

**Factory.** `marketDataFactory`
(`src/main/integrations/market-data-factory.ts`) exposes
`configure()`/`create()`/`recreate()`/`disconnect()`. It returns
`FakeMarketDataProvider` when `FAKE_MARKET_DATA==='true'`, otherwise a
`MassiveMarketDataProvider` built from `MASSIVE_API_KEY`; it throws
"Market data provider not configured…" when neither is set. This replaces the
old `createMarketDataProvider(config)` + `MarketDataConfig` +
`provider:'alpaca'` union.

**Broker split.** Account, market clock/session, and activities moved onto a
separate `BrokerProvider` (`AlpacaBrokerProvider`,
`src/main/integrations/alpaca-broker.ts`, selected by
`broker-factory.ts`) served on `broker:account`, `broker:market-status`, and
`broker:activities`. There is **no** `market-data:market-status` channel, and
the former `broker:account-info` channel is now `broker:account`.

**Errors.** Failures throw `MarketDataError` (`integration-errors.ts`) with a
`MarketDataErrorCode` ∈
`auth_failed | network_error | not_found | rate_limited | streaming_unsupported`,
mapped from HTTP status. There is no `stream_disconnected` or
`subscription_failed`.

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

- **`MarketDataProvider` interface** + `MarketDataError` /
  `MarketDataErrorCode` / `MarketDataFeed` — see
  [market-data](../domain/market-data.md) and
  [alpaca-integration](../contracts/alpaca-integration.md).
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

- `src/main/integrations/market-data-provider.ts`
- `src/main/integrations/massive-market-data.ts`
- `src/main/integrations/fake-market-data.ts`
- `src/main/integrations/market-data-factory.ts`
- `src/main/integrations/massive-credentials.ts`
- `src/main/integrations/integration-errors.ts`
- `src/main/integrations/alpaca-broker.ts`
- `src/main/integrations/broker-provider.ts`
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

---
page: docs/spec/features/market-data-massive-migration.md
audited_at: 2026-06-29
findings: 2
---

# Audit: market-data-massive-migration

## Verified (29)

### Source files (all cited paths exist)

- ✓ `src/main/integrations/market-data-provider.ts` exists.
- ✓ `src/main/integrations/massive-market-data.ts` exists.
- ✓ `src/main/integrations/fake-market-data.ts` exists.
- ✓ `src/main/integrations/market-data-factory.ts` exists.
- ✓ `src/main/integrations/massive-credentials.ts` exists.
- ✓ `src/main/integrations/integration-errors.ts` exists.
- ✓ `src/main/integrations/alpaca-broker.ts` exists.
- ✓ `src/main/integrations/broker-provider.ts` exists.
- ✓ `src/main/integrations/broker-factory.ts` exists.
- ✓ `src/main/ipc/market-data.ts` exists.
- ✓ `src/main/ipc/broker.ts` exists.
- ✓ `src/shared/option-symbol.ts` exists; `src/main/core/option-symbol.ts:1`
  is a pure re-export (`export { buildOccSymbol, type BuildOccSymbolInput } from '../../shared/option-symbol'`).
- ✓ `src/renderer/src/hooks/useStockQuotes.ts` exists with
  `STALE_THRESHOLD_MS` (`useStockQuotes.ts:17`).
- ✓ Removed file `src/main/integrations/alpaca-market-data.ts` is absent.

### Provider interface (`market-data-provider.ts`)

- ✓ `MarketDataProvider` is declared as a `type`, not `interface`
  (`market-data-provider.ts:84`).
- ✓ `getStockQuotes(tickers: string[]): Promise<Map<string, StockQuote>>`
  (`:85`).
- ✓ `getOptionSnapshot(contractId)` (singular) (`:86`),
  `getOptionChainSnapshot(filter)` single-filter signature (`:87`),
  `supportsStreaming(feed)` (`:88`), `connect(feeds?)` (`:89`),
  `disconnect()` (`:90`), `stream(feed, symbols): Observable<StreamEvent<…>>`
  (`:91`).
- ✓ `StockQuote` carries `prevClose` and `changePercent` alongside `price`,
  `bid`, `ask`, `change`, `volume`, `timestamp` (`:25-34`).
- ✓ `OptionSnapshot` has optional `greeks?` (delta/gamma/theta/vega) and a
  **top-level** `impliedVolatility?` (`:36-51`).
- ✓ `OptionChainFilter` has `underlying` + optional `expirationFrom/To`,
  `type` (`'put' | 'call'`), `strikeFrom/To`, `limit`, `cursor` (`:53-62`).
- ✓ Feed union `MarketDataFeed = 'stockQuotes' | 'optionQuotes' | 'optionTrades'`
  (`:66`).
- ✓ `MarketDataErrorCode` = `auth_failed | network_error | not_found | rate_limited | streaming_unsupported | unknown` (`:5-11`).

### Massive implementation (`massive-market-data.ts`)

- ✓ `BASE_URL = 'https://api.massive.com'` over built-in `fetch`; key set as
  `apiKey` query param via `authedUrl` (`:16,139-143,149`).
- ✓ Stock snapshot path `/v2/snapshot/locale/us/markets/stocks/tickers/{ticker}`
  (`:190`); single option `/v3/snapshot/options/{underlying}/{O:contract}`
  (`:215`); chain `/v3/snapshot/options/{underlying}` with
  `expiration_date.gte/lte`, `contract_type`, `strike_price.gte/lte`, `limit`,
  `cursor`, paginating on `next_url` when no `limit` (`:223-247`).
- ✓ `changePercent` is 4-dp from `todaysChangePerc` (`:200`); last-minute close
  (`min.c`) feeds `price`/`bid`/`ask` (`:195-198`).
- ✓ Single JSON WebSocket `wss://delayed.massive.com/stocks` (`:17`); auth
  `{action:'auth',params:apiKey}` (`:272`); on `auth_success` status →
  `{action:'subscribe',params:'AM.*'}` (`:285-286`); `ev:'AM'` frames become
  `StockQuote` ticks (`:294-295`).
- ✓ Error mapping: 401/403 → `auth_failed` (`:160-161`), 429 → `rate_limited`
  after `MAX_RETRIES` with `Retry-After` backoff (`:18,164-172`), 404 →
  `not_found` (`:174-175`), other non-ok → `unknown` (`:177-178`). No
  `stream_disconnected` / `subscription_failed` code (not in
  `MarketDataErrorCode`).

### Factory & credentials

- ✓ `marketDataFactory` exposes `configure()`/`create()`/`recreate()`/`disconnect()`;
  `recreate()` clears cache and returns void (`market-data-factory.ts:28-43`).
- ✓ Returns `FakeMarketDataProvider` when `FAKE_MARKET_DATA==='true'`, else
  `MassiveMarketDataProvider`; throws exact message "Market data provider not
  configured. Set MASSIVE_API_KEY or FAKE_MARKET_DATA=true." (`:14-23`).
- ✓ `loadMassiveApiKey` prefers `MAIN_VITE_MASSIVE_API_KEY`, falls back to
  `process.env.MASSIVE_API_KEY` (`massive-credentials.ts:4`).
- ✓ `FAKE_MARKET_DATA_ERROR` forces an error code (`fake-market-data.ts:34,38`).

### Broker split

- ✓ `AlpacaBrokerProvider implements BrokerProvider` (`alpaca-broker.ts:92`)
  with `getAccountInfo`/`getActivities`/`getMarketStatus` (`:153,169,196`);
  `BrokerProvider` declared in `broker-provider.ts:50-53`; selected by
  `broker-factory.ts`.
- ✓ IPC channels `broker:account`, `broker:activities`, `broker:market-status`
  (`ipc/broker.ts:9,16,24`). The former `broker:account-info` name is gone (no
  match anywhere in `src/`).
- ✓ `market-data:*` channels: `stock-quotes`, `set-stock-quote-tickers`,
  `stock-quote` (push), `stream-error` (push), `option-snapshots` (bulk),
  `option-snapshot`, `option-chain` (`ipc/market-data.ts:29,37,45,46,52,59,67`).
  No `market-data:market-status` channel exists.

### Removals / decommissioned symbols

- ✓ No real `AlpacaMarketDataProvider` or `createMarketDataProvider` symbol
  exists in `src/` (only stale `@deprecated` doc comments in `alpaca.ts:17,23`
  — see Drift). `MarketDataConfig` type is gone (`MassiveMarketDataConfig` is a
  distinct type).
- ✓ `@msgpack/msgpack` remains in `package.json:34` but has zero usages in
  `src/` (confirms "remains a dependency but is now unused").
- ✓ `buildOccSymbol` lives in `src/shared/option-symbol.ts:31`.

### Linked pages / ADRs (all exist)

- ✓ ADRs: market-data-provider-interface, market-data-provider-lifecycle,
  shared-massive-app-configuration, ws-package-streaming,
  msgpack-option-streaming, marketdataerror-structured-codes,
  occ-symbol-pure-leaf.
- ✓ Feature pages: us-31, us-32, us-39. Domain/contracts:
  `domain/market-data.md`, `contracts/alpaca-integration.md`,
  `contracts/ipc-handlers.md`.

## Drift (2)

- ✗ **`MarketDataError` / `MarketDataErrorCode` / `MarketDataFeed` file
  attribution is wrong.** The page says (line 96-97) "Failures throw
  `MarketDataError` (`integration-errors.ts`)" and (line 150) lists
  `MarketDataError` / `MarketDataErrorCode` under the contracts grouping. In
  fact all three types are defined and exported from
  `src/main/integrations/market-data-provider.ts` (`:5-21,66`).
  `integration-errors.ts` exports only `isNetworkError`
  (`integration-errors.ts:1`); it has no `MarketDataError` definition. Suggested
  fix: change the `integration-errors.ts` attribution to
  `market-data-provider.ts`. (The page still correctly lists
  `integration-errors.ts` as a touched source file — it is the home of
  `isNetworkError`, used by the Massive provider — so the file entry itself is
  fine; only the error-type home is misattributed.)

- ✗ **Stale `createMarketDataProvider` references in `alpaca.ts` not noted.**
  The page states `createMarketDataProvider` was removed, and no live symbol by
  that name exists. However `src/main/integrations/alpaca.ts:17,23` still carry
  `@deprecated Use createMarketDataProvider() from market-data-factory.ts`
  doc-comments — and the factory's actual export is `marketDataFactory.create()`,
  not `createMarketDataProvider()`. This is code-side stale documentation, not a
  spec error per se, but it contradicts the page's "removed" claim. Suggested
  fix: flag the `alpaca.ts` doc-comments for cleanup (point them at
  `marketDataFactory.create()`); no spec page change strictly required.

## Unverifiable (0)

## Missing files (0)

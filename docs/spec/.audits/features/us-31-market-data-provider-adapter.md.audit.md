---
page: docs/spec/features/us-31-market-data-provider-adapter.md
audited_at: 2026-06-27
findings: 11
---

# Audit: docs/spec/features/us-31-market-data-provider-adapter.md

This page has drifted substantially. The Alpaca-based market-data adapter it
documents has been superseded by a **Massive**-based provider, the
`MarketDataProvider` interface has been reshaped, and the factory was renamed.

## Verified (6)

- ✓ `MarketDataProvider` interface and `MarketDataError` class live in
  `src/main/integrations/market-data-provider.ts:13` (`MarketDataError`),
  `:84` (`MarketDataProvider` type).
- ✓ `OptionSnapshot` type carries `bid`, `ask`, `mid`, `lastTrade`,
  `openInterest`, `greeks.delta` — `market-data-provider.ts:36-44`.
- ✓ `StreamEvent<T>` (`:68`) and `StreamError` (`:75`) types exist.
- ✓ `supportsStreaming(feed)`, `connect()`, `disconnect()`,
  `stream(feed, symbols): Observable<…>` are on the interface
  (`market-data-provider.ts:88-95`).
- ✓ New deps present in `package.json`: `@msgpack/msgpack` (`:34`),
  `rxjs` (`:50`), `ws` (`:54`), `@types/ws` (`:75`).
- ✓ `src/main/integrations/alpaca.ts` is `@deprecated` (`alpaca.ts:17,23`).

## Drift (5)

- ✗ Page repeatedly documents an `AlpacaMarketDataProvider` implementation in
  `src/main/integrations/alpaca-market-data.ts`. No such class or file exists.
  The implementers of `MarketDataProvider` are now
  `MassiveMarketDataProvider` (`src/main/integrations/massive-market-data.ts:104`)
  and `FakeMarketDataProvider` (`fake-market-data.ts:36`). The only `Alpaca*`
  class is `AlpacaBrokerProvider` (`alpaca-broker.ts:92`), which implements a
  separate `BrokerProvider` interface. **The entire "REST stays on the Alpaca
  SDK / streaming bypasses it" architecture narrative, AC-11..AC-13, and the
  WebSocket subscribe/unsubscribe protocol section are now describing a
  provider that was replaced by Massive.**

- ✗ Page documents the factory `createMarketDataProvider(config)` switching on
  `config.provider: 'alpaca'`. The actual export is `marketDataFactory`
  (an object, `market-data-factory.ts:28`); the create function switches on
  `MASSIVE_API_KEY` / `FAKE_MARKET_DATA` env, not a `provider` config field.
  `MarketDataConfig` type and a `'alpaca'` case do not exist. The only
  remaining mention of `createMarketDataProvider` is the stale `@deprecated`
  JSDoc on `alpaca.ts`.

- ✗ Page lists interface methods `getOptionSnapshots`, `getActivities`,
  `getAccountInfo`, `getMarketStatus` (AC-2..AC-5, Contracts section). None of
  these are on the current `MarketDataProvider` interface. The interface has
  `getOptionSnapshot(contractId)` and `getOptionChainSnapshot(filter)`
  (singular) instead (`market-data-provider.ts:86-87`). Account info, market
  status, and activities now live on the broker provider / broker IPC
  (`broker:account`, `broker:market-status`, `broker:activities`), not the
  market-data provider.

- ✗ Page claims test files `alpaca-market-data.test.ts` and
  `alpaca-market-data.e2e.test.ts` with "one e2e test per AC" exist. Neither
  exists. Closest is `alpaca-broker.test.ts` (no e2e variant). The 16 ACs are
  not covered by an `alpaca-market-data.e2e.test.ts`.

- ✗ Page's `MarketDataConfig` lists `dataFeed?: 'sip' | 'iex' | 'delayed_sip'`
  / `optionFeed?: 'opra' | 'indicative'` and Alpaca stream URLs
  (`wss://stream.data.alpaca.markets/...`). With the Massive switch these
  Alpaca-specific config fields and URLs no longer describe the shipped code.

## Unverifiable (0)

## Missing files (0 of the linked spec pages)

- ✓ All `./` feature links (`us-32`, `us-33`, `us-34`) resolve.

Suggested fix: regenerate this page from the current Massive-based
provider. Most of the page (factory, interface methods, Alpaca SDK
rationale, ACs, WebSocket protocol, source-file list, deps narrative around
Alpaca) needs to be rewritten against `massive-market-data.ts` /
`marketDataFactory`.

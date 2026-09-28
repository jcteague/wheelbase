---
page: docs/spec/features/us-31-market-data-provider-adapter.md
audited_at: 2026-09-28
findings: 13
---

# Audit: docs/spec/features/us-31-market-data-provider-adapter.md

## Verified (18)

- ✓ `MarketDataProvider` declared as a `type` — `src/main/integrations/market-data-provider.ts:131`
- ✓ `MarketDataErrorCode` six-member union + `MarketDataError` with `readonly code` — `market-data-provider.ts:6-22`
- ✓ `StockQuote` shape `{price,bid,ask,change,changePercent,prevClose,volume,timestamp}` — `market-data-provider.ts:26-35`
- ✓ `OptionSnapshot` shape incl. nullable `openInterest`/`volume`, optional `greeks`/`impliedVolatility` — `market-data-provider.ts:37-52`
- ✓ `OptionChainFilter` fields — `market-data-provider.ts:64-73`
- ✓ `MarketDataFeed`, `StreamEvent<T>`, `StreamError` — `market-data-provider.ts:110-126`
- ✓ `getStockQuotes`, `getOptionSnapshot` (singular), `supportsStreaming`, `connect`, `disconnect`, `stream(...): Observable<StreamEvent<StockQuote | OptionSnapshot>>` — `market-data-provider.ts:132-152`
- ✓ `marketDataFactory` is an object with `configure`, `create` (cached), `recreate(): void`, `disconnect()` — `src/main/integrations/market-data-factory.ts:26-42`
- ✓ `FakeMarketDataProvider` returned when `FAKE_MARKET_DATA === 'true'` — `market-data-factory.ts:18-20`; class at `fake-market-data.ts:225`
- ✓ Single `Subject<StreamEvent<StockQuote>>` bridged via `tickSubject.pipe(filter(...))`, empty symbol set matches all — `src/main/integrations/alpaca-market-data.ts:69,520`
- ✓ `supportsStreaming` true for `stockQuotes` only — `alpaca-market-data.ts:369-371`
- ✓ HTTP 401/403 → `auth_failed` (`alpaca-market-data.ts:107-108`); 429 retried up to `MAX_RETRIES = 2` honouring `Retry-After`, then `rate_limited` (`:55,111-119`); 404 → `not_found` (`:127`); network failure → `network_error` via `isNetworkError` (`:98-101`); else `unknown` (`:104`)
- ✓ `disconnect()` closes the socket and nulls the reference — `alpaca-market-data.ts:504-507`
- ✓ `mid` computed via decimal.js with `ROUND_HALF_UP` — `src/main/integrations/alpaca-market-data-mappers.ts:138`
- ✓ `isNetworkError` shared helper — `src/main/integrations/integration-errors.ts:1`
- ✓ `BrokerProvider` carries `getAccountInfo` / `getActivities` — `src/main/integrations/broker-provider.ts:46-48`; `AlpacaBrokerProvider` — `alpaca-broker.ts:65`; `broker:account` / `broker:activities` IPC — `src/main/ipc/broker.ts:9,16`
- ✓ Test files exist: `market-data-provider.test.ts`, `market-data-factory.test.ts`, `fake-market-data.test.ts`
- ✓ Deps `ws`, `@types/ws`, `rxjs`, `@msgpack/msgpack` in `package.json:34,51,55,76`; linked US-32/33/34 pages exist

## Drift (8)

- ✗ Page states (Summary provider note, What was built, Architecture decisions, AC preamble) that the concrete implementer is `MassiveMarketDataProvider` in `massive-market-data.ts` and that "the sections below reflect the current Massive-based state". Massive was retired (US-99): the factory builds `AlpacaMarketDataProvider` (`src/main/integrations/market-data-factory.ts:2,21`; class at `alpaca-market-data.ts:63`). No `massive` reference remains in `src/main`. The Revisions section is correctly framed as history but needs a US-99 entry.
- ✗ "`AlpacaBrokerProvider`, the only surviving `Alpaca*` class" — `AlpacaMarketDataProvider` also exists (`alpaca-market-data.ts:63`).
- ✗ "Account info, broker activities, and market status are **not** on the market-data type" — market status IS on it now: `getMarketStatus` (`market-data-provider.ts:136`), plus `getMarketCalendar` (`:139`), `getOptionDailyBars` (`:142`), `getStockDailyBars` (`:144`); none appear in the page's `MarketDataProvider` contract.
- ✗ `getOptionChainSnapshot(filter): Promise<OptionSnapshot[]>` — actual return type is `Promise<OptionChainQuote[]>` (`market-data-provider.ts:135`; `OptionChainQuote` at `:57-62`).
- ✗ Factory contract: page claims `configure({ loadMassiveApiKey })`, default loader `process.env.MASSIVE_API_KEY`, and a throw "Market data provider not configured. Set MASSIVE_API_KEY…". Actual: `configure({ loadActiveAlpacaCredentials })` defaulting to `loadAlpacaCredentialsFromEnv` (`market-data-factory.ts:7-13`), and construction never throws — credentials resolve per request (`:15-16`).
- ✗ AC-11 / missing key: actual error is `MarketDataError('auth_failed', 'Alpaca credentials not configured')` at request time (`alpaca-market-data.ts:78`), not a Massive API-key check.
- ✗ Transport/protocol: page describes `https://api.massive.com` with `apiKey` query param, `wss://delayed.massive.com/stocks`, `{action:'auth', params: apiKey}` then `subscribe AM.*`, and `next_url` cursor pagination (AC-3). Actual: `STREAM_URL = 'wss://stream.data.alpaca.markets/v2/iex'` (`alpaca-market-data.ts:56`), auth frame `{action:'auth', key, secret}` after `success/connected` (`:406-416`), pagination via `next_page_token` (`:326-337`).
- ✗ "Option contract ids get an `O:` prefix at the API boundary" — no `O:` prefixing in `alpaca-market-data.ts` / `alpaca-market-data-mappers.ts`.

## Unverifiable (2)

- ? `[[wiki-link]]` references (`[[massive-market-data-provider]]`, `[[ws-package-streaming]]`, `[[rxjs-observables-for-streaming]]`, etc.) — extract IDs, not file links; not checked.
- ? "No reconnection logic in the provider" — `alpaca-market-data.ts:495-496` replaces a failed Subject; whether that counts as reconnection is a judgement call. Flag for review.

## Missing files (4)

- ✗ `src/main/integrations/massive-market-data.ts` — does not exist
- ✗ `src/main/integrations/massive-market-data.test.ts` — does not exist (AC coverage file cited in the AC preamble)
- ✗ `src/main/integrations/massive-credentials.ts` — does not exist (current loader: `alpaca-credentials.ts`)
- ✗ `src/main/integrations/alpaca.ts` ("kept but marked `@deprecated`") — does not exist

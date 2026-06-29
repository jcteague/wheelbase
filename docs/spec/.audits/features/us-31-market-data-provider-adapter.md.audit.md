---
page: docs/spec/features/us-31-market-data-provider-adapter.md
audited_at: 2026-06-29
findings: 0
---

# Audit: docs/spec/features/us-31-market-data-provider-adapter.md

The page has been regenerated since the prior (2026-06-27) audit: it now
documents the **Massive**-based provider (`MassiveMarketDataProvider`),
`getOptionSnapshot`/`getOptionChainSnapshot`, the `marketDataFactory` object,
and the separate `BrokerProvider`. Re-verified every code claim against `src/`
— all now match.

## Verified (28)

### Source files

- ✓ `src/main/integrations/market-data-provider.ts` exists.
- ✓ `src/main/integrations/market-data-provider.test.ts` exists.
- ✓ `src/main/integrations/market-data-factory.ts` exists.
- ✓ `src/main/integrations/market-data-factory.test.ts` exists.
- ✓ `src/main/integrations/massive-credentials.ts` exists.
- ✓ `src/main/integrations/massive-market-data.ts` exists.
- ✓ `src/main/integrations/massive-market-data.test.ts` exists.
- ✓ `src/main/integrations/fake-market-data.ts` exists.
- ✓ `src/main/integrations/fake-market-data.test.ts` exists.
- ✓ `src/main/integrations/integration-errors.ts` exists with `isNetworkError` (`integration-errors.ts:1`).
- ✓ `src/main/integrations/alpaca.ts` exists and is `@deprecated` (`alpaca.ts:17,23`).

### Types & contracts (all in `market-data-provider.ts`)

- ✓ `MarketDataProvider` is a `type` (not interface), with `getStockQuotes`, `getOptionSnapshot` (singular), `getOptionChainSnapshot`, `supportsStreaming(feed)`, `connect(feeds?)`, `disconnect()`, `stream(feed, symbols): Observable<StreamEvent<StockQuote | OptionSnapshot>>` (`market-data-provider.ts:84-95`). Account/market-status/activities are not present.
- ✓ `StockQuote` shape matches: `price/bid/ask/change/changePercent/prevClose: string`, `volume: number`, `timestamp: string` (`market-data-provider.ts:25-34`).
- ✓ `OptionSnapshot` shape matches: `bid/ask/mid/lastTrade: string`, `openInterest/volume: number | null`, optional `greeks.{delta,gamma,theta,vega}`, optional `impliedVolatility`, `timestamp` (`market-data-provider.ts:36-51`).
- ✓ `OptionChainFilter` shape matches exactly (`market-data-provider.ts:53-62`).
- ✓ `MarketDataFeed = 'stockQuotes' | 'optionQuotes' | 'optionTrades'`; `StreamEvent<T>` and `StreamError` shapes match (`market-data-provider.ts:66-80`).
- ✓ `MarketDataError` is an `Error` subclass with `readonly code: MarketDataErrorCode`; the six-member union matches (`auth_failed | network_error | not_found | rate_limited | streaming_unsupported | unknown`) (`market-data-provider.ts:5-21`).
- ✓ `marketDataFactory` is an object with `configure(next)`, `create()`, `recreate(): void`, `disconnect()`; throws the documented `"Market data provider not configured. Set MASSIVE_API_KEY or FAKE_MARKET_DATA=true."`; gated on `FAKE_MARKET_DATA === 'true'`; default loader reads `process.env.MASSIVE_API_KEY` (`market-data-factory.ts:9-43`).
- ✓ `loadMassiveApiKey` prefers `MAIN_VITE_MASSIVE_API_KEY` then falls back to `process.env.MASSIVE_API_KEY` (`massive-credentials.ts:1-5`).

### Massive implementation

- ✓ `MassiveMarketDataProvider implements MarketDataProvider` (`massive-market-data.ts:104`).
- ✓ REST base `https://api.massive.com`, WS `wss://delayed.massive.com/stocks`, `MAX_RETRIES = 2` (`massive-market-data.ts:16-18`).
- ✓ `apiKey` appended as query param via `authedUrl` (`massive-market-data.ts:139-143,149`); uses global `fetch`.
- ✓ `mid` computed via decimal.js `(bid+ask)/2` with `ROUND_HALF_UP` (`massive-market-data.ts:73-75`); `toFixed(2)` for money, `toFixed(4)` for greeks/IV and `changePercent` (`massive-market-data.ts:92-99,199-201`).
- ✓ Error mapping: `401/403 → auth_failed`, `429 → rate_limited` after retry honouring `Retry-After`, `404 → not_found`, network → `network_error`, else `unknown` (`massive-market-data.ts:151-179`).
- ✓ `O:` option prefix applied at boundary; underlying derived by parsing leading letters (`massive-market-data.ts:62-71,213-215`).
- ✓ `getOptionChainSnapshot` follows `next_url` cursor pagination, stopping early when `filter.limit` is set (`massive-market-data.ts:238-249`).
- ✓ `supportsStreaming()` returns `true` (`massive-market-data.ts:252-254`).
- ✓ Single `Subject<StreamEvent<StockQuote>>`; `stream()` returns `tickSubject.pipe(filter(...))` with empty-set-matches-all (`massive-market-data.ts:107,256-263`).
- ✓ WS protocol: open → `{action:'auth', params: apiKey}` → `auth_success` → `{action:'subscribe', params:'AM.*'}` → `success` resolves; `auth_failed` rejects; JSON frames; `AM` bars emitted; no option socket / no per-symbol unsubscribe (`massive-market-data.ts:271-298`).
- ✓ `disconnect()` closes socket and nulls reference (`massive-market-data.ts:311-314`); AC-11 missing-key guard `requireApiKey()` throws `auth_failed` before any fetch (`massive-market-data.ts:133-137`, invoked at the top of each REST method and `connect`).
- ✓ Dependencies present in `package.json`: `ws ^8.20.0`, `@types/ws ^8.18.1`, `rxjs ^7.8.2`, `@msgpack/msgpack ^3.1.3`.
- ✓ `BrokerProvider` separation holds: `broker:account`, `broker:activities`, `broker:market-status` IPC handlers exist (`src/main/ipc/broker.ts:9,16,24`); `AlpacaBrokerProvider` is the only surviving `Alpaca*` class (`src/main/integrations/alpaca-broker.ts:92`; grep finds no other `class Alpaca`; `alpaca.ts` exposes only functions).

## Drift (0)

None. The page now accurately reflects the Massive-based market-data layer.

## Unverifiable (0)

None. AC test-coverage assertions point at real test files that all exist; individual assertion bodies were not executed, but the files back the claims.

## Missing files (0)

Linked features `us-32`, `us-33`, `us-34` are cross-references, not asserted to exist by this story; not flagged.

---
page: docs/spec/domain/market-data.md
audited_at: 2026-06-29
findings: 3
---

# Audit: docs/spec/domain/market-data.md

## Verified (27)

- ✓ `MarketDataProvider` declared as a TypeScript `type` (not `interface`) — `src/main/integrations/market-data-provider.ts:84`.
- ✓ Provider method shapes match exactly: `getStockQuotes(tickers): Promise<Map<string, StockQuote>>`, `getOptionSnapshot(contractId): Promise<OptionSnapshot>`, `getOptionChainSnapshot(filter): Promise<OptionSnapshot[]>`, `supportsStreaming(feed)`, `connect(feeds?)`, `disconnect()`, `stream(feed, symbols): Observable<StreamEvent<...>>` — `market-data-provider.ts:85-94`.
- ✓ `getStockQuotes` returns a `Map<string, StockQuote>`; the chain takes a single `OptionChainFilter` argument — `market-data-provider.ts:85,87`.
- ✓ `MarketDataErrorCode` is exactly the documented six members: `auth_failed`, `network_error`, `not_found`, `rate_limited`, `streaming_unsupported`, `unknown` — `market-data-provider.ts:5-11`.
- ✓ `MarketDataError` class with `readonly code: MarketDataErrorCode` lives in `market-data-provider.ts:13-21` (type-only module, no vendor client).
- ✓ `OptionSnapshot.impliedVolatility?` is a **top-level** optional field, NOT nested under `greeks`; `greeks?` holds `delta/gamma/theta/vega` — `market-data-provider.ts:36-51`.
- ✓ `OptionSnapshot` has `openInterest: number | null` and `volume: number | null` — `market-data-provider.ts:41-42`.
- ✓ `OptionChainFilter` carries `underlying` plus optional `expirationFrom/To`, `type: 'put' | 'call'`, `strikeFrom/To`, `limit`, `cursor` — `market-data-provider.ts:53-62`.
- ✓ `MarketDataFeed = 'stockQuotes' | 'optionQuotes' | 'optionTrades'` — `market-data-provider.ts:66`.
- ✓ `StreamEvent<T>` ({feed, symbol, data, timestamp}) and `StreamError` ({feed, code, message, reconnectable}) shapes match — `market-data-provider.ts:68-80`.
- ✓ `MassiveMarketDataProvider` is the concrete adapter in `src/main/integrations/massive-market-data.ts:104`, `implements MarketDataProvider`.
- ✓ Adapter takes `MassiveMarketDataConfig = { apiKey: string }` — `massive-market-data.ts:20`.
- ✓ REST base `https://api.massive.com`, WS `wss://delayed.massive.com/stocks`, key sent as `apiKey` query param (no Bearer) — `massive-market-data.ts:16,17,141`.
- ✓ WS auth frame `{action:'auth', params:<apiKey>}` — `massive-market-data.ts:272`.
- ✓ `marketDataFactory` object with `.configure()`, `.create()`, `.recreate()`, `.disconnect()` — `market-data-factory.ts:28-42`.
- ✓ `MarketDataFactoryConfig = { loadMassiveApiKey: () => string }` — `market-data-factory.ts:5-6`.
- ✓ `FAKE_MARKET_DATA=true` returns `FakeMarketDataProvider`; no key + unset throws — `market-data-factory.ts:14-22`.
- ✓ `src/main/index.ts` calls `marketDataFactory.create()` (`index.ts:152`); `before-quit` tears down via `marketDataFactory.disconnect()` (`index.ts:259-263`).
- ✓ IPC market-data channels exist: `market-data:stock-quotes`, `:set-stock-quote-tickers`, `:stock-quote`, `:stream-error`, `:option-snapshots`, `:option-snapshot`, `:option-chain` — `src/main/ipc/market-data.ts:29-91`.
- ✓ `broker:*` channels exist and clock/account/activities live there: `broker:account`, `broker:activities`, `broker:market-status` — `src/main/ipc/broker.ts:9,16,24`. No `market-data:market-status` channel found.
- ✓ `buildOccSymbol` defined in `src/shared/option-symbol.ts:31`; re-exported by `src/main/core/option-symbol.ts:1`.
- ✓ `deriveMarketStatusDisplay` in `src/renderer/src/lib/market-status.ts:18`; precedence stale→DELAYED, regular→LIVE, pre/post→EXT, else CLOSED (`:22-26`).
- ✓ `STALE_THRESHOLD_MS = 5 * 60 * 1000` in `useStockQuotes.ts:17`; sibling `SNAPSHOT_STALE_THRESHOLD_MS` in `PositionDetailPage.tsx:25`.
- ✓ `useStockQuotes`: `staleTime: Infinity`, `refetchOnWindowFocus: true`, `setStockQuoteTickers`, `onStockQuote`/`onStreamError` subscriptions — `useStockQuotes.ts:42-89`.
- ✓ `useOptionSnapshots`: `refetchInterval: session==='closed' ? false : 60_000`, `staleTime: 30_000` — `useOptionSnapshots.ts:64-65`.
- ✓ `computeUnrealizedPnl` returns `pnl`/`maxProfit`/`pnlPercent` decimal strings in `src/main/core/costbasis.ts:281-301`.
- ✓ `isWideSpread` with `WIDE_SPREAD_THRESHOLD = 0.1` in `src/renderer/src/lib/option-display.ts:5,18`; `DEFAULT_PROFIT_TARGET_PERCENT = 50` + `resolveProfitTarget(null)→50` in `src/main/core/profit-target.ts:4-7`; `profit_target_percent` column added in `migrations/005_add_profit_target_percent.sql`.
- ✓ `computeVerdict` six-label first-match chain (ACT NOW / TARGET HIT / CONSIDER ROLL / WATCH / WATCH / HOLD) + `SHARES_VERDICT` "NO ACTIVE LEG" — `src/renderer/src/lib/verdict.ts:138-216`. Thresholds: actNowDte 3, targetCapturePct 50, managementWindowDte 21, tightDte 7 (`:40-56`).

## Drift (2)

- ✗ Page (Provider lifecycle, lines 404-406) claims the connect-once guard is "A module-scoped `let connected = false` inside `registerMarketDataHandlers`". Actual implementation uses a `StreamState` object field `state.connected` (created by `newStreamState()` in `registerMarketDataHandlers`, mutated inside the `subscribeToStockQuotes` **service**) — `src/main/services/market-data.ts:20-26,97-100` and `src/main/ipc/market-data.ts:27`. The connect call is `provider.connect(['stockQuotes'])` in the service, not in the handler. Suggested fix: reword to "a `connected` flag on the handler's `StreamState`, flipped inside the `subscribeToStockQuotes` service".
- ✗ Page (Provider lifecycle, line 406) says "`app.on('before-quit', () => provider.disconnect())`". Actual code calls `marketDataFactory.disconnect()` (which delegates to the cached provider) alongside `scheduler.stop()`, and uses `e.preventDefault()` + `app.exit(0)` — `src/main/index.ts:259-263`. Suggested fix: reference `marketDataFactory.disconnect()`.

## Unverifiable (1)

- ? Page declares `StreamEvent`/`StreamError` using `interface` syntax (lines 311-324) while source declares them as `type` (`market-data-provider.ts:68,75`). Field-for-field identical, so this is illustrative-only and not a behavioral claim; flag for human review if exactness of the keyword matters.

## Missing files (0)

- All cited source paths exist (`market-data-provider.ts`, `massive-market-data.ts`, `market-data-factory.ts`, `ipc/market-data.ts`, `shared/option-symbol.ts`, `core/option-symbol.ts`, `lib/market-status.ts`, `lib/verdict.ts`, `hooks/useStockQuotes.ts`, `core/costbasis.ts`, `core/profit-target.ts`). Linked feature/contract pages not in scope of this audit.

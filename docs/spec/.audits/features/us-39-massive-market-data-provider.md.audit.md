---
page: docs/spec/features/us-39-massive-market-data-provider.md
audited_at: 2026-06-29
findings: 5
---

# Audit: docs/spec/features/us-39-massive-market-data-provider.md

## Verified (25)

- ✓ `MassiveMarketDataProvider` exists and `implements MarketDataProvider`, calls Massive REST via Node `fetch` — `src/main/integrations/massive-market-data.ts:104`, `:149`.
- ✓ REST base URL `https://api.massive.com` — `massive-market-data.ts:16` (`BASE_URL`).
- ✓ API key passed as `?apiKey=` query param (no Bearer header) — `authedUrl()` sets `searchParams.set('apiKey', ...)` `massive-market-data.ts:139-143`.
- ✓ Stock snapshot path `/v2/snapshot/locale/us/markets/stocks/tickers/{ticker}` — `massive-market-data.ts:190`.
- ✓ Option read paths `/v3/snapshot/options/{underlying}[/{O:contract}]` — `massive-market-data.ts:215, 232`; `O:` prefix applied at boundary `:69-71`.
- ✓ Chain filter params `expiration_date.gte/lte`, `contract_type`, `strike_price.gte/lte`, `limit`, `cursor` and `next_url` pagination — `massive-market-data.ts:223-247`.
- ✓ AC-1: aggregate bars used; `price`/`bid`/`ask` all set to last-minute close `min.c`; `StockQuote` carries `prevClose` and 4-dp `changePercent` (`todaysChangePerc`) — `massive-market-data.ts:195-204`, type at `market-data-provider.ts:25-34`.
- ✓ AC-2/AC-3/Optional Greeks: `greeks`/`impliedVolatility` only set when Massive response is non-null; no fabricated zeros — `massive-market-data.ts:90-100`; typed optional on `OptionSnapshot` `market-data-provider.ts:43-49`.
- ✓ AC-5: API key loaded once into `this.apiKey` constructor field, reused on every request — `massive-market-data.ts:105, 109-111`.
- ✓ AC-6: empty key surfaces `MarketDataError('auth_failed')` via `requireApiKey()` — `massive-market-data.ts:133-137`.
- ✓ AC-7: 429 retries with `Retry-After` header, capped at `MAX_RETRIES` (=2), then throws `rate_limited` — `massive-market-data.ts:18, 164-172`.
- ✓ AC-8: 401/403 → `auth_failed` — `massive-market-data.ts:160-162`.
- ✓ AC-9 / streaming: `supportsStreaming()` returns `true`; `connect()` opens WebSocket (auth + subscribe); `stream()` returns RxJS `Observable` filtered to symbols; `disconnect()` tears down — `massive-market-data.ts:252-314`.
- ✓ WebSocket URL `wss://delayed.massive.com/stocks`, JSON frames `{action:'auth',params:<apiKey>}` then on `auth_success` `{action:'subscribe',params:'AM.*'}`, `AM` frames mapped to `StockQuote` ticks — `massive-market-data.ts:17, 271-296`.
- ✓ `MarketDataErrorCode` union = `auth_failed | network_error | not_found | rate_limited | streaming_unsupported | unknown`; HTTP mapping 404→`not_found`, other non-ok→`unknown` — `market-data-provider.ts:5-11`, `massive-market-data.ts:174-178`.
- ✓ Alpaca-specific `options_no_subscription` code dropped — no occurrence anywhere in `src/`.
- ✓ e2e fake forces any code via `FAKE_MARKET_DATA_ERROR` — `fake-market-data.ts:37-39`.
- ✓ `marketDataFactory` with `configure()`/`create()`/`recreate()`/`disconnect()`; returns `FakeMarketDataProvider` when `FAKE_MARKET_DATA==='true'`, else `MassiveMarketDataProvider`; throws when neither set — `market-data-factory.ts:13-43`.
- ✓ `loadMassiveApiKey` prefers `MAIN_VITE_MASSIVE_API_KEY`, falls back to `process.env.MASSIVE_API_KEY` — `massive-credentials.ts:4`.
- ✓ `getMarketStatus()` not on `MassiveMarketDataProvider` (no such method); stays on `BrokerProvider` — `broker-provider.ts:53`.
- ✓ `AlpacaMarketDataProvider` / `alpaca-market-data.ts` removed; `broker:account-info` channel name gone (no `account-info` anywhere) — confirmed by file-existence + grep. Registered channel is `broker:account` (`ipc/broker.ts:9`).
- ✓ Split IPC namespaces: `broker.ts` registers `broker:account|activities|market-status`; `market-data.ts` registers `market-data:*` — `src/main/ipc/broker.ts:9-29`, `src/main/ipc/market-data.ts:29-73`.
- ✓ Bulk `market-data:option-snapshots` RETAINED alongside new singular `market-data:option-snapshot` and `market-data:option-chain`; `option-chain` returns `{ snapshots, nextCursor: null }` — `market-data.ts:52-72`. Preload exposes `getOptionSnapshots` — `preload/index.ts:32`.
- ✓ `BrokerProvider` is an `interface` in `broker-provider.ts` exposing `getAccountInfo`/`getActivities`/`getMarketStatus` — `broker-provider.ts:50-54`.
- ✓ `@msgpack/msgpack` still a declared dependency (`package.json:34`) but unused in `src/` (no import); two-socket/MessagePack path absent.
- ✓ `buildOccSymbol` / `BuildOccSymbolInput` in `src/shared/option-symbol.ts:31, 13`, re-exported by `src/main/core/option-symbol.ts:1`.

## Drift (5)

- ✗ Source-files list (line 167) claims `src/main/integrations/integration-errors.ts` defines "`MarketDataError` / `BrokerError` and their code unions." It does NOT: `integration-errors.ts` contains only `isNetworkError()` (`integration-errors.ts:1-9`). `MarketDataError`/`MarketDataErrorCode` are defined in `market-data-provider.ts:5-21`; `BrokerError`/`BrokerErrorCode` in `broker-provider.ts:1-19`. Suggested fix: correct the source-files bullet to point at those two files.

- ✗ `market-data:option-chain` request shape (lines 134-146) documents `strikeFrom?: number` / `strikeTo?: number`, but `GetOptionChainPayloadSchema` types both as `z.string().optional()` (`schemas.ts:387-388`), matching `OptionChainFilter.strikeFrom?: string` (`market-data-provider.ts:58-59`). Suggested fix: change the documented type to `string`.

- ✗ "Renderer API adapters ... updated to the new channel names" (line 43) and source-files line 175 imply `src/renderer/src/api/market-data.ts` wraps the new `market-data:option-snapshot`/`option-chain` channels. It does not — the adapter only exposes `getStockQuotes` (via `marketData.stockQuotes`) and the bulk `getOptionSnapshots` (via top-level `window.api.getOptionSnapshots`); the singular/chain channels are exposed in preload (`marketData.optionSnapshot`/`optionChain`, `preload/index.ts:52-53`) but have no renderer-adapter function (`src/renderer/src/api/market-data.ts:40-57`). Suggested fix: soften the claim or note the adapter wraps only stock-quotes + bulk snapshots.

- ✗ `OptionSnapshot` description (line 127 + Contracts intro) says it "carries ... open interest, volume." The Massive adapter hardcodes `openInterest: null` and `volume: null` for every snapshot — Massive's `SnapResult` type provides neither field (`massive-market-data.ts:86-87`, type `:39-44`). The fields exist on the type but are never populated by this provider. Suggested fix: note that OI/volume are always `null` from Massive.

- ✗ Streaming section (line 69) documents `connect(feeds?)` taking a feeds argument. The `MarketDataProvider` type declares `connect(feeds?: MarketDataFeed[])` (`market-data-provider.ts:89`), but `MassiveMarketDataProvider.connect()` takes no parameter and ignores feed selection (subscribes unconditionally to `AM.*`) — `massive-market-data.ts:265`. Minor: the implementation drops the optional arg. Suggested fix: note that Massive's `connect()` ignores `feeds`.

## Unverifiable (2)

- ? "Massive [is] a Polygon-compatible delayed-data vendor" (line 7) — narrative vendor description; code uses Polygon-shaped types (`massive-market-data.ts:22-49`) consistent with the claim but not mechanically provable.
- ? Revisions/history narrative ("the original US-39 ship only declared streaming and threw `streaming_unsupported`", "supersedes Alpaca-era portions") — describes prior plan states, not current code; not auditable against `src/`.

## Missing files (0)

- All cited source files exist; the removed `src/main/integrations/alpaca-market-data.ts` is confirmed gone. `src/main/integrations/alpaca-broker.ts` is the only surviving `Alpaca*Provider` class (`alpaca.ts` remains as the deprecated raw-SDK isolation module, not an `Alpaca*Provider`). Cross-page links (`us-31`/`us-32`/`us-33`/`us-34`/`us-37`, topic/contract pages) were not existence-checked — out of scope for code/contract verification.

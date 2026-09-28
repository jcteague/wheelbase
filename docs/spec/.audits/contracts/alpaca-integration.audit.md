---
page: docs/spec/contracts/alpaca-integration.md
audited_at: 2026-09-28
findings: 61
---

# Audit: docs/spec/contracts/alpaca-integration.md

## Verified (47)

- ✓ `BrokerError` carries `code`, `message`, optional `deeplink` — `src/main/integrations/broker-provider.ts:9-18`
- ✓ `BrokerErrorCode` = `auth_failed | network_error | rate_limited | environment_mismatch | unknown` — `broker-provider.ts:1-6`
- ✓ `AccountInfo` shape `{ buyingPower, portfolioValue, cash, environment, accountNumberMasked }` — `broker-provider.ts:21-27`
- ✓ Money fields normalised with `new Decimal(s).toFixed(4)` — `src/main/integrations/alpaca-broker.ts:56-58,131-133`
- ✓ `environment` taken from provider config — `alpaca-broker.ts:134`
- ✓ `requireCredentials()` is the first line of each public method, throws `BrokerError('auth_failed', 'Alpaca credentials not configured', 'settings/credentials/alpaca')` — `alpaca-broker.ts:84-92,127,143`
- ✓ Paper+`AK` / live+`P` environment-mismatch messages — `alpaca-broker.ts:98-109`
- ✓ `wrapError` parses 401-class JSON body codes as auth — `alpaca-broker.ts:43-52`
- ✓ `AlpacaBrokerProvider` constructor does no I/O; SDK client built lazily — `alpaca-broker.ts:69-82`
- ✓ `getActivities` maps to `activityId, activityType, symbol, qty, price, transactionTime`, sorted by `transactionTime` descending — `alpaca-broker.ts:142-167`; `ActivityFilter { type, since? }` — `broker-provider.ts:38-41`
- ✓ `brokerFactory` object with `configure` / `create` / `recreate`; `buildProvider()` throws `BrokerError('auth_failed', 'Alpaca credentials not configured')`; default loader `loadAlpacaCredentialsFromEnv` — `src/main/integrations/broker-factory.ts:12-45`
- ✓ `FakeBrokerProvider` with env-driven canned responses — `src/main/integrations/fake-broker.ts:27-57`
- ✓ Only `alpaca-broker.ts` imports `@alpacahq/typescript-sdk` (grep of `src/` non-test files); version `0.0.32-preview` — `package.json:60`
- ✓ `marketDataFactory` with `configure`/`create`/`recreate`/`disconnect`, fake under `FAKE_MARKET_DATA=true`, never throws — `src/main/integrations/market-data-factory.ts:15-41`
- ✓ Missing credentials ⇒ `MarketDataError('auth_failed', 'Alpaca credentials not configured')` — `src/main/integrations/alpaca-market-data.ts:78`
- ✓ `MarketDataError` six codes — `src/main/integrations/market-data-provider.ts:6-12`
- ✓ `APCA-API-KEY-ID` / `APCA-API-SECRET-KEY` headers; debug `alpaca_api_request` / `alpaca_api_response` — `alpaca-market-data.ts:88-94,133`
- ✓ REST error table: 401/403 → `auth_failed` `HTTP {status}`; 429 retried `MAX_RETRIES = 2` honouring `Retry-After` (default 1 s) then `rate_limited`/`rate limit exceeded`; 404 → `not_found` `HTTP 404: {url}`; other non-ok → `unknown`; fetch rejection → `network_error`/`unknown` — `alpaca-market-data.ts:55,97-130`
- ✓ `Option contract {contractId} not in snapshot` → `not_found` — `alpaca-market-data.ts:169`
- ✓ Data base URL `https://data.alpaca.markets`; feeds `iex` / `indicative` — `src/main/integrations/alpaca-market-data-mappers.ts:25-29`
- ✓ Stock daily bars `feed=sip&adjustment=raw`, `timeframe=1Day`, `limit=10000` — `alpaca-market-data-mappers.ts:311,338-362`
- ✓ Option bars chunked 100 per request, sequential batches — `alpaca-market-data-mappers.ts:315`; `alpaca-market-data.ts:257-260`
- ✓ Chain page size 1000 (`min(limit,1000)`), contracts `limit=10000` — `alpaca-market-data-mappers.ts:30-31,210,228`
- ✓ Shared `fetchPages` helper with `followPages` option (chain single page when `limit` given) — `alpaca-market-data.ts:185-188,327-337`
- ✓ `mapDailyBar` uses `etDateOf` — `alpaca-market-data-mappers.ts:367-370`
- ✓ Open-interest failure ⇒ `openInterest: null` + warn (`alpaca_open_interest_unavailable`) — `alpaca-market-data.ts:344-363`
- ✓ Websocket URL `wss://stream.data.alpaca.markets/v2/iex`, 10 s auth timeout — `alpaca-market-data.ts:56-57`
- ✓ Diff-only `unsubscribe` then `subscribe` of `bars` — `alpaca-market-data.ts:524-543`
- ✓ Connect errors 402 → `auth_failed`, 409 → `streaming_unsupported`, other → `unknown` — `alpaca-market-data-mappers.ts:439-445`
- ✓ After-connect stream codes 405 → `symbol_limit`, 406 → `connection_limit`, else `unknown` — `alpaca-market-data-mappers.ts:433-437`
- ✓ `disconnect()` nulls `ws` and clears `subscribed` — `alpaca-market-data.ts:382-383`
- ✓ No auto-reconnect; next ticker change reconnects — `src/main/services/market-data.ts:106-124`
- ✓ `restartStockQuoteStream` returned by `registerMarketDataHandlers` — `src/main/ipc/market-data.ts:115`; implemented in `src/main/services/market-data.ts:136-150`
- ✓ `ALPACA_TRADING_BASE_URLS` paper/live host map — `src/main/integrations/alpaca-hosts.ts:4-7`
- ✓ `loadAlpacaCredentialsFromEnv` reads `ALPACA_KEY_ID`/`ALPACA_SECRET_KEY`/`ALPACA_PAPER` from `process.env` only; empty ⇒ null — `src/main/integrations/alpaca-credentials.ts:22-34`
- ✓ `onBrokerProviderChanged` runs `brokerFactory.recreate()`, nudges detect-assignments, restarts the stock stream — `src/main/index.ts:175-189`
- ✓ `before-quit` awaits `Promise.all([scheduler.stop(), marketDataFactory.disconnect()])` — `src/main/index.ts:340`
- ✓ Detect-assignments job cadence `{ kind: 'interval', marketOpenMs: 60_000, extendedHoursMs: 300_000, marketClosedMs: null }`, lazy `brokerFactory.create()`, no-op when `activeBrokerEnv === 'none'` — `src/main/index.ts:240-259`
- ✓ `pollStartedAt` stamped before `getActivities`, watermark key `assignments_last_poll_at:${env}`, `INSERT OR IGNORE`, watermark persisted after batch — `src/main/services/detect-assignments.ts:87,95,99,117,153`
- ✓ `auth_failed` → typed `{ detected: 0, skipped: 0, brokerError }`; other `BrokerError` codes warn and bail without advancing the watermark — `detect-assignments.ts:100-106`
- ✓ `UNIQUE(activity_id, position_id)` on `pending_assignments` — `migrations/008_create_pending_assignments.sql:19`
- ✓ `active_broker_environment` key; `safeStorage.encryptString` persistence; `loadActiveAlpacaCredentials` — `src/main/services/settings.ts:89,181-182,281`
- ✓ `marketData: activeBrokerEnv !== 'none' || hasFallbackCredentials()` — `settings.ts:168`; wired to env loader — `src/main/index.ts:145`
- ✓ Probes `settings:test-connection` / `settings:test-stored-alpaca-connection` — `src/main/ipc/settings.ts:103,114`; `GET {ALPACA_TRADING_BASE_URLS[env]}/v2/account`, `vendor: 'alpaca'`, `AK`/`PK` prefix mismatch — `src/main/services/settings-connections.ts:16,85-97,117-125`
- ✓ `broker:account` / `broker:activities` registered; no `broker:market-status`; `market-data:market-status` registered — `src/main/ipc/broker.ts:9,16`; `src/main/ipc/market-data.ts:88`
- ✓ `useMarketStatus` 60 s refetch — `src/renderer/src/hooks/useMarketStatus.ts:6`; `LiveBrokerConfirmDialog` copy mentions market data reconnecting — `src/renderer/src/components/LiveBrokerConfirmDialog.tsx:58`; shared auth prompt copy — `src/renderer/src/pages/PositionsListPage.tsx:199`
- ✓ `CHAIN_FETCH_CONCURRENCY = 4` — `src/main/services/candidate-chains.ts:37`; `classifyChainFailure` — `src/main/core/candidate-chain.ts:92`; `WHEELBASE_FAKE_IV_SERIES` — `src/main/integrations/fake-market-data.ts:222`; `WHEELBASE_FAKE_NOW` — `src/main/integrations/fake-clock.ts:20`

## Drift (8)

- ✗ **`BrokerProvider` method list (lines 29-34, and Overview line 7).** Page lists `getMarketStatus()` and `getMarketCalendar(range)` on `BrokerProvider` and calls Alpaca-as-broker the source of "the market clock". Code: `BrokerProvider` is exactly `getAccountInfo` + `getActivities` (`src/main/integrations/broker-provider.ts:46-49`); clock and calendar are on `MarketDataProvider` (`market-data-provider.ts:134-137`). The page's own Source files entry (line 322) already says this. Suggested fix: drop the two methods from the interface list and from the Overview's broker role.
- ✗ **SDK usage table (lines 62-67).** Claims `client.getClock` implements `getMarketStatus()` and `client.getCalendar` implements `getMarketCalendar(range)`. `alpaca-broker.ts` calls only `getAccount` and `getActivity` (`alpaca-broker.ts:129,150`). The clock and calendar are fetched with raw `fetch` from the trading host (`alpaca-market-data-mappers.ts:281,289`; `alpaca-market-data.ts:223-248`). Suggested fix: remove the two rows.
- ✗ **`getMarketStatus()` section (lines 96-102).** Documented as a broker REST method with "SDK method: `client.getClock`" and a "Why broker, not market-data?" rationale stating it "has stayed on `BrokerProvider`". Code serves it from `AlpacaMarketDataProvider.getMarketStatus` (`alpaca-market-data.ts:223-233`). Suggested fix: move the section under the market-data adapter and drop the broker rationale.
- ✗ **`getMarketCalendar(range)` section (lines 104-113).** Documented as a broker method using `client.getCalendar`, wrapped as `BrokerError`, faked by `FakeBrokerProvider.getMarketCalendar` / `FAKE_BROKER_CALENDAR`. Code: it is `AlpacaMarketDataProvider.getMarketCalendar` (`alpaca-market-data.ts:235-248`). `refreshTradingCalendar` takes a `MarketCalendarSource` and catches `MarketDataError` (`src/main/services/trading-calendar-store.ts:21,192-233`). The fake is `FakeMarketDataProvider.getMarketCalendar` with `FAKE_MARKET_CALENDAR` / `FAKE_MARKET_CALENDAR_ERROR` (`fake-market-data.ts:221,277-293`). `FAKE_BROKER_CALENDAR` does not appear anywhere in `src/`.
- ✗ **Scheduler `fallbackBroker` (lines 113, 328).** Page says `scheduler-instance.ts` has a `fallbackBroker` returning `[]` and "consumes `BrokerProvider.getMarketStatus()` per tick". Code: `scheduler-instance.ts` builds a `MarketStatusSource` over `marketDataFactory.create().getMarketStatus()` and degrades `auth_failed` to `unconfiguredProviderStatus` (`src/main/services/scheduler-instance.ts:13-37`). There is no `fallbackBroker`.
- ✗ **Broker 429 → `rate_limited` (lines 81, 291).** Broker `wrapError` has no 429 branch. It maps only auth (401/403/body code), network, and `unknown` (`alpaca-broker.ts:94-124`), so a 429 surfaces as `unknown`. Suggested fix: correct the page, or add the branch if the behaviour is intended.
- ✗ **Market-cache invalidation (line 200).** Page says settings mutations invalidate only `queryKey[0] === 'broker'` and that market caches are refreshed by the stream restart instead. Code invalidates `'broker'` **or** `'market'` (`src/renderer/src/hooks/useSettings.ts:33-36`).
- ✗ **Websocket StreamError set (lines 247, 264).** Page lists stream error codes `symbol_limit | connection_limit | unknown` with `reconnectable: false`. The socket `close` handler also emits `StreamError { code: 'connection_lost', reconnectable: true }` (`alpaca-market-data.ts:443-463`).

## Unverifiable (5)

- ? The SDK is "a Deno-to-Node transpile, marked no-longer-maintained", and its market-data surface has specific bugs (wrong snapshots path, missing greeks type, no websocket). This is a vendor claim with no code evidence.
- ? Alpaca free-plan limits: 200 req/min, 30 streamed symbols, SIP daily bars allowed, `403 OPRA agreement is not signed` when `end` is today. These are vendor facts; the code only encodes the consequence (`src/main/services/iv-history.ts` `barRange`).
- ? Rate-budget arithmetic (25–35 requests per ticker per backfill, full-bench backfill brushing 200/min).
- ? "OPASN events typically post overnight after expiration" is a domain/vendor behaviour claim.
- ? `environment_mismatch` "surfaced via the settings page during credential entry, not during a normal poll". The poll path does treat it like any other non-auth code (`detect-assignments.ts:105-106`), but whether it actually occurs there is behavioural.

## Missing files (1)

- ✗ `src/main/integrations/alpaca.ts` (lines 71-73 "Deprecated `src/main/integrations/alpaca.ts`" and Source files line 321) does not exist. `ls src/main/integrations/` has no `alpaca.ts`. Suggested fix: delete the section and the bullet.

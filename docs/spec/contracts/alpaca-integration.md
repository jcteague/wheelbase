# Alpaca Integration

<!-- generated:from us-31,us-32,us-33,us-35,us-37,us-39,market-data-massive-migration,us-99 -->

## Overview

Alpaca is Wheelbase's **broker** integration — the source of account info, broker activities (assignments, exercises, expirations), and the market clock used to drive session-aware UI and polling — and, since US-99, also its **only market-data vendor**: stock quotes, option snapshots, option chains and the live stock stream come from Alpaca's free data plan. The two concerns stay split across two interfaces (`BrokerProvider` and `MarketDataProvider`) with independent factories and IPC namespaces (`broker:*` / `market-data:*`); what they share is the trader's Alpaca credentials.

This page documents the Alpaca-facing surface:

- The `BrokerProvider` contract (Alpaca-backed via `AlpacaBrokerProvider`)
- The `broker:*` IPC namespace
- Activity polling (the only consumer pattern in the codebase today is US-35's assignment detection)
- Settings-side credential probes for paper/live environments, and how a credential change propagates to both stacks
- The `AlpacaMarketDataProvider` vendor seam (endpoints, websocket handshake, error tables)

For the `MarketDataProvider` interface, the REST/stream model and the renderer cache, see [domain/market-data.md](../domain/market-data.md); for channel shapes see [contracts/ipc-handlers.md](./ipc-handlers.md). For the activity-driven cost-basis flow that consumes assignment events, see [domain/cost-basis.md](../domain/cost-basis.md).

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-35,us-37,us-39,market-data-massive-migration,us-99 -->

## Boundary layout

Wheelbase keeps every Alpaca call behind a small set of files under `src/main/integrations/`.

### `BrokerProvider` interface

Provider-agnostic contract every broker implementation satisfies. Defined in `src/main/integrations/broker-provider.ts`. Methods:

- `getAccountInfo(): Promise<AccountInfo>`
- `getMarketStatus(): Promise<MarketStatus>`
- `getActivities(filter: ActivityFilter): Promise<BrokerActivity[]>`

### `AlpacaBrokerProvider` implementation

The Alpaca-backed concrete class. Lives at `src/main/integrations/alpaca-broker.ts` (post-US-39 split). It is the only module in the repo permitted to import `@alpacahq/typescript-sdk`. Constructed lazily — `new AlpacaBrokerProvider({ keyId, secretKey, environment })` (where `environment` is `'paper' | 'live'`) does not perform any network I/O.

### `brokerFactory` object

The single entrypoint downstream code uses for broker reads. Defined in `src/main/integrations/broker-factory.ts` as the `brokerFactory` object with methods `configure(next)`, `create()`, and `recreate()`. `create()` resolves the active broker environment (`'paper' | 'live' | 'none'`) and the corresponding stored credentials via `src/main/services/settings.ts`, then constructs an `AlpacaBrokerProvider` for the active environment. When no environment is active or no credentials exist, `brokerFactory.create()` (via `buildProvider()`) **throws** `new BrokerError('auth_failed', 'Alpaca credentials not configured')` rather than returning `null`. Its default credential loader is the shared `loadAlpacaCredentialsFromEnv` (see [Credentials](#credentials-one-set-of-keys-two-stacks)).

A `FakeBrokerProvider` sibling exists for e2e and dev (`src/main/integrations/fake-broker.ts`) — same interface, env-driven canned responses.

### `AlpacaMarketDataProvider` implementation (US-99)

The market-data adapter, at `src/main/integrations/alpaca-market-data.ts` with pure mappers in `alpaca-market-data-mappers.ts`. It implements `MarketDataProvider` over raw `fetch` and `ws` — **no SDK** — and is selected by `marketDataFactory` (`market-data-factory.ts`) unless `FAKE_MARKET_DATA=true`. Unlike `brokerFactory`, `marketDataFactory.create()` **never throws**; a missing credential surfaces per call as `MarketDataError('auth_failed', 'Alpaca credentials not configured')`. Details under [Market-data adapter](#market-data-adapter-us-99).

### Single-import-site rule

Only `src/main/integrations/alpaca-broker.ts` may `import` from `@alpacahq/typescript-sdk`. IPC handlers (`src/main/ipc/broker.ts`, `src/main/ipc/market-data.ts`), services, the renderer, and the pure-core engines consume `BrokerProvider` / `MarketDataProvider` via their factories. SDK and vendor raw shapes (`activity_type`, `latestQuote.bp`, …) never leak past the adapters; the boundary only emits domain types (`AccountInfo`, `MarketStatus`, `BrokerActivity`, `StockQuote`, `OptionSnapshot`, `OptionChainQuote`).

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-35,us-37,us-39,market-data-massive-migration,us-99 -->

## SDK usage and bypass

The broker provider uses `@alpacahq/typescript-sdk` (v0.0.32-preview) selectively for broker REST calls — the SDK is a Deno-to-Node transpile, marked no-longer-maintained, but the broker-side endpoints work reliably. Rewriting them with raw `fetch` would be unnecessary churn.

| SDK method           | Used to implement                                                          |
| -------------------- | -------------------------------------------------------------------------- |
| `client.getAccount`  | `getAccountInfo()`                                                         |
| `client.getClock`    | `getMarketStatus()` (session derived client-side from `is_open` + windows) |
| `client.getActivity` | `getActivities(filter)` (with manual query-param construction)             |

**Market data bypasses the SDK entirely.** The SDK's market-data surface is where its known bugs live (`getStocksSnapshots` hits the wrong path; the options-snapshot type omits `greeks`/`impliedVolatility`; no websocket support), so `AlpacaMarketDataProvider` talks to `https://data.alpaca.markets` and `wss://stream.data.alpaca.markets` directly. See [ADR alpaca-sdk-rest-only](../architecture/02-adrs/alpaca-sdk-rest-only.md).

### Deprecated `src/main/integrations/alpaca.ts`

The pre-existing `src/main/integrations/alpaca.ts` (`client`, `resetClient`) is marked `@deprecated`. It remains in the tree to avoid breaking any in-flight branch that imports it, but no new code uses it — new code goes through `brokerFactory.create()` / `marketDataFactory.create()`. Its comments were updated in US-99 to name `AlpacaMarketDataProvider`.

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-35,us-37,us-39,us-47-49,market-data-massive-migration -->

## REST surface (broker)

Each REST method is wrapped in a `try` / `wrapError(err, opLabel)` block that normalises HTTP 401 → `auth_failed`, 429 → `rate_limited`, network failures → `network_error`, and unknown failures → `unknown` (IPC handlers default that to `internal_error`). The Alpaca SDK may omit the HTTP `status` field and embed a JSON body code instead (e.g. `{"code":40110000,"message":"request is not authorized"}`); `wrapError` parses these 401-class body codes as `auth_failed`.

**Credential guard (US-47).** `requireCredentials()` is called as the **first line** of every public method. Missing `keyId` or `secretKey` throws `BrokerError('auth_failed', 'Alpaca credentials not configured', 'settings/credentials/alpaca')` immediately, before the SDK is invoked. This ensures every method returns a consistently typed `auth_failed` error with a navigation deeplink rather than falling through to `wrapError` as `unknown`.

**Environment mismatch detection (US-47).** `wrapError` detects both directions of key/environment mismatch:

- Paper env + live key (starts with `AK`) → `BrokerError('environment_mismatch', 'Environment mismatch — these are LIVE keys, not paper keys')`
- Live env + paper key (starts with `P`) → `BrokerError('environment_mismatch', 'Environment mismatch — these are PAPER keys, not live keys')`

### `getAccountInfo(): Promise<AccountInfo>`

- **SDK method:** `client.getAccount`.
- **Returns:** `{ buyingPower, portfolioValue, cash, environment: 'paper' | 'live', accountNumberMasked }`. All three money fields are **normalized to 4 decimal-place strings** via `new Decimal(s).toFixed(4)` (US-47 AC-1) — e.g. `'10000.0000'` not `'10000.00'`. `environment` is taken directly from the provider's `environment` config field (`'paper' | 'live'`).
- **IPC channel:** `broker:account` (US-39 split namespace).

### `getMarketStatus(): Promise<MarketStatus>`

- **SDK method:** `client.getClock`.
- **Used by:** `broker:market-status` IPC handler, polled by the renderer's `useMarketStatus()` hook every 60 s. Drives the `MarketStatusPill` (`LIVE` / `EXT` / `CLOSED` / `DELAYED`). Also queried by the `PollingScheduler` per tick to decide the next-tick cadence (see [Activity polling pattern](#activity-polling-pattern-us-35) below).
- **Returns:** `{ isOpen, nextOpen, nextClose, session: 'regular' | 'pre' | 'post' | 'closed' }`. Alpaca's `/v2/clock` only returns `is_open`, `next_open`, `next_close` — `session` is **derived client-side** by comparing the clock timestamp against calendar windows (pre: 4:00–9:30 AM ET, regular: 9:30 AM–4:00 PM ET when `is_open`, post: 4:00–8:00 PM ET, closed: otherwise).
- **Why poll instead of stream?** Alpaca offers no streaming option for clock/session changes; transitions are predictable boundaries (4 AM, 9:30 AM, 4 PM, 8 PM ET, weekends/holidays) so a 60 s poll catches them within a minute.
- **Why broker, not market-data?** The clock is an account-side concern and the authoritative session signal used across the UI and scheduler; it has stayed on `BrokerProvider` through both market-data vendor changes.

### `getActivities(filter): Promise<BrokerActivity[]>`

- **SDK method:** `client.getActivity` (with manual query-param construction — the SDK ignores some params on this endpoint).
- **Filter shape:** `{ type: string; since?: string /* ISO-8601 */ }`. `type` is an Alpaca activity code:
  - `'OPASN'` — option assignment (the only consumer in the codebase today; see US-35)
  - `'OPEXP'` — option expiration
  - `'OPXRC'` — option exercise
- **Returns:** array sorted by `transactionTime` descending. Each entry carries `activityId`, `activityType`, `symbol`, `qty`, `price`, `transactionTime`.
- **IPC channel:** `broker:activities` (US-39 split namespace).

### `BrokerError` shape

`BrokerError` (in `src/main/integrations/broker-provider.ts`) carries three fields: `code: BrokerErrorCode`, `message: string`, and `deeplink?: string`. `deeplink` is populated only by `requireCredentials()` (value: `'settings/credentials/alpaca'`); all other throws leave it `undefined`. The IPC error envelope (US-47) spreads `deeplink` as a top-level field when present — see [ADR: deeplink-in-ipc-error-envelope](../architecture/02-adrs/deeplink-in-ipc-error-envelope.md).

<!-- /generated -->

<!-- generated:from us-35,market-data-massive-migration -->

## Activity polling pattern (US-35)

US-35 is the first real consumer of `BrokerProvider.getActivities({ type: 'OPASN', since })`. It introduces a watermark + dedupe pattern that any future activity-polling job (`OPEXP`, `OPXRC`, etc.) should follow.

### Watermark captured at poll start, not poll end

The detection service stamps `pollStartedAt = new Date().toISOString()` **before** awaiting `brokerProvider.getActivities({ type: 'OPASN', since })`, then persists that timestamp (not `now()`) once the batch completes successfully.

- **Why:** Stamping at the end of the call would lose any activity that lands during the broker round trip. Stamping at the start means anything that arrived during the gap is replayed on the next poll, and dedupe handles it.
- **Cost:** Slightly more re-processing per poll — bounded by the activity volume during the call, and absorbed by `INSERT OR IGNORE` against the compound unique index.

### Per-environment watermark keys

The watermark is stored in the `app_settings` key-value table (owned by main's migration 006). Keys are **per environment**, with an `:env` suffix:

- `assignments_last_poll_at:paper`
- `assignments_last_poll_at:live`

This keeps paper and live histories independent — switching the active broker environment (US-37) starts the new environment's polling from its own last-seen watermark without leaking activity from the other.

The same suffix convention should be used for any future activity-polling watermark (`<job>_last_poll_at:<env>`).

### Dedupe via compound UNIQUE

Detected assignments are persisted with `INSERT OR IGNORE` against `UNIQUE(activity_id, position_id)` on `pending_assignments` (see migration `008_create_pending_assignments.sql`). The compound index allows one pending row per matching position when a single OPASN activity collides with multiple open CSPs on the same OCC symbol, while still rejecting genuine replays.

### `BrokerError` handling and scheduler back-off

When `getActivities` throws a `BrokerError`, the detect-assignments job classifies and surfaces it without crashing the app:

| `BrokerError.code`     | Detection-service behaviour                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `network_error`        | WARN log + bail out of the tick. Watermark is **not** advanced; the next scheduler tick retries naturally.            |
| `auth_failed`          | Typed return (`{ detected: 0, skipped: 0, brokerError: { code: 'auth_failed' } }`). Scheduler can back off this job.  |
| `rate_limited`         | WARN log + bail out; treated like `network_error` from the poll's perspective. Recovery on the next tick.             |
| `environment_mismatch` | Typed return; surfaced via the settings page during credential entry, not during a normal poll.                       |
| other / unknown        | WARN log + bail out; the scheduler's outer try/catch ensures it does not stop the scheduler (see `PollingScheduler`). |

The job handler in `src/main/index.ts` lazy-reads `brokerFactory.create()` plus `settings.getCredentialStatus().activeBrokerEnv` on every tick, then **short-circuits to a no-op when `activeBrokerEnv === 'none'`** — there is nothing to poll when no environment is active, and US-37's runtime credential changes flow through without restart.

### Polling cadence

The job registers with the `PollingScheduler` (see [features/us-46-polling-scheduler.md](../features/us-46-polling-scheduler.md)) using a market-aware interval policy:

```ts
{
  kind: 'interval',
  marketOpenMs: 60_000,      // 60s during regular hours
  extendedHoursMs: 300_000,  // 5min during pre/post
  marketClosedMs: null       // parked overnight; next run on market open
}
```

OPASN events typically post overnight after expiration, so the next morning's first poll catches them; during-hours polling exists for same-day early-exercise corner cases.

<!-- /generated -->

<!-- generated:from us-37,market-data-massive-migration,us-99 -->

## Credentials: one set of keys, two stacks

US-37 moved Alpaca credentials into encrypted settings persistence and added runtime broker-environment switching. US-99 made those same credentials the market-data credential.

- **Encrypted persistence.** `src/main/services/settings.ts` stores Alpaca paper and live credentials in `credential_settings` with Electron `safeStorage.encryptString`. Plaintext secrets never round-trip to the renderer — saved cards render masked placeholders plus a `Replace` flow.
- **Active environment persisted separately.** `app_settings.active_broker_environment` stores `'paper' | 'live' | 'none'`. `brokerFactory.create()` resolves the effective environment via this setting plus credential presence; `settings.loadActiveAlpacaCredentials()` returns `{ environment, keyId, secret } | null` for the active one.
- **Dev/CI fallback — `process.env` only.** `loadAlpacaCredentialsFromEnv()` (`src/main/integrations/alpaca-credentials.ts`) reads `ALPACA_KEY_ID` / `ALPACA_SECRET_KEY` / `ALPACA_PAPER` from `process.env` and is the default loader for **both** factories. It deliberately never reads `import.meta.env.MAIN_VITE_*`: `electron-vite` inlines those into the bundle at build time, so `.env` cannot configure keys (export them for the process instead). An explicitly empty value means "not configured", which is how the e2e harness forces a credential-less app. See [ADR alpaca-credentials-runtime-env-only](../architecture/02-adrs/alpaca-credentials-runtime-env-only.md).
- **Credential change propagation.** Settings mutations that change broker state call `onBrokerProviderChanged`, which runs `brokerFactory.recreate()` (rebuilds the broker provider cache), nudges the detect-assignments job, and — since US-99 — `restartStockQuoteStream()` so the market-data websocket re-authenticates with the new keys. The market-data provider itself is not recreated; it resolves credentials on every REST call. See [ADR runtime-broker-provider-refresh](../architecture/02-adrs/runtime-broker-provider-refresh.md) and [market-data-lazy-credentials-stream-restart](../architecture/02-adrs/market-data-lazy-credentials-stream-restart.md).
- **Vendor-scoped query invalidation.** Renderer query keys are namespaced (`['broker', ...]` vs `['market', ...]`). Settings mutations invalidate broker queries via a predicate on `queryKey[0] === 'broker'`; the market caches are refreshed by the stream restart rather than by invalidation.
- **LIVE confirmation.** The renderer shows a `LiveBrokerConfirmDialog` before invoking `settings:set-active-broker-environment` with `environment: 'live'`; its copy notes that market data reconnects with the live keys. Switching from live back to paper is immediate (no dialog).
- **Status.** `CredentialStatus` (`settings:get-credential-status`) carries `alpacaPaper`, `alpacaLive`, `activeBrokerEnv`, masked account numbers, and `marketData: 'configured' | 'missing'` = `activeBrokerEnv !== 'none' || hasFallbackCredentials()`. `hasFallbackCredentials` is a required option of `createSettingsService`, wired in `index.ts` to the env loader.

### Settings probe flows

Settings-side Alpaca probes are intentionally separate from regular `BrokerProvider` reads so the app can test paper and live environments directly without depending on the currently active broker:

- **Candidate credentials:** `settings:test-connection` with `{ vendor: 'alpaca', environment, keyId, secret }` calls `GET {ALPACA_TRADING_BASE_URLS[environment]}/v2/account` using the candidate credentials and returns a masked account number on success. `vendor: 'alpaca'` is the only literal the payload schema accepts (US-99 removed the `massive` member).
- **Stored credentials:** `settings:test-stored-alpaca-connection` loads encrypted credentials for the requested environment and runs the same probe without exposing secrets back to the renderer.
- **Environment mismatch:** detected bidirectionally via key prefix heuristic (`AK…` = live, `PK…` = paper). Live keys in the paper card return `environment_mismatch` / `Environment mismatch — these are LIVE keys, not paper keys`; paper keys in the live card return `environment_mismatch` / `Environment mismatch — these are PAPER keys, not live keys`.

All Alpaca HTTP/SDK interaction stays inside `alpaca-broker.ts`, `alpaca-market-data.ts`, or the settings-probe helpers in `src/main/services/settings-connections.ts`; the renderer and IPC layers only see typed result objects. The per-environment trading host map (`https://paper-api.alpaca.markets` / `https://api.alpaca.markets`) lives once in `src/main/integrations/alpaca-hosts.ts` (`ALPACA_TRADING_BASE_URLS`), shared by the probes and the market-data provider's open-interest call.

<!-- /generated -->

<!-- generated:from us-99 -->

## Market-data adapter (US-99)

`AlpacaMarketDataProvider` serves every `MarketDataProvider` method from Alpaca's free data plan. It takes `{ loadCredentials: () => AlpacaCredentials | null }` and resolves it on every REST call and inside `connect()`. Free-plan limits: IEX stock feed (not SIP), indicative option feed (not OPRA), 200 REST requests/min, one websocket connection, 30 streamed symbols.

### Outbound HTTP

All requests carry `APCA-API-KEY-ID` / `APCA-API-SECRET-KEY` headers; headers are never logged (`debug` logs `alpaca_api_request { url }` / `alpaca_api_response { url, status }`).

| Interface method         | Request                                                                                                                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getStockQuotes`         | `GET https://data.alpaca.markets/v2/stocks/snapshots?symbols={A,B,…}&feed=iex` — **one** request for the whole ticker list; empty list ⇒ no request, empty `Map`                                               |
| `getOptionChainSnapshot` | `GET https://data.alpaca.markets/v1beta1/options/snapshots/{underlying}?feed=indicative[&type=][&expiration_date_gte=][&expiration_date_lte=][&strike_price_gte=][&strike_price_lte=]&limit={n}[&page_token=]` |
| `getOptionSnapshot`      | `GET https://data.alpaca.markets/v1beta1/options/snapshots?symbols={contractId}&feed=indicative`                                                                                                               |
| (open interest)          | `GET {ALPACA_TRADING_BASE_URLS[env]}/v2/options/contracts?underlying_symbols={underlying}[…same filters…]&limit=10000[&page_token=]` — after a non-empty chain; failure ⇒ `openInterest: null` + `warn`        |

Chain pagination: no `filter.limit` → `limit=1000`, follow `next_page_token` until `null`; with `filter.limit` → `min(limit, 1000)` plus `filter.cursor` as `page_token`, first page only. Contracts always paginate to exhaustion. Empty chain ⇒ `[]` without a contracts request. Field mapping onto `StockQuote` / `OptionSnapshot` / `OptionChainQuote` is in [domain/market-data.md](../domain/market-data.md).

### Outbound websocket

| Step                                                        | Client sends                                                                                         | Server frame that advances                                                        |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `connect()` opens `wss://stream.data.alpaca.markets/v2/iex` | —                                                                                                    | `[{"T":"success","msg":"connected"}]`                                             |
| authenticate                                                | `{"action":"auth","key":<keyId>,"secret":<secret>}`                                                  | `[{"T":"success","msg":"authenticated"}]` ⇒ `connect()` resolves                  |
| `stream('stockQuotes', s)`                                  | `{"action":"unsubscribe","bars":[removed]}` then `{"action":"subscribe","bars":[added]}` (diff only) | `[{"T":"subscription","bars":[…]}]` (logged, not awaited)                         |
| tick                                                        | —                                                                                                    | `{"T":"b","S":…,"o","h","l","c","v","t","n","vw"}` ⇒ `StreamEvent` on the subject |
| `disconnect()`                                              | socket close                                                                                         | `close` ⇒ `ws = null`, `subscribed.clear()`                                       |

Every server message is a JSON **array** of frames. `connect(feeds)` ignores `feeds` other than logging; only `'stockQuotes'` is streamable (`supportsStreaming` is `false` for option feeds). No auto-reconnect. See [ADR per-symbol-ws-subscription-reconciliation](../architecture/02-adrs/per-symbol-ws-subscription-reconciliation.md).

### Error tables

REST → thrown `MarketDataError` (envelope via `handleIpcCall`; classified by `classifyChainFailure` in the chain service):

| `code`          | message                                        | Trigger                                                                              |
| --------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| `auth_failed`   | `Alpaca credentials not configured`            | `loadCredentials()` returned `null` (no request made)                                |
| `auth_failed`   | `HTTP 401` / `HTTP 403`                        | data or trading API rejected the keys                                                |
| `not_found`     | `HTTP 404: {url}`                              | endpoint returned 404                                                                |
| `not_found`     | `Option contract {contractId} not in snapshot` | `?symbols=` response omitted the requested symbol                                    |
| `rate_limited`  | `rate limit exceeded`                          | 429 persisted after `MAX_RETRIES = 2` retries honouring `Retry-After` (s, default 1) |
| `network_error` | fetch error message                            | `isNetworkError(err)` on the `fetch` rejection                                       |
| `unknown`       | `HTTP {status}`                                | any other non-2xx, including `400 invalid symbol`                                    |
| `unknown`       | underlying error message                       | `fetch` rejected with a non-network error                                            |

Websocket — `connect()` rejects with `MarketDataError` (402 → `auth_failed`, 409 → `streaming_unsupported`, 406/other → `unknown`, socket error → `network_error`, 10 s auth timeout → `network_error`); after connect, `error` frames go to the stream's error channel as `StreamError { feed: 'stockQuotes', code: 'symbol_limit' (405) | 'connection_limit' (406) | 'unknown', message, reconnectable: false }`. Full tables in [ADR marketdataerror-structured-codes](../architecture/02-adrs/marketdataerror-structured-codes.md).

### Rate budget

Per screener refresh: 2 requests per watchlist ticker (chain + contracts) at `CHAIN_FETCH_CONCURRENCY = 4`. Per alert-evaluation tick: 1 batched stock snapshot + 1 per open option leg. Per ticker-set change: 1 batched stock snapshot. A 405 from the socket is surfaced as a stream error, never truncated client-side.

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-35,us-37,us-39,market-data-massive-migration,us-99 -->

## Error model

Every SDK error path and every probe failure on the broker side funnels through a single helper inside the adapter:

```ts
function wrapError(err: unknown, op: string): never {
  // inspect err.response.status, err.code, etc.
  // throw new BrokerError({ op, code: '<code>', cause: err })
}
```

`BrokerError` is a structured `Error` subclass with a discriminating `code` field:

| Code                   | When                                                                             |
| ---------------------- | -------------------------------------------------------------------------------- |
| `auth_failed`          | SDK rejects credentials (HTTP 401, missing credentials)                          |
| `network_error`        | Upstream unreachable, DNS failure, timeout                                       |
| `rate_limited`         | SDK returns HTTP 429                                                             |
| `environment_mismatch` | Live keys submitted to paper card or vice versa (US-39 addition; US-37 consumer) |
| `unknown`              | Catch-all for unclassified failures                                              |

`MarketDataError` is the parallel taxonomy thrown by `AlpacaMarketDataProvider` (six codes: `auth_failed | network_error | not_found | rate_limited | streaming_unsupported | unknown`) — see [Error tables](#error-tables) above and [domain/market-data.md](../domain/market-data.md). The two error classes are deliberately separate even though both now describe Alpaca failures: `BrokerError` carries a `deeplink`, `MarketDataError` is classified by the chain service, and the renderer shows one shared prompt ("Alpaca authentication failed — check your key in Settings") when either reports `auth_failed`.

**Errors are thrown, not returned** (no `Result<T, E>` tuples), consistent with the rest of the codebase. IPC handler layers map the codes directly to envelope error codes — see the [Standard error codes](./ipc-handlers.md#standard-error-codes) table. Unclassified exceptions propagate as generic `Error` and become `internal_error` at the handler.

The broker adapter records **no explicit retry policy, no exponential backoff, and no per-call rate-limit tracker**; the market-data adapter retries only 429s (`MAX_RETRIES = 2`, honouring `Retry-After`). Recovery is otherwise:

- For reads driven by the renderer: the next user action (refresh, re-mount of the settings or positions page) or the next 60 s `useMarketStatus` poll.
- For reads driven by the scheduler: the next tick (cadence-aware) — see the [Activity polling pattern](#activity-polling-pattern-us-35).
- For the stock stream: no auto-reconnect; the next `set-stock-quote-tickers` call or a credential change re-establishes it.

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-35,us-37,us-39,market-data-massive-migration,us-99 -->

## Source files

- `src/main/integrations/broker-provider.ts` — `BrokerProvider` interface; `AccountInfo`, `MarketStatus`, `BrokerActivity`, `ActivityFilter` types; `BrokerError` class.
- `src/main/integrations/alpaca-broker.ts` — `AlpacaBrokerProvider` implementation. The only file in the repo permitted to import `@alpacahq/typescript-sdk`. Owns lazy SDK client construction, REST mapping for `getAccountInfo` / `getMarketStatus` / `getActivities`, and `wrapError` normalisation.
- `src/main/integrations/broker-factory.ts` — `brokerFactory` object with `configure()`, `create()`, and `recreate()`. Resolves the active environment via `src/main/services/settings.ts`; default env loader `loadAlpacaCredentialsFromEnv`.
- `src/main/integrations/fake-broker.ts` — `FakeBrokerProvider` for e2e and dev; env-driven canned responses.
- `src/main/integrations/alpaca-market-data.ts` — `AlpacaMarketDataProvider`: HTTP + 429 retry, websocket lifecycle, per-symbol subscription state (US-99).
- `src/main/integrations/alpaca-market-data-mappers.ts` — pure vendor response types, URL builders, mappings onto domain types, frame parsing (US-99).
- `src/main/integrations/alpaca-credentials.ts` — `loadAlpacaCredentialsFromEnv()`, the shared `process.env`-only fallback (US-99).
- `src/main/integrations/alpaca-hosts.ts` — `ALPACA_TRADING_BASE_URLS` per-environment trading host map (US-99).
- `src/main/integrations/market-data-factory.ts` — `marketDataFactory` (`configure({ loadActiveAlpacaCredentials })`, `create()`, `recreate()`, `disconnect()`); fake under `FAKE_MARKET_DATA=true`; never throws.
- `src/main/integrations/alpaca.ts` — pre-existing helper marked `@deprecated`; kept available, no new code uses it.
- `src/main/ipc/broker.ts` — `broker:account`, `broker:market-status`, `broker:activities` IPC handlers (US-39 split namespace).
- `src/main/ipc/market-data.ts` — `market-data:*` handlers; returns `{ restartStockQuoteStream }` for the credential-change path.
- `src/main/services/settings.ts` — encrypted `credential_settings` persistence; `getCredentialStatus()` (including `marketData`); `loadActiveAlpacaCredentials()`.
- `src/main/services/settings-connections.ts` — Alpaca probe helpers with typed error mapping. The probes (`settings:test-connection`, `settings:test-stored-alpaca-connection`) are deliberately separate from regular `BrokerProvider` reads.
- `src/main/services/market-data.ts` — `StreamState`, `subscribeToStockQuotes`, `restartStockQuoteStream`.
- `src/main/services/detect-assignments.ts` — US-35 poll job. Captures `pollStartedAt` before `getActivities`, persists per-environment watermarks (`assignments_last_poll_at:paper` / `:live`), handles `BrokerError.code` for graceful back-off.
- `src/main/services/scheduler-instance.ts` — module-level singleton `PollingScheduler` with safe-broker fallback. Consumes `BrokerProvider.getMarketStatus()` per tick for cadence decisions.
- `src/main/index.ts` — wires both factories to `settings.loadActiveAlpacaCredentials()`; `onBrokerProviderChanged` recreates the broker provider, nudges detect-assignments, and restarts the stock stream; registers the US-35 `detect-assignments` job; consolidated `before-quit` awaits `Promise.all([scheduler.stop(), marketDataFactory.disconnect()])`.

<!-- /generated -->

<!-- generated:from us-31,us-32,us-33,us-35,us-37,us-39,market-data-massive-migration,us-99 -->

## Driven by

- [us-31 — Market Data Provider Adapter](../features/us-31-market-data-provider-adapter.md)
- [us-32 — Live Position Prices](../features/us-32-live-position-prices.md)
- [us-33 — Option Mid Price & Unrealized P&L](../features/us-33-option-mid-pnl.md)
- [us-35 — Assignment Detection & Auto-Transition](../features/us-35-assignment-detection.md)
- [us-37 — Paper / Live Broker Environment Toggle](../features/us-37-paper-live-broker-environment-toggle.md)
- [us-39 — Massive Market Data Provider](../features/us-39-massive-market-data-provider.md) (superseded — broker split still current)
- [market-data-massive-migration](../features/market-data-massive-migration.md) (superseded)
- [us-99 — Alpaca as the sole market-data provider](../features/us-99-alpaca-market-data-provider.md)

<!-- /generated -->

<!-- Hand-written sections below this line are preserved across regeneration. -->

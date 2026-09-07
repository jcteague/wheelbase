---
story: us-99
kind: feature
parent: null
topics: [market-data, screener, alpaca-integration, settings]
status: planned
---

# Implementation Plan: US-99 — Alpaca as the sole market-data provider (retire Massive)

## Summary

Replace `MassiveMarketDataProvider` with an `AlpacaMarketDataProvider` that serves the whole
`MarketDataProvider` interface from Alpaca's free data plan: one batched IEX stock snapshot for
REST seeds, an IEX websocket with per-symbol bar subscriptions for live prices, indicative
option chains and single-contract snapshots with bid/ask, greeks and IV, and open interest
joined from the trading API. Credentials are the Alpaca keys the trader already saves in
Settings, resolved per call; a credential change restarts only the stream. Massive's code,
env vars, settings section, test button and copy are removed. Done means: the screener ranks
two-sided strikes on the free plan, positions get live prices and option marks from Alpaca,
Settings and banners name Alpaca only, `grep -rni massive src e2e .env.example` prints
nothing, and every vendor shape quirk observed on 2026-09-06 is pinned by a test.

## Supporting Documents

Read these before starting implementation — they contain the decisions, data model, and API contract:

- **User Story & Acceptance Criteria:** none on disk — see "Acceptance Criteria (derived)" below
- **Research & Design Decisions:** `plans/us-99/research.md`
- **Data Model & Selection Logic:** `plans/us-99/data-model.md`
- **API Contract(s):** `plans/us-99/contracts/alpaca-market-data.md`, `plans/us-99/contracts/settings-credential-status.md`
- **Quickstart & Verification:** `plans/us-99/quickstart.md`

No new IPC handler. The first contract is the external vendor seam; the second documents
the two existing settings channels whose shapes change.

## Acceptance Criteria (derived)

No story file exists; these stand in for the story's Gherkin. Promote to
`docs/epics/06-stories/US-99-alpaca-market-data-provider.md` when convenient.

- **AC1 — Stock prices from Alpaca.** Given active Alpaca credentials, when the renderer
  requests stock quotes for N tickers, then one IEX snapshot request is made and each quote
  carries `price` from the latest trade, real bid/ask, `prevClose` from the previous daily
  bar, and daily volume.
- **AC2 — Live prices stream from Alpaca.** After the REST seed, minute bars for the
  subscribed tickers arrive over one IEX websocket; changing the ticker set subscribes and
  unsubscribes only the difference; ticks reach the renderer on `market-data:stock-quote`.
- **AC3 — Option quotes feed the screener and position marks.** Chains and single-contract
  snapshots come from the indicative feed with bid, ask, mid, greeks, IV, volume and
  timestamp; open interest is joined from the contracts endpoint; two-sided strikes rank.
- **AC4 — No credentials degrades, never crashes.** Without Alpaca credentials the app
  starts, market-data calls fail with `auth_failed`, the screener shows its unavailable card,
  Positions shows the "Connect Alpaca" banner, and no Alpaca request is made.
- **AC5 — Credentials take effect without restart.** Saving, removing or switching Alpaca
  credentials restarts the stock stream with the new keys and the next REST call uses them.
- **AC6 — Streaming problems leave REST working.** A 409 (insufficient subscription) at
  connect continues REST-only with a warning; a 405 (symbol limit) after connect surfaces as
  a stream error and the stale banner; prices still load.
- **AC7 — Structured error codes.** REST 401/403 → `auth_failed`, 404 → `not_found`, 429 →
  retry then `rate_limited`, transport → `network_error`, other non-2xx → `unknown`; websocket
  402 → `auth_failed`, 409 → `streaming_unsupported`; unknown underlying → empty chain;
  missing contract → `not_found`.
- **AC8 — Missing blocks never abort a response.** Snapshots without `latestQuote`,
  `latestTrade` or with partial `greeks` map to zeroed prices / omitted greeks; unparseable
  map keys and trade-less stock snapshots are skipped; the rest is returned.
- **AC9 — Massive is gone.** No Massive code, env var, settings field, test button, mock key
  or user-facing copy remains; `CredentialStatus.marketData` reports configured iff a broker
  environment is active; Settings, Positions, Screener and the live-switch dialog describe
  Alpaca as the market-data source.
- **AC10 — Fake path unchanged.** `FAKE_MARKET_DATA=true` still selects the untouched
  `FakeMarketDataProvider`; every existing market-data e2e scenario passes.

## Prerequisites

- `src/main/integrations/market-data-provider.ts` — interface and `MarketDataError` (US-31/US-64), unchanged.
- `src/main/integrations/massive-market-data.ts` + `.test.ts` — reference for `apiFetch`
  retry loop, `computeMid`, the `MockWs` `vi.mock('ws')` pattern; deleted in Area 9.
- `src/main/integrations/market-data-factory.ts` + `.test.ts`; `broker-factory.ts` (+ test)
  with the env credential loader to share.
- `src/main/services/settings.ts` (`AlpacaCredentials`, `loadActiveAlpacaCredentials`,
  `CredentialStatus`), `settings-connections.ts`, `src/main/ipc/settings.ts`, `src/main/schemas.ts`.
- `src/main/services/market-data.ts` (`StreamState`, `subscribeToStockQuotes`),
  `src/main/ipc/market-data.ts` (+ test), `src/main/index.ts`.
- `src/main/integrations/integration-errors.ts` (`isNetworkError`), `src/main/concurrency.ts`.
- `src/main/integrations/fake-market-data.ts` (private `parseOccSymbol`), `src/shared/option-symbol.ts`.
- Renderer: `App.tsx`, `components/MarketDataStatusDot.tsx`, `components/LiveBrokerConfirmDialog.tsx`,
  `pages/SettingsPage.tsx`, `pages/PositionsListPage.tsx`, `pages/ScreenerPage.tsx`,
  `api/settings.ts`, `src/preload/index.d.ts`, plus their tests.
- E2E: `settings-environment.spec.ts`, `provider-split.spec.ts`, `screener-results.spec.ts`,
  `live-underlying-price.spec.ts`, `option-pnl.spec.ts`, `assignment-helpers.ts`.

## AC Audit

| AC   | E2E test (Area 10)                                                                                                                                                                                                                                                                                                      | Unit coverage (Area)        |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| AC1  | `Live underlying prices seed from the market-data provider` — existing `live-underlying-price.spec.ts` seed scenario (fake; the IEX mapping is not reachable offline)                                                                                                                                                   | 3                           |
| AC2  | `Stream ticks update the price cell` — existing `live-underlying-price.spec.ts` tick scenario                                                                                                                                                                                                                           | 5, 6                        |
| AC3  | `Screener ranks two-sided strikes` (existing `screener-results.spec.ts`) and `Position option marks render` (existing `option-pnl.spec.ts`)                                                                                                                                                                             | 4                           |
| AC4  | `Empty-state on first launch shows the Connect Alpaca banner and dashes` — **rewritten** in `settings-environment.spec.ts`                                                                                                                                                                                              | 6 (factory never throws), 8 |
| AC5  | `Switching broker environment restarts market data with the new keys` — **new** in `settings-environment.spec.ts` (asserts `set-stock-quote-tickers` is re-driven: fake `connect` count via `test:*` seam is not available, so the test asserts the renderer's price cell survives the switch and the LIVE dialog copy) | 6                           |
| AC6  | not e2e-observable offline — unit only (research ADR "E2E stays on the fake")                                                                                                                                                                                                                                           | 5                           |
| AC7  | `Market-data auth failure surfaces a typed error` — existing `provider-split.spec.ts` "Missing API key" scenario, renamed                                                                                                                                                                                               | 3, 4, 5                     |
| AC8  | not e2e-observable offline — unit only                                                                                                                                                                                                                                                                                  | 3, 4                        |
| AC9  | `Settings names Alpaca as the market-data source`, `Positions auth prompt names Alpaca`, `LIVE confirmation says market data reconnects with live keys`, `Screener outage card names Alpaca` — **new/rewritten**                                                                                                        | 7, 8, 9                     |
| AC10 | every existing spec launched with `FAKE_MARKET_DATA=true` — run only                                                                                                                                                                                                                                                    | 6 (factory test)            |

Provider-level ACs (6, 8) are pinned by Vitest over stubbed `fetch` / mocked `ws` with
fixtures transcribed from live responses — the same standard `provider-split.spec.ts` set for
the Massive provider in US-39.

## Implementation Areas

### 1. Shared OCC parser — promote `parseOccSymbol` out of the fake provider

**Files to create or modify:**

- `src/shared/option-symbol.ts` — add `OCC_SYMBOL` regex, `OccIdentity`, `parseOccSymbol(symbol): OccIdentity | null`
- `src/main/core/option-symbol.ts` — re-export `parseOccSymbol`, `OccIdentity`
- `src/main/core/option-symbol.test.ts`
- `src/main/integrations/fake-market-data.ts` — import the shared parser, drop the private copy

**Red — tests to write:**

- `option-symbol.test.ts` › `parseOccSymbol`: `'AAPL261009P00320000'` → `{ underlying: 'AAPL', contractId: 'AAPL261009P00320000', strike: '320.0000', expiration: '2026-10-09', contractType: 'put' }`.
- `'SPY260604C00750000'` → `contractType: 'call'`, `strike: '750.0000'`; `'NVDA261016P00012500'` → `strike: '12.5000'`.
- Returns `null` for `'NOT_AN_OCC'`, `'O:AAPL261009P00320000'`, `''`.
- `fake-market-data.test.ts` chain-identity tests stay green (run only).

**Green — implementation:**

- Move regex and derivation into `src/shared/option-symbol.ts` (no I/O imports; shared with the renderer); flat `OccIdentity` per `data-model.md`.
- Re-export from `src/main/core/option-symbol.ts`; adapt the fake (`const { underlying, ...quoteFields } = identity`).

**Refactor — cleanup to consider:**

- `grep -rn "\[PC\]" src` to confirm no other OCC regex remains.

**Acceptance criteria covered:** AC8 (enabler), AC3 (enabler).

### 2. Shared env credential loader

**Files to create or modify:**

- `src/main/integrations/alpaca-credentials.ts` — `loadAlpacaCredentialsFromEnv(): AlpacaCredentials | null`
- `src/main/integrations/alpaca-credentials.test.ts`
- `src/main/integrations/broker-factory.ts` — default config uses the shared loader

**Red — tests to write:**

- `ALPACA_KEY_ID` + `ALPACA_SECRET_KEY` + `ALPACA_PAPER=true` → `{ keyId, secret, environment: 'paper' }`; `ALPACA_PAPER=false` → `'live'`; `ALPACA_PAPER` unset → `'live'` (matches today's broker default).
- Either key missing or empty → `null`.
- `broker-factory.test.ts` existing four cases stay green (run only).

**Green — implementation:**

- Extract the inline loader from `broker-factory.ts` verbatim; `brokerFactory`'s default becomes `loadActiveAlpacaCredentials: loadAlpacaCredentialsFromEnv`.

**Refactor — cleanup to consider:**

- Check for duplication and naming consistency.

**Acceptance criteria covered:** AC4, AC5 (enabler).

### 3. `AlpacaMarketDataProvider` — REST plumbing and stock snapshots

**Files to create or modify:**

- `src/main/integrations/alpaca-market-data.ts` — class skeleton, `credentials()`, `apiFetch(url)`, `getStockQuotes`
- `src/main/integrations/alpaca-market-data.test.ts` — `fetchOk` / `fetchErr` helpers copied from the Massive test; fixtures from `data-model.md`

**Red — tests to write:**

- `getStockQuotes(['AAPL','MSFT'])` issues **one** `GET https://data.alpaca.markets/v2/stocks/snapshots?symbols=AAPL,MSFT&feed=iex` with headers `APCA-API-KEY-ID` / `APCA-API-SECRET-KEY` equal to `loadCredentials()`; `loadCredentials` is called on this request and again on the next (call count grows).
- `getStockQuotes([])` makes no request and returns an empty `Map`.
- Live AAPL fixture maps to `price '319.80'`, `bid '305.33'`, `ask '338.27'`, `prevClose '328.22'`, `change '-8.42'`, `changePercent '-2.5653'`, `volume 1224559`, `timestamp '2026-09-04T20:34:14.232Z'`.
- Symbol absent from the response (`ZZZZQ`) is absent from the `Map`; a snapshot without `latestTrade` is skipped with a `debug` log and the other symbol is returned (AC8).
- Missing `latestQuote` → `bid = ask = price`; missing `prevDailyBar` → `prevClose ''`, `change ''`, `changePercent ''`.
- `loadCredentials()` → `null` → throws `MarketDataError('auth_failed', 'Alpaca credentials not configured')` and `fetch` is not called (AC4).
- Status mapping via this endpoint: 401 → `auth_failed` (`HTTP 401`); 403 → `auth_failed`; 404 → `not_found`; 400 → `unknown`; 500 → `unknown`; 429 with `Retry-After: 0` then 200 → 2 calls and success; 429 ×3 → `rate_limited` after exactly 3 calls (fake timers); `fetch` rejecting with `{ cause: { code: 'ENOTFOUND' } }` → `network_error`; rejecting with `Error('boom')` → `unknown` (AC7).
- No `logger.debug` payload contains the secret (assert on the logged URL and absence of the key string).

**Green — implementation:**

- `AlpacaMarketDataProvider` per `contracts/alpaca-market-data.md`; private `credentials()` throwing on `null`; `apiFetch(url)` mirroring Massive's retry loop with header auth; `mapStockSnapshot(symbol, snap)` per `data-model.md`; `debug` `alpaca_api_request { url }` / `alpaca_api_response { url, status }`.

**Refactor — cleanup to consider:**

- If `apiFetch` ends up identical to Massive's apart from auth placement, that comparison is moot once Massive is deleted (Area 9) — do not extract a shared HTTP helper for one caller.

**Acceptance criteria covered:** AC1, AC4, AC7, AC8.

### 4. `AlpacaMarketDataProvider` — option chain, open interest, single snapshot

**Files to create or modify:**

- `src/main/integrations/alpaca-market-data.ts` — `getOptionChainSnapshot`, `fetchOpenInterest`, `getOptionSnapshot`, `mapOptionQuote`, `computeMid`
- `src/main/integrations/alpaca-market-data.test.ts`

**Red — tests to write:**

- `getOptionChainSnapshot({ underlying: 'AAPL', type: 'put', expirationFrom: '2026-10-06', expirationTo: '2026-10-21' })` → first request `GET https://data.alpaca.markets/v1beta1/options/snapshots/AAPL?…` with `feed=indicative`, `type=put`, `expiration_date_gte=2026-10-06`, `expiration_date_lte=2026-10-21`, `limit=1000`, no `page_token`.
- `strikeFrom/To` → `strike_price_gte/lte`; `limit: 50` → `limit=50` single page even with `next_page_token`; `cursor: 'abc'` → `page_token=abc`; `limit: 5000` → `limit=1000`.
- Pagination: `next_page_token: 'p2'` then `null` → two chain requests, second with `page_token=p2`, results concatenated.
- After a non-empty chain, a contracts request to `https://paper-api.alpaca.markets/v2/options/contracts?underlying_symbols=AAPL&type=put&expiration_date_gte=…&expiration_date_lte=…&limit=10000` with the same headers; `environment: 'live'` → `https://api.alpaca.markets`; contracts `next_page_token` followed; chain request precedes contracts request.
- ATM fixture + contracts row `open_interest: '8'` → the worked-example object in `data-model.md` exactly (`openInterest: 8` as a number); row with `null` OI → `null`; symbol absent from contracts → `null`.
- Contracts request failing (500 / network / 429 exhausted) → all quotes returned with `openInterest: null` and one `logger.warn` naming the underlying (AC6-style degradation).
- Quote-less deep-OTM fixture (`greeks: {}`, no `latestQuote`/`latestTrade`) → `'0.00'` prices, no `greeks`, epoch-0 timestamp, sibling entry intact; partial greeks `{ delta: -0.2 }` → omitted; `rho` never emitted; timestamp `'…59.813790162Z'` → `'…59.813Z'`; unparseable key `'BOGUS'` skipped with `debug` (AC8).
- Empty `snapshots` map → `[]` and **no** contracts request (AC7).
- `getOptionSnapshot('AAPL261009P00320000')` → `GET …/v1beta1/options/snapshots?symbols=AAPL261009P00320000&feed=indicative` → `OptionSnapshot` with `openInterest: null`, `volume: 147`, no identity fields; symbol missing from the map → `MarketDataError('not_found', 'Option contract AAPL261009P00320000 not in snapshot')`.

**Green — implementation:**

- Per `contracts/alpaca-market-data.md` and `data-model.md`: `buildChainUrl`, page walk, `mapOptionQuote(snap)` shared by chain and single paths, `parseOccSymbol` for identity, local `computeMid` (bid+ask)/2 `ROUND_HALF_UP` 2dp, `fetchOpenInterest` in `try/catch` with `warn` `alpaca_open_interest_unavailable`; `info` `Alpaca chain snapshot mapped { underlying, contracts, twoSided, withGreeks, oiResolved }`.

**Refactor — cleanup to consider:**

- `TRADING_BASE_URLS` duplicates `ALPACA_BASE_URLS` in `services/settings-connections.ts`; integrations must not import services, so either leave both or hoist to `src/main/integrations/alpaca-hosts.ts` and import from both sides.

**Acceptance criteria covered:** AC3, AC7, AC8.

### 5. `AlpacaMarketDataProvider` — websocket connect, per-symbol stream, disconnect

**Files to create or modify:**

- `src/main/integrations/alpaca-market-data.ts` — `connect`, `stream`, `disconnect`, `supportsStreaming`, frame handling
- `src/main/integrations/alpaca-market-data.test.ts` — `vi.mock('ws')` `MockWs` captured instances (pattern from the Massive test)

**Red — tests to write:**

- `supportsStreaming('stockQuotes')` → true; `'optionQuotes'` / `'optionTrades'` → false.
- `connect()` opens `wss://stream.data.alpaca.markets/v2/iex`; on `[{"T":"success","msg":"connected"}]` sends `{"action":"auth","key":<keyId>,"secret":<secret>}`; resolves on `[{"T":"success","msg":"authenticated"}]`; sends **no** subscribe during connect.
- `connect()` with `loadCredentials()` → `null` rejects `auth_failed` before opening a socket.
- `[{"T":"error","code":402,"msg":"auth failed"}]` → rejects `MarketDataError('auth_failed')` and closes; `409` → `streaming_unsupported`; `406` → `unknown`; socket `error` event → `network_error`; no `authenticated` within 10 s (fake timers) → `network_error` `'auth timeout'` (AC6, AC7).
- After connect, `stream('stockQuotes', ['AAPL','NVDA'])` sends `{"action":"subscribe","bars":["AAPL","NVDA"]}`; a second `stream('stockQuotes', ['NVDA','TSLA'])` sends `{"action":"unsubscribe","bars":["AAPL"]}` then `{"action":"subscribe","bars":["TSLA"]}`; identical set → no frames (AC2).
- `stream()` before the socket is open sends nothing but the returned Observable still filters ticks once frames arrive.
- Frame `[{"T":"b","S":"AAPL","o":319.5,"h":319.9,"l":319.4,"c":319.8,"v":40,"t":"2026-09-04T20:34:00Z","n":1,"vw":319.8}]` → one `StreamEvent { feed: 'stockQuotes', symbol: 'AAPL', data: { price '319.80', bid '319.80', ask '319.80', change '', changePercent '', prevClose '', volume 40, timestamp '2026-09-04T20:34:00.000Z' } }` to a subscriber of `['AAPL']`, none to a subscriber of `['MSFT']`; empty `symbols` receives everything.
- After connect, `[{"T":"error","code":405,"msg":"symbol limit exceeded"}]` → Observable error `{ feed: 'stockQuotes', code: 'symbol_limit', message, reconnectable: false }` (AC6); `406` → `'connection_limit'`.
- Non-JSON frames and unknown `T` values are ignored without throwing.
- `disconnect()` closes the socket, clears the subscribed set (next `stream()` after a fresh `connect()` re-sends the full subscribe list); `disconnect()` with no socket resolves.
- Logged control frames never include the secret.

**Green — implementation:**

- Per `contracts/alpaca-market-data.md` "Outbound websocket" and the state machine in `data-model.md`: `Subject<StreamEvent<StockQuote>>`, `subscribed: Set<string>`, `reconcileSubscriptions(symbols)`, `handleFrames(text)`, `mapBar(frame)`; `info` `alpaca_ws_authenticated`, `debug` `alpaca_ws_subscription`, `info` `alpaca_ws_closed`.

**Refactor — cleanup to consider:**

- Keep frame parsing in small pure functions (`parseFrames`, `mapBar`) at module scope so they are testable without a socket.

**Acceptance criteria covered:** AC2, AC6, AC7.

### 6. Factory, stream restart on credential change, main-process wiring

**Files to create or modify:**

- `src/main/integrations/market-data-factory.ts` — config `{ loadActiveAlpacaCredentials }`, no throw
- `src/main/integrations/market-data-factory.test.ts`
- `src/main/services/market-data.ts` — `StreamState.tickers`, `restartStockQuoteStream(state, provider, onTick, onError)`
- `src/main/services/market-data.test.ts` — **new**
- `src/main/ipc/market-data.ts` — return `{ restartStockQuoteStream: () => Promise<void> }`
- `src/main/ipc/market-data.test.ts`
- `src/main/index.ts` — `marketDataFactory.configure({ loadActiveAlpacaCredentials: () => settings.loadActiveAlpacaCredentials() })`; `onBrokerProviderChanged` also awaits `restartStockQuoteStream()`
- `src/main/ipc/screener.ts` — comment update only
- `src/main/services/screener.test.ts`, `src/main/services/evaluate-alerts.test.ts` — run only

**Red — tests to write:**

- `market-data-factory.test.ts`: `FAKE_MARKET_DATA=true` → `FakeMarketDataProvider` (unchanged); otherwise → `AlpacaMarketDataProvider` **even when** `loadActiveAlpacaCredentials()` returns `null` (no throw); `create()` is cached; `recreate()` rebuilds; default config resolves credentials via `loadAlpacaCredentialsFromEnv`; `disconnect()` delegates to the cached provider.
- `services/market-data.test.ts`: `subscribeToStockQuotes` stores `tickers` on `state`; `restartStockQuoteStream` calls `provider.disconnect()`, sets `connected = false`, then `connect()` once and `stream()` with the stored tickers, forwarding ticks to `onTick`; with stored `[]` it only tears down; a connect failure during restart logs `warn` and resolves (REST-only) (AC5, AC6).
- `ipc/market-data.test.ts`: `registerMarketDataHandlers` returns an object whose `restartStockQuoteStream` re-drives the provider with the last `set-stock-quote-tickers` list and keeps pushing ticks to `webContents.send`; existing 20 cases stay green.
- `screener.test.ts`: existing "provider unavailable when getProvider throws" case still passes and a new case: provider whose `getOptionChainSnapshot` rejects `MarketDataError('auth_failed')` for every ticker → `provider_unavailable` (AC4).

**Green — implementation:**

- Factory per `contracts/alpaca-market-data.md` "Factory"; remove the thrown message.
- `StreamState` + `restartStockQuoteStream` per `data-model.md` "Credential change"; `info` `stock_quote_stream_restarted { tickers }`.
- `registerMarketDataHandlers` captures `onTick`/`onError` closures once and exposes the restart; `index.ts` calls it from `onBrokerProviderChanged` after `brokerFactory.recreate()`, `void`-ing the promise with a `warn` on rejection.

**Refactor — cleanup to consider:**

- `screenWatchlistCandidates`' `try { getProvider() }` guard is still valid (fake path) — update the comment, do not remove the guard.

**Acceptance criteria covered:** AC4, AC5, AC6, AC10.

### 7. Settings contract — `CredentialStatus.marketData`, Alpaca-only connection test

**Files to create or modify:**

- `src/main/services/settings.ts` — drop `massive`, `massiveLastCheckedAt`, `loadMassiveApiKey` option; add `marketData`
- `src/main/services/settings.test.ts`
- `src/main/services/settings-connections.ts` — delete `testMassiveConnection`, `MASSIVE_BASE_URL`, the `massive` result variant
- `src/main/services/settings-connections.test.ts`
- `src/main/schemas.ts` — `TestConnectionPayloadSchema` Alpaca-only
- `src/main/ipc/settings.ts` (+ test) — debug log no longer branches on vendor
- `src/main/index.ts` — `createSettingsService` without `loadMassiveApiKey`; `runSettingsConnectionTest` / `runMockSettingsConnectionTest` without the `massive` branch; `MockSettingsConnectionConfig` without `massive`
- `src/preload/index.d.ts`, `src/renderer/src/api/settings.ts` — mirrored types

**Red — tests to write:**

- `settings.test.ts`: `getCredentialStatus().marketData` is `'configured'` when an active environment has credentials and `'missing'` when `activeBrokerEnv === 'none'`; the object has no `massive` key; the "reads Massive status from shared app configuration" case is deleted.
- `settings-connections.test.ts`: no `testMassiveConnection` export (compile-time); Alpaca cases unchanged.
- `ipc/settings.test.ts`: `settings:test-connection` with `{ vendor: 'massive' }` → `ok: false` Zod error; Alpaca payload path unchanged.

**Green — implementation:**

- Per `contracts/settings-credential-status.md`.

**Refactor — cleanup to consider:**

- `TestConnectionPayloadSchema` no longer needs `z.discriminatedUnion`; a plain `z.object` with `vendor: z.literal('alpaca')` keeps the renderer's discriminant.

**Acceptance criteria covered:** AC9.

### 8. Renderer — Alpaca-only copy and status

**Files to create or modify:**

- `src/renderer/src/App.tsx`, `components/MarketDataStatusDot.tsx` (+ tests) — prop `marketData`, title `Market data: connected via Alpaca` / `Market data: connect Alpaca in Settings`
- `pages/SettingsPage.tsx` (+ test) — remove `massiveMessage`, `handleMassiveTestConnection`, the Test connection button; region "Market Data — Alpaca"; `isEmptyState = alpacaPaper === 'missing' && alpacaLive === 'missing'`
- `pages/PositionsListPage.tsx` (+ test) — drop `showMassiveSetupBanner`; no-broker banner copy; `marketAuthPrompt` copy
- `components/LiveBrokerConfirmDialog.tsx` (+ test) — market-data line
- `pages/ScreenerPage.tsx` (+ `ScreenerStateCard.test.tsx` / `ScreenerPage.test.tsx`) — outage card body
- hook tests mentioning Massive (`useStockQuotes.test.ts`, `usePromotedQuote.test.ts`, `useMarketStatusDisplay.test.ts`, `App.test.tsx`) — fixture strings

**Red — tests to write:**

- `SettingsPage.test.tsx`: Market Data region text contains `Market Data — Alpaca`, `Stock prices (IEX, real-time), option quotes (indicative) and Greeks come from Alpaca's free data feeds using your active broker credentials.`; with `activeBrokerEnv: 'paper'` contains `Using paper credentials`; with `'none'` contains `Connect Alpaca below to enable market data`; no button named `Test connection` inside the Market Data region; `Refresh IVR now` still present; empty-state `AlertBox` reads `Connect Alpaca to enable market data, buying power and broker activities.` and renders only when both Alpaca environments are missing.
- `MarketDataStatusDot.test.tsx`: `marketData: 'configured'` → connected styling and title `Market data: connected via Alpaca`; `'missing'` → `Market data: connect Alpaca in Settings`.
- `PositionsListPage.test.tsx`: no "Massive is app-provided" text in any state; `activeBrokerEnv: 'none'` shows `Connect Alpaca to enable market data, broker activity and buying power.`; a stream error with `code: 'auth_failed'` shows `Alpaca authentication failed — check your key in Settings` exactly once even when the broker status also failed with `auth_failed`.
- `LiveBrokerConfirmDialog.test.tsx`: shows `Market data reconnects with your live keys — same Alpaca feeds, same prices.`
- `ScreenerStateCard` / `ScreenerPage.test.tsx`: unavailable card body `Alpaca market data couldn't be reached on the last refresh. Candidates can't be scored until chain data is available.`

**Green — implementation:**

- Copy exactly as asserted above; Tailwind + `wb-*` tokens only; dedupe the two auth prompts into one `authPrompt` derived from either source.

**Refactor — cleanup to consider:**

- `useSettingsStatus` default object in `SettingsPage.tsx` shrinks by two fields; check no other component destructures `massive`.

**Acceptance criteria covered:** AC4 (banner), AC9.

### 9. Remove Massive

**Files to create or modify (delete unless noted):**

- `src/main/integrations/massive-market-data.ts`, `massive-market-data.test.ts`, `massive-credentials.ts`, `massive-credentials.test.ts`
- `src/main/env.d.ts` — remove `MAIN_VITE_MASSIVE_API_KEY`
- `.env.example` — remove the Massive block; extend the Alpaca block: keys also serve market data (IEX stocks, indicative options); note `FAKE_MARKET_DATA=true` bypasses it
- `src/main/integrations/alpaca.ts` — deprecation comments name `AlpacaMarketDataProvider`
- `e2e/settings-environment.spec.ts`, `e2e/provider-split.spec.ts` — `massiveApiKey` option, `MASSIVE_API_KEY` env, `DEFAULT_CONNECTION_MOCKS.massive` removed (test bodies rewritten in Area 10)

**Red — tests to write:**

- `pnpm typecheck` and `pnpm vitest run` green after deletion — the removal is verified by the compiler plus a `grep -rni massive src e2e .env.example` returning nothing (assert in the PR checklist, not a test file).

**Green — implementation:**

- Delete the files; fix every import the compiler reports; update `.env.example` and comments.

**Refactor — cleanup to consider:**

- `@msgpack/msgpack` in `package.json` is already unused; removing it is optional and not part of this story.

**Acceptance criteria covered:** AC9.

### 10. E2e Tests

**Files to create or modify:**

- `e2e/settings-environment.spec.ts` — rewrite Massive-named scenarios
- `e2e/provider-split.spec.ts` — rename two tests, drop the `it.todo`s that name Massive
- (run only) `e2e/screener-results.spec.ts`, `e2e/live-underlying-price.spec.ts`, `e2e/option-pnl.spec.ts`, and the full suite

**Red — tests to write:**

- `Settings names Alpaca as the market-data source` (AC9): Market Data region contains `Market Data — Alpaca` and `Connect Alpaca below to enable market data` with no credentials; after `saveAlpacaViaApi` + `setActiveEnvironmentViaApi('paper')` contains `Using paper credentials`; region has no `Test connection` button; `Refresh IVR now` present. Replaces "Settings page surfaces Massive status…".
- `Market data is enabled by the active Alpaca credentials` (AC10 regression, replaces "Shared Massive configuration enables market data"): fixtures render `$182.45` / `$3.60`.
- `Empty-state on first launch shows the Connect Alpaca banner and dashes` (AC4): body contains `Connect Alpaca to enable market data, broker activity and buying power.`, link `Alpaca setup` → `#/settings`, price and opt-mid cells `—`; body does **not** contain `Massive`.
- `Positions auth prompt names Alpaca` (AC9, replaces "Shared Massive auth failure…"): trigger stream error `auth_failed` with message `Alpaca authentication failed — check your key in Settings`; stale banner appears; text present once.
- `Expired Alpaca credentials surface a re-entry prompt` (rename): same flow with the new message.
- `LIVE confirmation says market data reconnects with live keys` (AC9): dialog contains `Market data reconnects with your live keys — same Alpaca feeds, same prices.` (replaces the "unaffected — Massive" assertion in "Switching broker environment to LIVE requires confirmation").
- `Switching broker environment restarts market data with the new keys` (AC5): seed a position, switch to LIVE via the dialog, assert the price cell still shows the fixture price and `NO BROKER` is gone — proves the restart path did not drop the stream state.
- `Screener outage card names Alpaca` (AC9): in `screener-results.spec.ts` or a new case in `settings-environment.spec.ts`, launch with `FAKE_MARKET_DATA_ERROR=auth_failed`, open the screener, assert `Alpaca market data couldn't be reached on the last refresh.`
- `provider-split.spec.ts`: rename "Missing API key surfaces a typed error" → `Market-data auth failure surfaces a typed error` (AC7); delete "Massive 401/403 surfaces auth error" (duplicate injection path) and the two Massive `it.todo`s; update the header comment to name US-99.
- "Market data is independent of broker configuration" → rename to `Market data fixtures render without a broker account` and keep assertions (fake path).
- "Test connection for Massive uses a fixed reference probe" → delete.

**Green — implementation:**

- Only copy from Areas 7–8 and the factory from Area 6 are needed; the rest is fixture/env cleanup (`buildEnv` drops `MASSIVE_API_KEY`).

**Refactor — cleanup to consider:**

- `LaunchOptions.massiveApiKey` removal touches ~20 call sites; a `launchApp(dbPath, { stockQuotes, optionSnapshots })` helper already exists — just delete the field.

**Acceptance criteria covered:** AC4, AC5, AC7, AC9, AC10 at the e2e level.

## Post-implementation

- Run the CLAUDE.md checklist (`pnpm vitest run` / `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm format`), then `pnpm test:e2e`.
- Manual smoke per `quickstart.md` against live Alpaca once; record request counts and the
  websocket handshake lines in the PR description. Cancel the Massive plans afterwards.
- `/update-spec us-99` — supersede `shared-massive-app-configuration`; amend
  `runtime-broker-provider-refresh` (broker changes now restart the stock stream),
  `market-data-provider-interface`, `market-data-provider-lifecycle`,
  `marketdataerror-structured-codes` (websocket 402/409 producers), `market-data-stream-with-rest-seed`
  (IEX for both paths), `alpaca-sdk-rest-only` (market data uses raw `fetch`, not the SDK);
  update `domain/market-data.md`, `contracts/alpaca-integration.md`, `contracts/ipc-handlers.md`
  (`CredentialStatus`, `TestConnectionPayload`); add a US-99 feature page; mark
  `features/market-data-massive-migration.md` as superseded.
- Follow-ups surfaced, not in scope: screener empty-state copy when strikes were merely
  unquoted; websocket auto-reconnect; streaming `quotes` for live bid/ask; `@msgpack/msgpack`
  dependency removal.

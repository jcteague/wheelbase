# US-99 — Alpaca as the sole market-data provider (retire Massive) — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off
- Areas 3, 4 and 5 all build `src/main/integrations/alpaca-market-data.ts` and its test file, so they are strictly sequential (Layers 2 → 3 → 4), never parallel
- `src/main/index.ts` is edited by Areas 6, 7 and 9. Area 7 touches only the settings-service options and the connection-test dispatcher; Area 6 touches only factory configuration and the broker-changed callback; Area 9 removes the Massive imports. Keep to those regions to avoid merge conflicts
- Do not run `pnpm test` while a `pnpm dev` session is open — its `pretest` rebuilds `better-sqlite3` for system Node. Use `pnpm vitest run <file>` instead (see `quickstart.md`)

Reference documents: `plan.md` (areas + derived ACs), `research.md` (ADRs), `data-model.md` (mappings, fixtures, state machines), `contracts/alpaca-market-data.md`, `contracts/settings-credential-status.md`, `quickstart.md`.

---

## Layer 1 — Foundation (no cross-area dependencies)

> These three areas can be started immediately and run in parallel.

### Area 1 — Shared OCC parser

- [x] **[Red]** Write failing tests — `src/main/core/option-symbol.test.ts`
  - Test cases (`describe('parseOccSymbol')`):
    - `'AAPL261009P00320000'` → `{ underlying: 'AAPL', contractId: 'AAPL261009P00320000', strike: '320.0000', expiration: '2026-10-09', contractType: 'put' }`
    - `'SPY260604C00750000'` → `contractType: 'call'`, `strike: '750.0000'`
    - `'NVDA261016P00012500'` → `strike: '12.5000'`
    - returns `null` for `'NOT_AN_OCC'`, `'O:AAPL261009P00320000'`, `''`
  - Import from `'../../shared/option-symbol'` (alongside the existing `buildOccSymbol` tests)
  - Run `pnpm vitest run src/main/core/option-symbol.test.ts` — all new tests must fail (export missing)
- [x] **[Green]** Implement — `src/shared/option-symbol.ts`, `src/main/core/option-symbol.ts`, `src/main/integrations/fake-market-data.ts` _(depends on: Area 1 Red ✓)_
  - Move `OCC_SYMBOL` regex and derivation out of `fake-market-data.ts` into `src/shared/option-symbol.ts`; export `type OccIdentity = { underlying, contractId, strike, expiration, contractType }` and `parseOccSymbol(symbol: string): OccIdentity | null` (flat shape — see `data-model.md` "OccIdentity"); no I/O imports (file is shared with the renderer)
  - Re-export `parseOccSymbol`, `OccIdentity` from `src/main/core/option-symbol.ts`
  - In `fake-market-data.ts` replace the private parser with the shared one: `const { underlying, ...quoteFields } = identity`
  - Run `pnpm vitest run src/main/core/option-symbol.test.ts src/main/integrations/fake-market-data.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/shared/option-symbol.ts`, `src/main/integrations/fake-market-data.ts` _(depends on: Area 1 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - `grep -rn "\[PC\]" src` — confirm no other OCC regex remains
  - Run `pnpm vitest run src/main/core src/main/integrations/fake-market-data.test.ts && pnpm lint && pnpm typecheck`

### Area 2 — Shared env credential loader

- [x] **[Red]** Write failing tests — `src/main/integrations/alpaca-credentials.test.ts`
  - Test cases (`describe('loadAlpacaCredentialsFromEnv')`, stub `process.env` per test):
    - `ALPACA_KEY_ID` + `ALPACA_SECRET_KEY` + `ALPACA_PAPER=true` → `{ keyId, secret, environment: 'paper' }`
    - `ALPACA_PAPER=false` → `environment: 'live'`
    - `ALPACA_PAPER` unset → `environment: 'live'` (today's broker-factory default)
    - key id missing → `null`; secret empty string → `null`
  - Run `pnpm vitest run src/main/integrations/alpaca-credentials.test.ts` — all new tests must fail (module missing)
- [x] **[Green]** Implement — `src/main/integrations/alpaca-credentials.ts`, `src/main/integrations/broker-factory.ts` _(depends on: Area 2 Red ✓)_
  - `export function loadAlpacaCredentialsFromEnv(): AlpacaCredentials | null` — move the inline default loader from `broker-factory.ts` verbatim (`import type { AlpacaCredentials } from '../services/settings'`)
  - `brokerFactory` default config becomes `loadActiveAlpacaCredentials: loadAlpacaCredentialsFromEnv`
  - Run `pnpm vitest run src/main/integrations/alpaca-credentials.test.ts src/main/integrations/broker-factory.test.ts` — all tests must pass (broker-factory's existing four cases unchanged)
- [x] **[Refactor]** `/refactor` — `src/main/integrations/alpaca-credentials.ts` _(depends on: Area 2 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm vitest run src/main/integrations && pnpm lint && pnpm typecheck`

### Area 7 — Settings contract: `CredentialStatus.marketData`, Alpaca-only connection test

- [x] **[Red]** Write failing tests — `src/main/services/settings.test.ts`, `src/main/ipc/settings.test.ts`, `src/main/services/settings-connections.test.ts`
  - `settings.test.ts`: `getCredentialStatus().marketData === 'configured'` when the active environment has credentials; `'missing'` when `activeBrokerEnv === 'none'`; `expect(status).not.toHaveProperty('massive')`; delete the case "reads Massive status from shared app configuration without creating a credential row"; `createService()` helper no longer passes `loadMassiveApiKey`
  - `ipc/settings.test.ts`: `settings:test-connection` with `{ vendor: 'massive' }` → `ok: false` with a Zod error; Alpaca payload path unchanged
  - `settings-connections.test.ts`: remove any `testMassiveConnection` cases; Alpaca cases unchanged
  - Run `pnpm vitest run src/main/services/settings.test.ts src/main/ipc/settings.test.ts src/main/services/settings-connections.test.ts` — new/changed tests must fail
- [x] **[Green]** Implement — `src/main/services/settings.ts`, `src/main/services/settings-connections.ts`, `src/main/schemas.ts`, `src/main/ipc/settings.ts`, `src/main/index.ts` (settings region only), `src/preload/index.d.ts`, `src/renderer/src/api/settings.ts` _(depends on: Area 7 Red ✓)_
  - `CredentialStatus`: remove `massive`, `massiveLastCheckedAt`; add `marketData: CredentialState = activeBrokerEnv !== 'none' ? 'configured' : 'missing'`; remove `loadMassiveApiKey` from `SettingsServiceOptions` (see `contracts/settings-credential-status.md`)
  - `settings-connections.ts`: delete `testMassiveConnection`, `TestMassiveConnectionOptions`, `MASSIVE_BASE_URL`, and the `{ ok: true; vendor: 'massive' }` result variant
  - `schemas.ts`: `TestConnectionPayloadSchema = z.object({ vendor: z.literal('alpaca'), environment, keyId, secret })`
  - `ipc/settings.ts`: debug log no longer branches on vendor
  - `index.ts`: `createSettingsService({...})` without `loadMassiveApiKey`; `runSettingsConnectionTest` / `runMockSettingsConnectionTest` drop the `massive` branch; `MockSettingsConnectionConfig` drops `massive`; leave the `marketDataFactory.configure({ loadMassiveApiKey })` line alone (Area 6 owns it)
  - Mirror the two type changes in `src/preload/index.d.ts` and `src/renderer/src/api/settings.ts` (renderer components still compile because they read `massive` — Area 8 fixes them; expect `pnpm typecheck` to fail in the renderer until Area 8 lands, which is why Area 8 is in the next layer)
  - Run `pnpm vitest run src/main/services/settings.test.ts src/main/ipc/settings.test.ts src/main/services/settings-connections.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/settings.ts`, `src/main/services/settings-connections.ts` _(depends on: Area 7 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm vitest run src/main/services src/main/ipc && pnpm lint` (`pnpm typecheck` for `src/main` via `npm run typecheck:node`; the web typecheck is expected to fail until Area 8)

---

## Layer 2 — Provider REST skeleton + renderer copy (depends on Layer 1)

> Area 3 needs nothing from Layer 1 but is placed here so the provider file is built in one uninterrupted sequence (3 → 4 → 5). Area 8 needs Area 7 Green.

### Area 3 — `AlpacaMarketDataProvider`: REST plumbing and stock snapshots

- [x] **[Red]** Write failing tests — `src/main/integrations/alpaca-market-data.test.ts`
  - Scaffold: copy `fetchOk` / `fetchErr` helpers and the `vi.stubGlobal('fetch', mockFetch)` setup from `massive-market-data.test.ts`; `createProvider(creds = PAPER_CREDS)` builds `new AlpacaMarketDataProvider({ loadCredentials: vi.fn(() => creds) })`
  - Test cases (`describe('getStockQuotes')`):
    - `['AAPL','MSFT']` → exactly one `GET https://data.alpaca.markets/v2/stocks/snapshots?symbols=AAPL,MSFT&feed=iex`; request headers `APCA-API-KEY-ID` / `APCA-API-SECRET-KEY` equal the loaded credentials; `loadCredentials` call count grows on the next request
    - `[]` → no fetch, empty `Map`
    - Live AAPL fixture (see `data-model.md` "Stock snapshots") → `price '319.80'`, `bid '305.33'`, `ask '338.27'`, `prevClose '328.22'`, `change '-8.42'`, `changePercent '-2.5653'`, `volume 1224559`, `timestamp '2026-09-04T20:34:14.232Z'`
    - symbol absent from the response is absent from the `Map`; snapshot without `latestTrade` is skipped with `logger.debug` and the sibling symbol is returned
    - missing `latestQuote` → `bid === ask === price`; missing `prevDailyBar` → `prevClose ''`, `change ''`, `changePercent ''`
    - `loadCredentials()` → `null` → `MarketDataError('auth_failed', 'Alpaca credentials not configured')`, `fetch` not called
  - Test cases (`describe('apiFetch error mapping')` via `getStockQuotes`): 401 → `auth_failed` `'HTTP 401'`; 403 → `auth_failed`; 404 → `not_found`; 400 → `unknown`; 500 → `unknown`; 429 `Retry-After: 0` then 200 → success after 2 calls; 429 ×3 → `rate_limited` after exactly 3 calls (fake timers); fetch rejects `{ cause: { code: 'ENOTFOUND' } }` → `network_error`; rejects `Error('boom')` → `unknown`
  - No `logger.debug` payload contains the secret string
  - Run `pnpm vitest run src/main/integrations/alpaca-market-data.test.ts` — all new tests must fail (module missing)
- [x] **[Green]** Implement — `src/main/integrations/alpaca-market-data.ts` _(depends on: Area 3 Red ✓)_
  - `export type AlpacaMarketDataConfig = { loadCredentials: () => AlpacaCredentials | null }`; `export class AlpacaMarketDataProvider implements MarketDataProvider` with stubs for the option and stream methods (throw `MarketDataError('unknown', 'not implemented')` for now so the class satisfies the interface)
  - Constants per `data-model.md`: `DATA_BASE_URL`, `STOCK_FEED = 'iex'`, `MAX_RETRIES = 2`
  - `private credentials(): AlpacaCredentials` — throws `auth_failed` on `null`
  - `private async apiFetch(url: string, retryCount = 0): Promise<unknown>` — header auth, `isNetworkError` → `network_error`, 401/403 → `auth_failed`, 429 retry with `Retry-After` seconds (default 1000 ms) then `rate_limited`, 404 → `not_found`, other non-ok → `unknown`; `logger.debug({ url, retryCount }, 'alpaca_api_request')` / `({ url, status }, 'alpaca_api_response')`
  - `getStockQuotes(tickers)` — one batched request; `mapStockSnapshot(symbol, snap): StockQuote | null` per `data-model.md` "Mapping onto `StockQuote` (REST seed)"; skip + `debug` when `latestTrade` absent
  - Run `pnpm vitest run src/main/integrations/alpaca-market-data.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/integrations/alpaca-market-data.ts` _(depends on: Area 3 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Keep mapping helpers as module-scope pure functions; do not extract a shared HTTP helper (Massive is deleted in Area 9)
  - Run `pnpm vitest run src/main/integrations && pnpm lint && npm run typecheck:node`

### Area 8 — Renderer: Alpaca-only copy and status

**Requires:** Area 7 Green ✓ (renderer `CredentialStatus` type)

- [x] **[Red]** Write failing tests — `src/renderer/src/pages/SettingsPage.test.tsx`, `src/renderer/src/components/MarketDataStatusDot.test.tsx`, `src/renderer/src/pages/PositionsListPage.test.tsx`, `src/renderer/src/components/LiveBrokerConfirmDialog.test.tsx`, `src/renderer/src/pages/ScreenerPage.test.tsx` (or `ScreenerStateCard.test.tsx`) _(depends on: Area 7 Green ✓)_
  - `SettingsPage.test.tsx`: Market Data region contains `Market Data — Alpaca` and `Stock prices (IEX, real-time), option quotes (indicative) and Greeks come from Alpaca's free data feeds using your active broker credentials.`; `activeBrokerEnv: 'paper'` → contains `Using paper credentials`; `'none'` → contains `Connect Alpaca below to enable market data`; no `Test connection` button inside the Market Data region; `Refresh IVR now` still present; empty-state `AlertBox` text `Connect Alpaca to enable market data, buying power and broker activities.` renders only when both `alpacaPaper` and `alpacaLive` are `'missing'`
  - `MarketDataStatusDot.test.tsx`: prop `marketData: 'configured'` → connected styling, title `Market data: connected via Alpaca`; `'missing'` → title `Market data: connect Alpaca in Settings`
  - `PositionsListPage.test.tsx`: no `Massive is app-provided` text in any state; `activeBrokerEnv: 'none'` → `Connect Alpaca to enable market data, broker activity and buying power.`; stream error `code: 'auth_failed'` → `Alpaca authentication failed — check your key in Settings` rendered exactly once even when the broker status also errored `auth_failed`
  - `LiveBrokerConfirmDialog.test.tsx`: contains `Market data reconnects with your live keys — same Alpaca feeds, same prices.` (replace the "unaffected — Massive" assertion)
  - Screener test: unavailable card body `Alpaca market data couldn't be reached on the last refresh. Candidates can't be scored until chain data is available.`
  - Update fixture strings mentioning Massive in `useStockQuotes.test.ts`, `usePromotedQuote.test.ts`, `useMarketStatusDisplay.test.ts`, `App.test.tsx`
  - Run `pnpm vitest run src/renderer/src/pages/SettingsPage.test.tsx src/renderer/src/components/MarketDataStatusDot.test.tsx src/renderer/src/pages/PositionsListPage.test.tsx src/renderer/src/components/LiveBrokerConfirmDialog.test.tsx src/renderer/src/pages/ScreenerPage.test.tsx` — new/changed tests must fail
- [x] **[Green]** Implement — `src/renderer/src/App.tsx`, `components/MarketDataStatusDot.tsx`, `pages/SettingsPage.tsx`, `pages/PositionsListPage.tsx`, `components/LiveBrokerConfirmDialog.tsx`, `pages/ScreenerPage.tsx` _(depends on: Area 8 Red ✓)_
  - `App.tsx` reads `data?.marketData ?? 'missing'` and passes `marketData` to `MarketDataStatusDot`; dot titles as asserted
  - `SettingsPage.tsx`: delete `massiveMessage` state, `handleMassiveTestConnection`, the Test connection button and its `MessageText`; default status object drops `massive` / `massiveLastCheckedAt`, adds `marketData: 'missing'`; `isEmptyState = alpacaPaper === 'missing' && alpacaLive === 'missing'`; region header `Market Data — Alpaca`; explanatory `<p>` and status line (`Using {env} credentials` / `Connect Alpaca below to enable market data`) driven by `activeStatus.activeBrokerEnv`; keep `Refresh IVR now`; keep the literal text `Shared app configuration` **out** — the e2e assertion on it is rewritten in Area 10
  - `PositionsListPage.tsx`: remove `showMassiveSetupBanner` and its JSX; no-broker banner copy `Connect Alpaca to enable market data, broker activity and buying power.`; single `authPrompt = (streamAuthFailed || brokerAuthFailed) ? 'Alpaca authentication failed — check your key in Settings' : null`
  - `LiveBrokerConfirmDialog.tsx` line → `Market data reconnects with your live keys — same Alpaca feeds, same prices.`
  - `ScreenerPage.tsx` unavailable card body → `Alpaca market data couldn't be reached on the last refresh. Candidates can't be scored until chain data is available.`
  - Tailwind + `wb-*` tokens only; no inline styles
  - Run `pnpm vitest run src/renderer` — all tests must pass; `npm run typecheck:web` — clean
- [x] **[Refactor]** `/refactor` — `src/renderer/src/pages/SettingsPage.tsx`, `src/renderer/src/pages/PositionsListPage.tsx` _(depends on: Area 8 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - `grep -rn massive src/renderer` → only nothing or test fixtures being rewritten in Area 10
  - Run `pnpm vitest run src/renderer && pnpm lint && pnpm typecheck`

---

## Layer 3 — Provider options + open interest (depends on Layer 2)

### Area 4 — `AlpacaMarketDataProvider`: option chain, open interest, single snapshot

**Requires:** Area 1 Green ✓ (`parseOccSymbol`), Area 3 Green ✓ (`apiFetch`, class skeleton)

- [x] **[Red]** Write failing tests — `src/main/integrations/alpaca-market-data.test.ts` _(depends on: Area 1 Green ✓, Area 3 Green ✓)_
  - Fixtures from `data-model.md`: ATM put `AAPL261009P00320000` snapshot; deep-OTM put with `greeks: {}` and no `latestQuote` / `latestTrade`; contracts rows `{ symbol: 'AAPL261009P00320000', open_interest: '8' }`, `{ symbol: 'AAPL261009P00110000', open_interest: null }`
  - Test cases (`describe('getOptionChainSnapshot')`):
    - `{ underlying: 'AAPL', type: 'put', expirationFrom: '2026-10-06', expirationTo: '2026-10-21' }` → first request `https://data.alpaca.markets/v1beta1/options/snapshots/AAPL?…` with params `feed=indicative`, `type=put`, `expiration_date_gte=2026-10-06`, `expiration_date_lte=2026-10-21`, `limit=1000`, no `page_token`
    - `strikeFrom/To` → `strike_price_gte/lte`; `limit: 50` → `limit=50` and single page despite `next_page_token`; `cursor: 'abc'` → `page_token=abc`; `limit: 5000` → `limit=1000`
    - pagination: `next_page_token: 'p2'` then `null` → two chain requests, second with `page_token=p2`, results concatenated in order
    - after a non-empty chain: contracts request `https://paper-api.alpaca.markets/v2/options/contracts?underlying_symbols=AAPL&type=put&expiration_date_gte=…&expiration_date_lte=…&limit=10000` with the same auth headers; `environment: 'live'` → host `https://api.alpaca.markets`; contracts `next_page_token` followed; `mockFetch.mock.calls[0]` is the data host (chain precedes contracts)
    - ATM fixture + OI `'8'` → exactly the worked-example object in `data-model.md` (`openInterest: 8` number); `null` OI → `null`; symbol absent from contracts → `null`
    - contracts request fails (500 / network / 429 exhausted) → quotes returned with `openInterest: null` everywhere and one `logger.warn` containing `AAPL`
    - deep-OTM fixture → `bid '0.00'`, `ask '0.00'`, `mid '0.00'`, `lastTrade '0.00'`, no `greeks`, `timestamp '1970-01-01T00:00:00.000Z'`, `volume` from `dailyBar.v`; sibling ATM entry intact
    - partial greeks `{ delta: -0.2 }` → `greeks` omitted; `rho` never emitted; `impliedVolatility` omitted when absent
    - timestamp `'2026-09-04T19:59:59.813790162Z'` → `'2026-09-04T19:59:59.813Z'`
    - unparseable key `'BOGUS'` skipped with `logger.debug`; other entries returned
    - empty `snapshots` map → `[]` and no contracts request
  - Test cases (`describe('getOptionSnapshot')`):
    - `'AAPL261009P00320000'` → `GET https://data.alpaca.markets/v1beta1/options/snapshots?symbols=AAPL261009P00320000&feed=indicative` → `OptionSnapshot` with `openInterest: null`, `volume: 147`, and `contractId` / `strike` / `expiration` / `contractType` all `undefined`
    - symbol missing from the map → `MarketDataError('not_found', 'Option contract AAPL261009P00320000 not in snapshot')`
    - `loadCredentials()` → `null` → `auth_failed`, no fetch
  - Run `pnpm vitest run src/main/integrations/alpaca-market-data.test.ts` — new tests must fail
- [x] **[Green]** Implement — `src/main/integrations/alpaca-market-data.ts` _(depends on: Area 4 Red ✓)_
  - Constants `OPTION_FEED = 'indicative'`, `CHAIN_PAGE_SIZE = 1000`, `CONTRACTS_PAGE_SIZE = 10000`, `TRADING_BASE_URLS`
  - `buildChainUrl(filter, pageToken?)` per the parameter table in `data-model.md`; page walk when `filter.limit` is undefined, single page otherwise
  - `mapOptionQuote(snap): OptionSnapshot` (shared by chain and single paths) — `computeMid` (bid+ask)/2 `ROUND_HALF_UP` 2dp, complete-greeks guard, IV guard, `dailyBar?.v ?? null`, normalised timestamp
  - `mapChainEntry(key, snap, oi)` using `parseOccSymbol`; skip + `debug` on `null`
  - `fetchOpenInterest(filter, credentials): Promise<Map<string, number | null>>` paginating `option_contracts`; called inside `try/catch` in `getOptionChainSnapshot`; on failure `logger.warn({ underlying, err }, 'alpaca_open_interest_unavailable')` and an empty map
  - `logger.info({ underlying, contracts, twoSided, withGreeks, oiResolved }, 'Alpaca chain snapshot mapped')`
  - `getOptionSnapshot(contractId)` via `?symbols=`; `not_found` when absent
  - Run `pnpm vitest run src/main/integrations/alpaca-market-data.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/integrations/alpaca-market-data.ts` _(depends on: Area 4 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Decide on `TRADING_BASE_URLS` vs `ALPACA_BASE_URLS` in `settings-connections.ts`: leave both, or hoist to `src/main/integrations/alpaca-hosts.ts` and import from both (integrations must not import services)
  - Run `pnpm vitest run src/main/integrations && pnpm lint && npm run typecheck:node`

---

## Layer 4 — Provider websocket (depends on Layer 3)

### Area 5 — `AlpacaMarketDataProvider`: websocket connect, per-symbol stream, disconnect

**Requires:** Area 4 Green ✓ (same file)

- [x] **[Red]** Write failing tests — `src/main/integrations/alpaca-market-data.test.ts` _(depends on: Area 4 Green ✓)_
  - Scaffold: copy the `vi.mock('ws')` `MockWs` class + `mockWsInstances` capture from `massive-market-data.test.ts`; helper `serverSends(ws, frames)` emits `'message'` with `JSON.stringify(frames)`
  - Test cases (`describe('streaming')`):
    - `supportsStreaming('stockQuotes')` → `true`; `'optionQuotes'`, `'optionTrades'` → `false`
    - `connect()` constructs `WebSocket('wss://stream.data.alpaca.markets/v2/iex')`; after `[{"T":"success","msg":"connected"}]` sends `{"action":"auth","key":<keyId>,"secret":<secret>}`; resolves on `[{"T":"success","msg":"authenticated"}]`; sends no subscribe during connect
    - `connect()` with `loadCredentials()` → `null` rejects `auth_failed` and constructs no socket
    - `[{"T":"error","code":402,"msg":"auth failed"}]` → rejects `MarketDataError('auth_failed')` and calls `close()`; `409` → `streaming_unsupported`; `406` → `unknown`; socket `'error'` event → `network_error`; no `authenticated` within 10 s (fake timers) → `network_error` with message `auth timeout`
    - after connect, `stream('stockQuotes', ['AAPL','NVDA'])` sends `{"action":"subscribe","bars":["AAPL","NVDA"]}`; then `stream('stockQuotes', ['NVDA','TSLA'])` sends `{"action":"unsubscribe","bars":["AAPL"]}` then `{"action":"subscribe","bars":["TSLA"]}`; identical set → no frames sent
    - `stream()` before connect sends nothing; the returned Observable still receives matching ticks once frames arrive
    - frame `[{"T":"b","S":"AAPL","o":319.5,"h":319.9,"l":319.4,"c":319.8,"v":40,"t":"2026-09-04T20:34:00Z","n":1,"vw":319.8}]` → one `StreamEvent { feed: 'stockQuotes', symbol: 'AAPL', data: { price '319.80', bid '319.80', ask '319.80', change '', changePercent '', prevClose '', volume 40, timestamp '2026-09-04T20:34:00.000Z' } }` to a `['AAPL']` subscriber; none to `['MSFT']`; `[]` subscriber receives everything
    - after connect, `[{"T":"error","code":405,"msg":"symbol limit exceeded"}]` → Observable `error` with `{ feed: 'stockQuotes', code: 'symbol_limit', message: 'symbol limit exceeded', reconnectable: false }`; `406` → `code: 'connection_limit'`; other → `'unknown'`
    - non-JSON frame and unknown `T` are ignored without throwing
    - `disconnect()` calls `close()`, clears the subscribed set (a fresh `connect()` + `stream(['AAPL'])` re-sends the full subscribe list); `disconnect()` without a socket resolves
    - logged control frames (`logger.debug` / `logger.info` payloads) never include the secret
  - Run `pnpm vitest run src/main/integrations/alpaca-market-data.test.ts` — new tests must fail
- [x] **[Green]** Implement — `src/main/integrations/alpaca-market-data.ts` _(depends on: Area 5 Red ✓)_
  - Constants `STREAM_URL`, `AUTH_TIMEOUT_MS = 10_000`; state `ws: WebSocket | null`, `subscribed: Set<string>`, `tickSubject: Subject<StreamEvent<StockQuote>>`
  - Module-scope pure helpers: `parseFrames(text): AlpacaWsFrame[]` (returns `[]` on bad JSON), `mapBar(frame): StreamEvent<StockQuote>`, `classifyStreamError(code): StreamError['code']`, `connectError(frame): MarketDataError` (402 → `auth_failed`, 409 → `streaming_unsupported`, else `unknown`)
  - `connect()` per the state machine in `data-model.md` and the table in `contracts/alpaca-market-data.md`; `logger.info('alpaca_ws_authenticated')`, `logger.debug({ bars }, 'alpaca_ws_subscription')`, `logger.info('alpaca_ws_closed')`
  - `stream(feed, symbols)`: `reconcileSubscriptions(symbols)` sends unsubscribe/subscribe diffs only when `ws?.readyState === OPEN`; returns `tickSubject.pipe(filter(...))`
  - Post-auth `error` frames → `tickSubject.error(streamError)`; `close` → `ws = null`, `subscribed.clear()`
  - `disconnect()` closes and clears
  - Run `pnpm vitest run src/main/integrations/alpaca-market-data.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/integrations/alpaca-market-data.ts` _(depends on: Area 5 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - The file now covers REST + websocket; if it exceeds ~400 lines consider splitting the pure mappers into `alpaca-market-data-mappers.ts` (keep the class in one file)
  - Run `pnpm vitest run src/main/integrations && pnpm lint && npm run typecheck:node`

---

## Layer 5 — Factory, stream restart, main wiring (depends on Layers 1–4)

### Area 6 — Factory + stream restart on credential change + `index.ts`

**Requires:** Area 2 Green ✓ (env loader), Area 5 Green ✓ (complete provider), Area 7 Green ✓ (settings region of `index.ts` already edited)

- [x] **[Red]** Write failing tests — `src/main/integrations/market-data-factory.test.ts`, `src/main/services/market-data.test.ts` (new), `src/main/ipc/market-data.test.ts`, `src/main/services/screener.test.ts` _(depends on: Area 2 Green ✓, Area 5 Green ✓, Area 7 Green ✓)_
  - `market-data-factory.test.ts` (rewrite `beforeEach` to `configure({ loadActiveAlpacaCredentials })`): `FAKE_MARKET_DATA=true` → `FakeMarketDataProvider`; otherwise → `AlpacaMarketDataProvider` **even when** `loadActiveAlpacaCredentials()` returns `null` (no throw); `create()` cached (same instance twice); `recreate()` yields a new instance; default config (no `configure`) resolves credentials via `loadAlpacaCredentialsFromEnv` (set `ALPACA_KEY_ID` etc. and spy); `disconnect()` delegates to the cached provider; delete the "throws if neither Massive nor Fake is configured" case
  - `services/market-data.test.ts`: `subscribeToStockQuotes` stores `tickers` on `state`; `restartStockQuoteStream(state, provider, onTick, onError)` calls `provider.disconnect()`, sets `connected = false`, then `connect()` once and `stream('stockQuotes', storedTickers)`, forwarding a tick to `onTick`; stored `[]` → only teardown, no `connect`; `connect()` rejecting → `logger.warn` and resolves (REST-only)
  - `ipc/market-data.test.ts`: `registerMarketDataHandlers(...)` returns `{ restartStockQuoteStream }`; after a `set-stock-quote-tickers` call with `['AAPL']`, invoking it re-drives `provider.stream` with `['AAPL']` and ticks still reach `webContents.send('market-data:stock-quote', …)`; the existing 20 cases stay green
  - `screener.test.ts`: existing "getProvider throws → provider_unavailable" stays; new: provider whose `getOptionChainSnapshot` rejects `MarketDataError('auth_failed')` for every ticker → `status: 'provider_unavailable'`
  - Run `pnpm vitest run src/main/integrations/market-data-factory.test.ts src/main/services/market-data.test.ts src/main/ipc/market-data.test.ts src/main/services/screener.test.ts` — new/changed tests must fail
- [x] **[Green]** Implement — `src/main/integrations/market-data-factory.ts`, `src/main/services/market-data.ts`, `src/main/ipc/market-data.ts`, `src/main/index.ts` (factory + broker-changed regions), `src/main/ipc/screener.ts` (comment) _(depends on: Area 6 Red ✓)_
  - Factory: `type MarketDataFactoryConfig = { loadActiveAlpacaCredentials: () => AlpacaCredentials | null }`; default `loadAlpacaCredentialsFromEnv`; `buildProvider()` → fake under `FAKE_MARKET_DATA === 'true'`, else `new AlpacaMarketDataProvider({ loadCredentials: config.loadActiveAlpacaCredentials })`; remove the Massive import and the thrown message
  - `services/market-data.ts`: `StreamState = { connected, activeSub, tickers: string[] }`; `newStreamState()` sets `tickers: []`; `subscribeToStockQuotes` assigns `state.tickers = tickers`; `export async function restartStockQuoteStream(state, provider, onTick, onError): Promise<void>` per `data-model.md` "Credential change"; `logger.info({ tickers }, 'stock_quote_stream_restarted')`
  - `ipc/market-data.ts`: hoist `onTick` / `onError` closures; `return { restartStockQuoteStream: () => restartStockQuoteStream(streamState, getProvider(), onTick, onError) }`
  - `index.ts`: `const marketData = registerMarketDataHandlers(...)`; `marketDataFactory.configure({ loadActiveAlpacaCredentials: () => settings.loadActiveAlpacaCredentials() })`; in `onBrokerProviderChanged` after `brokerFactory.recreate()`: `void marketData.restartStockQuoteStream().catch((err) => logger.warn({ err }, 'failed to restart stock quote stream after broker change'))`; remove the `loadMassiveApiKey` import (the module is deleted in Area 9 — leave the file in place until then)
  - `ipc/screener.ts`: comment now says the chain pull raises `auth_failed` per ticker when credentials are missing, which rolls up to `provider_unavailable`
  - Run `pnpm vitest run src/main/integrations/market-data-factory.test.ts src/main/services/market-data.test.ts src/main/ipc/market-data.test.ts src/main/services/screener.test.ts src/main/services/evaluate-alerts.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/market-data.ts`, `src/main/ipc/market-data.ts`, `src/main/index.ts` _(depends on: Area 6 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm vitest run src/main && pnpm lint && pnpm typecheck`

---

## Layer 6 — Remove Massive (depends on Layer 5 and Area 8)

### Area 9 — Delete Massive code, config and comments

**Requires:** Area 6 Green ✓, Area 7 Green ✓, Area 8 Green ✓

- [x] **[Red]** Define the verification — no new test file _(depends on: Area 6 Green ✓, Area 7 Green ✓, Area 8 Green ✓)_
  - Record the current output of `grep -rni massive src e2e .env.example | wc -l` (non-zero) — this number must reach 0 in Green
  - Confirm `pnpm typecheck` is clean **before** deletion so any failure after is attributable to the removal
- [x] **[Green]** Remove — delete `src/main/integrations/massive-market-data.ts`, `massive-market-data.test.ts`, `massive-credentials.ts`, `massive-credentials.test.ts`; edit `src/main/env.d.ts`, `.env.example`, `src/main/integrations/alpaca.ts`, `e2e/settings-environment.spec.ts`, `e2e/provider-split.spec.ts`, `e2e/assignment-helpers.ts` (if it names Massive) _(depends on: Area 9 Red ✓)_
  - `env.d.ts`: remove `MAIN_VITE_MASSIVE_API_KEY`
  - `.env.example`: delete the Massive block; Alpaca block comment adds "These keys also serve market data — IEX stock prices and indicative option quotes — and are the only market-data configuration"; note `FAKE_MARKET_DATA=true` bypasses it
  - `alpaca.ts`: deprecation comments name `AlpacaMarketDataProvider`
  - e2e: remove `LaunchOptions.massiveApiKey`, `MASSIVE_API_KEY` from `buildEnv`, `DEFAULT_CONNECTION_MOCKS.massive`, and every `massiveApiKey:` argument (test bodies are rewritten in Area 10 — here only make them compile)
  - Fix every import the compiler reports
  - Run `grep -rni massive src e2e .env.example` → **no output**; `pnpm vitest run` → no newly failing tests; `pnpm typecheck` → clean
- [x] **[Refactor]** `/refactor` — `src/main/index.ts`, `.env.example` _(depends on: Area 9 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - `@msgpack/msgpack` in `package.json` is already unused — mention, do not remove (out of scope)
  - Run `pnpm vitest run && pnpm lint && pnpm typecheck`

---

## Layer 7 — E2E Tests

**Requires:** All Green tasks from previous layers ✓

### Area 10 — E2E Tests

- [x] **[Red]** Rewrite/add e2e tests — `e2e/settings-environment.spec.ts`, `e2e/provider-split.spec.ts`, `e2e/screener-results.spec.ts` _(depends on: all Green tasks ✓)_
  - One `it()` per derived AC; names mirror the AC language:
    - AC9 → `it('Settings names Alpaca as the market-data source')` — Market Data region contains `Market Data — Alpaca` and `Connect Alpaca below to enable market data` with no credentials; after `saveAlpacaViaApi` + `setActiveEnvironmentViaApi('paper')` contains `Using paper credentials`; region has no `Test connection` button; `Refresh IVR now` present (replaces "Settings page surfaces Massive status and Alpaca credentials independently"; drop the `Shared app configuration` assertion)
    - AC10 → `it('Market data is enabled by the active Alpaca credentials')` — fixtures render `$182.45` / `$3.60` (replaces "Shared Massive configuration enables market data")
    - AC4 → `it('Empty-state on first launch shows the Connect Alpaca banner and dashes')` — body contains `Connect Alpaca to enable market data, broker activity and buying power.`, link `Alpaca setup` → `#/settings`, price and opt-mid cells `—`, body does **not** contain `Massive`
    - AC9 → `it('Positions auth prompt names Alpaca')` — `triggerStreamError({ code: 'auth_failed', message: 'Alpaca authentication failed — check your key in Settings' })`; stale banner appears; text present exactly once (replaces "Shared Massive auth failure disables market data with stale fallback")
    - AC9 → `it('Expired Alpaca credentials surface a re-entry prompt')` (rename of "Expired Massive or Alpaca credentials…", new message)
    - AC9 → `it('LIVE confirmation says market data reconnects with live keys')` — dialog contains `Market data reconnects with your live keys — same Alpaca feeds, same prices.` (replaces the "unaffected — Massive" assertion inside "Switching broker environment to LIVE requires confirmation")
    - AC5 → `it('Switching broker environment restarts market data with the new keys')` — seed a position, switch to LIVE via the dialog, price cell still shows the fixture price and `NO BROKER` is gone
    - AC9 → `it('Screener outage card names Alpaca')` — launch with `FAKE_MARKET_DATA_ERROR=auth_failed`, open the screener, assert `Alpaca market data couldn't be reached on the last refresh.`
    - AC7 → rename `provider-split.spec.ts` "Missing API key surfaces a typed error" → `it('Market-data auth failure surfaces a typed error')`; delete "Massive 401/403 surfaces auth error" and both Massive `it.todo`s; header comment names US-99
    - rename "Market data is independent of broker configuration" → `it('Market data fixtures render without a broker account')` (assertions unchanged)
    - delete "Test connection for Massive uses a fixed reference probe"
    - AC1/AC2/AC3 → existing `live-underlying-price.spec.ts`, `screener-results.spec.ts`, `option-pnl.spec.ts` scenarios are the gate — run, do not add
  - Run `pnpm test:e2e -- e2e/settings-environment.spec.ts e2e/provider-split.spec.ts e2e/screener-results.spec.ts` — rewritten tests must fail only where copy/behaviour is not yet wired (if all pass, the Green step is a no-op)
- [x] **[Green]** Make e2e tests pass _(depends on: E2E Red ✓)_
  - Any residual copy mismatch is fixed in the renderer, not by loosening the assertion
  - Run `pnpm test:e2e` — all tests must pass (run `npx electron-rebuild -f -w better-sqlite3` first if the app fails to launch after unit tests)
- [x] **[Refactor]** `/refactor` e2e tests — `e2e/settings-environment.spec.ts` _(depends on: E2E Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - `LaunchOptions` and `buildEnv` should have no dead fields after `massiveApiKey` removal

---

## Completion Checklist

- [ ] All Red tasks complete (tests written and failing for the right reason)
- [ ] All Green tasks complete (all tests passing)
- [ ] All Refactor tasks complete (lint + typecheck clean)
- [ ] E2E tests cover every derived AC (AC audit table in `plan.md`)
- [ ] `grep -rni massive src e2e .env.example` prints nothing
- [ ] `pnpm test && pnpm lint && pnpm typecheck && pnpm format` — all clean (run `pnpm test` only with no `pnpm dev` session open)
- [ ] Manual live smoke per `quickstart.md`; request counts and websocket handshake lines recorded in the PR description
- [ ] `/update-spec us-99` run; `shared-massive-app-configuration` ADR superseded, `runtime-broker-provider-refresh` amended, `market-data-massive-migration` feature page marked superseded
- [ ] Massive subscriptions cancelled

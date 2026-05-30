# US-39 — Provider Split + Massive + Alpaca Broker — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off

---

## Layer 1 — Interface Definitions (no dependencies)

> Both areas can be started immediately and run in parallel.

### Area 1: BrokerProvider Interface

- [x] **[Red]** Write failing tests — `src/main/integrations/broker-provider.test.ts`
  - Test cases:
    - "exports BrokerProvider interface with getAccountInfo, getActivities, getMarketStatus" — type-level check via a `satisfies` fixture object
    - "exports BrokerError class with code field constrained to BrokerErrorCode union" — construct an instance, assert `error.code === 'auth_failed'`
    - "AccountInfo type includes accountNumberMasked with format 'XX…YYY'" — fixture data assertion
  - Run `pnpm test src/main/integrations/broker-provider.test.ts` — all new tests must fail

- [x] **[Green]** Implement — `src/main/integrations/broker-provider.ts` _(depends on: Area 1 Red ✓)_
  - Define `BrokerProvider` interface with only `getAccountInfo`, `getActivities`, `getMarketStatus`
  - Define `BrokerError` class with `code: BrokerErrorCode`; union: `'auth_failed' | 'network_error' | 'rate_limited' | 'environment_mismatch' | 'unknown'`
  - Re-home `AccountInfo` (add `accountNumberMasked: string` — first 2 + "…" + last 3), `BrokerActivity`, `ActivityFilter`, `MarketStatus` from `market-data-provider.ts` to this new file
  - Run `pnpm test src/main/integrations/broker-provider.test.ts` — all tests must pass

- [x] **[Refactor]** `/refactor` — `src/main/integrations/broker-provider.ts` _(depends on: Area 1 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 2: Slim Down MarketDataProvider Interface

- [x] **[Red]** Write failing tests — `src/main/integrations/market-data-provider.test.ts`
  - Test cases:
    - "MarketDataProvider does NOT expose getAccountInfo / getActivities / getMarketStatus" — type-level assertion those methods are absent
    - "exports getOptionSnapshot for single contract and getOptionChainSnapshot for chain filter" — fixture object satisfies new interface
    - "OptionSnapshot.greeks and impliedVolatility are optional" — type assertion that an `OptionSnapshot` without greeks is valid
  - Run `pnpm test src/main/integrations/market-data-provider.test.ts` — all new tests must fail

- [x] **[Green]** Implement — `src/main/integrations/market-data-provider.ts` _(depends on: Area 2 Red ✓)_
  - Remove `getAccountInfo`, `getActivities`, `getMarketStatus` from `MarketDataProvider` interface
  - Remove broker-related types (`AccountInfo`, `BrokerActivity`, etc.) — they now live in `broker-provider.ts`
  - Split `getOptionSnapshots(symbols)` into `getOptionSnapshot(symbol: string)` (single contract) and `getOptionChainSnapshot(filter: OptionChainFilter)` (chain with pagination)
  - Make `greeks` and `impliedVolatility` optional on `OptionSnapshot`; move `iv` field out of `greeks` and rename to top-level `impliedVolatility`
  - Add `OptionChainFilter` type: `{ underlying, expirationFrom?, expirationTo?, type?, strikeFrom?, strikeTo?, limit?, cursor? }`
  - Update `MarketDataErrorCode`: drop `options_no_subscription`; keep `'auth_failed' | 'network_error' | 'rate_limited' | 'streaming_unsupported' | 'unknown'`
  - Run `pnpm test src/main/integrations/market-data-provider.test.ts` — all tests must pass

- [x] **[Refactor]** `/refactor` — `src/main/integrations/market-data-provider.ts` _(depends on: Area 2 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Verify all `MarketDataError` consumers still compile; verify `OptionSnapshot.greeks?.delta` reads cleanly
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Implementations (depends on Layer 1 Green)

> Areas 3, 4, and 5 can run in parallel after their respective Layer 1 dependencies are Green.

### Area 3: AlpacaBrokerProvider

**Requires:** Area 1 Green ✓

- [x] **[Red]** Write failing tests — `src/main/integrations/alpaca-broker.test.ts` _(depends on: Area 1 Green ✓)_
  - Test cases:
    - "getAccountInfo returns AccountInfo with masked account number 'PA…ABC' for paper credentials" — mock `@alpacahq/typescript-sdk` getAccount to return `{ account_number: 'PA12345ABC' }`
    - "getAccountInfo throws BrokerError('auth_failed') on 401" — mock client throws 401
    - "getAccountInfo against live credentials hits api.alpaca.markets, paper hits paper-api.alpaca.markets" — assert base URL on mocked client constructor
    - "getActivities sorts results by transactionTime descending" — mock returns unsorted array, assert sort
    - "getActivities passes through `since` as `date` query parameter"
    - "getMarketStatus parses clock response into MarketStatus with session in {regular, pre, post, closed}" — fixture cases for each
    - "missing credentials throws BrokerError('auth_failed') with 'Alpaca credentials not configured' message"
    - "credential environment mismatch surfaces BrokerError('environment_mismatch')" — paper URL + live keys → 401 → environment_mismatch
  - Run `pnpm test src/main/integrations/alpaca-broker.test.ts` — all new tests must fail

- [x] **[Green]** Implement — `src/main/integrations/alpaca-broker.ts` _(depends on: Area 3 Red ✓)_
  - Create `AlpacaBrokerProvider` class implementing `BrokerProvider`
  - Construct Alpaca SDK client lazily using stored credentials from `safeStorage` via existing `src/main/integrations/alpaca.ts` factory
  - Choose base URL from credential `environment` field: `paper-api.alpaca.markets` vs `api.alpaca.markets`
  - Map SDK errors to `BrokerError`: HTTP 401 → `'auth_failed'`, network → `'network_error'`, 429 → `'rate_limited'`, mismatch → `'environment_mismatch'`
  - Format `accountNumberMasked` as `first2 + '…' + last3`
  - Run `pnpm test src/main/integrations/alpaca-broker.test.ts` — all tests must pass

- [x] **[Refactor]** `/refactor` — `src/main/integrations/alpaca-broker.ts` _(depends on: Area 3 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Verify no remaining direct `@alpacahq/typescript-sdk` imports in `services/` or `ipc/`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 4: MassiveMarketDataProvider

**Requires:** Area 2 Green ✓

- [x] **[Red]** Write failing tests — `src/main/integrations/massive-market-data.test.ts` _(depends on: Area 2 Green ✓)_
  - Test cases:
    - "getStockQuotes called with ['AAPL', 'MSFT'] issues two GET /v3/quotes/{ticker}/last requests in parallel" — mock `fetch`, assert URLs
    - "getStockQuotes constructs Authorization: Bearer ${apiKey} header on every request" — assert header on fetch mock
    - "getStockQuotes returns Map keyed by ticker with bid/ask/mid/timestamp parsed from results.last.b/a/t" — fixture response
    - "getStockQuotes computes mid as (bid + ask) / 2 with HALF_UP to 2dp" — fixture with bid=10.01 ask=10.04 → mid=10.03
    - "getOptionSnapshot parses underlying from OCC symbol and calls /v3/snapshot/options/{underlying}/{contract}" — assert URL path
    - "getOptionSnapshot returns greeks + impliedVolatility when response includes them" — fixture with full greeks
    - "getOptionSnapshot returns greeks=undefined and impliedVolatility=undefined when response omits them" — assert no fabricated zeros
    - "getOptionChainSnapshot translates filter into query params: expiration_date.gte, expiration_date.lte, contract_type, strike_price.gte/lte, limit" — assert URL
    - "getOptionChainSnapshot follows next_url to fetch additional pages until exhausted" — mock returns two pages then null next_url; assert two fetches
    - "getOptionChainSnapshot returns nextCursor when caller-supplied page limit is reached"
    - "Missing API key throws MarketDataError('auth_failed') with 'Massive API key not configured'"
    - "401/403 response throws MarketDataError('auth_failed')"
    - "429 response triggers retry with Retry-After wait, up to 2 retries, then throws MarketDataError('rate_limited')"
    - "Network failure (fetch throws) returns MarketDataError('network_error')"
    - "supportsStreaming('stockQuotes') and supportsStreaming('optionQuotes') return true"
    - "stream() throws MarketDataError('streaming_unsupported') for now"
  - Run `pnpm test src/main/integrations/massive-market-data.test.ts` — all new tests must fail

- [x] **[Green]** Implement — `src/main/integrations/massive-market-data.ts` + `src/main/integrations/massive-credentials.ts` _(depends on: Area 4 Red ✓)_
  - Create `massive-credentials.ts`: `loadMassiveApiKey()` helper using `safeStorage` (mirrors `alpaca.ts` pattern)
  - Build `MassiveMarketDataProvider` class implementing the slim `MarketDataProvider`
  - Constructor loads API key once via `loadMassiveApiKey()`; auth header: `Authorization: Bearer ${apiKey}`
  - Implement `getStockQuotes`: parallel `fetch` calls to `GET /v3/quotes/{ticker}/last`; parse `results.last.b/a/t`; compute `mid` via `decimal.js` `ROUND_HALF_UP`
  - Implement `getOptionSnapshot`: parse underlying from OCC symbol; call `GET /v3/snapshot/options/{underlying}/{contract}`; `greeks` and `impliedVolatility` optional — do not fabricate zeros when absent
  - Implement `getOptionChainSnapshot`: call `GET /v3/snapshot/options/{underlying}` with filter query params; follow `next_url` for pagination; stop when `next_url` is null or caller page limit reached
  - Implement 429 retry-with-backoff: max 2 retries, honor `Retry-After` header
  - `connect()` / `disconnect()` are no-ops; `stream()` throws `MarketDataError('streaming_unsupported')`
  - Run `pnpm test src/main/integrations/massive-market-data.test.ts` — all tests must pass

- [x] **[Refactor]** `/refactor` — `src/main/integrations/massive-market-data.ts` _(depends on: Area 4 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Extract HTTP wrapper (apiKey injection, error mapping) into private helper to avoid duplicating fetch boilerplate across methods
  - Verify all monetary string parsing goes through `decimal.js` per project convention
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 5: Split FakeMarketDataProvider + Add FakeBrokerProvider

**Requires:** Areas 1 and 2 Green ✓

- [x] **[Red]** Write failing tests — `src/main/integrations/fake-broker.test.ts` + modify `src/main/integrations/fake-market-data.test.ts` _(depends on: Areas 1 and 2 Green ✓)_
  - Test cases (fake-broker.test.ts):
    - "FakeBrokerProvider returns AccountInfo from FAKE_BROKER_ACCOUNT env var if set, otherwise a default fixture"
    - "FakeBrokerProvider returns FAKE_BROKER_ACTIVITIES env var parsed JSON when present"
    - "FakeBrokerProvider getMarketStatus respects FAKE_MARKET_STATUS env var"
  - Test cases (fake-market-data.test.ts):
    - "FakeMarketDataProvider no longer exposes broker methods" — type assertion
  - Run `pnpm test src/main/integrations/fake-broker.test.ts src/main/integrations/fake-market-data.test.ts` — all new tests must fail

- [x] **[Green]** Implement — `src/main/integrations/fake-broker.ts` + modify `src/main/integrations/fake-market-data.ts` _(depends on: Area 5 Red ✓)_
  - Create `FakeBrokerProvider` implementing `BrokerProvider`, moving `getAccountInfo`, `getActivities`, `getMarketStatus` from `FakeMarketDataProvider` (preserve env-var injection pattern)
  - Strip `getAccountInfo`, `getActivities`, `getMarketStatus` from `FakeMarketDataProvider`
  - Run `pnpm test src/main/integrations/fake-broker.test.ts src/main/integrations/fake-market-data.test.ts` — all tests must pass

- [x] **[Refactor]** `/refactor` _(depends on: Area 5 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Share env-var-parsing helpers between the two fakes if applicable
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Factories (depends on Layer 2 Green)

> Area 6 can start once Areas 3, 4, and 5 are Green.

### Area 6: Rewire MarketDataFactory + New BrokerFactory

**Requires:** Areas 3, 4, and 5 Green ✓

- [x] **[Red]** Write failing tests — modify `src/main/integrations/market-data-factory.test.ts` + new `src/main/integrations/broker-factory.test.ts` _(depends on: Areas 3, 4, 5 Green ✓)_
  - Test cases (market-data-factory.test.ts):
    - "returns MassiveMarketDataProvider when MASSIVE_API_KEY is configured"
    - "returns FakeMarketDataProvider when FAKE_MARKET_DATA env var is set"
    - "throws if neither Massive nor Fake is configured"
    - "does NOT instantiate AlpacaMarketDataProvider in any branch"
  - Test cases (broker-factory.test.ts):
    - "returns AlpacaBrokerProvider with paper base URL when active env is paper"
    - "returns AlpacaBrokerProvider with live base URL when active env is live"
    - "returns FakeBrokerProvider when FAKE_BROKER env var is set"
    - "throws BrokerError('auth_failed') when no credentials configured"
  - Run `pnpm test src/main/integrations/market-data-factory.test.ts src/main/integrations/broker-factory.test.ts` — all new tests must fail

- [x] **[Green]** Implement — modify `src/main/integrations/market-data-factory.ts` + new `src/main/integrations/broker-factory.ts` _(depends on: Area 6 Red ✓)_
  - Rewrite `marketDataFactory.create()` to return `FakeMarketDataProvider` or `MassiveMarketDataProvider` only
  - Create `brokerFactory.create()` returning `FakeBrokerProvider` or `AlpacaBrokerProvider`
  - Both factories cache instances and expose a `recreate()` method for US-37 credential changes
  - Run `pnpm test src/main/integrations/market-data-factory.test.ts src/main/integrations/broker-factory.test.ts` — all tests must pass

- [x] **[Refactor]** `/refactor` _(depends on: Area 6 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider consolidating cache + recreate logic into a shared `createCachingFactory<T>()` helper if patterns align
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — IPC Split + Deletion (depends on Layer 3 Green)

> Areas 7 and 9 can run in parallel after Area 6 is Green.

### Area 7: Split IPC Handlers Into market-data and broker

**Requires:** Area 6 Green ✓

- [x] **[Red]** Write failing tests — modify `src/main/ipc/market-data.test.ts` + new `src/main/ipc/broker.test.ts` _(depends on: Area 6 Green ✓)_
  - Test cases (market-data.test.ts):
    - "market-data:stock-quotes returns { ok: true, quotes } via Massive provider"
    - "market-data:option-snapshot validates OCC symbol and routes single contract"
    - "market-data:option-chain returns { ok: true, snapshots, nextCursor }"
    - "market-data namespace no longer registers handlers for :activities, :account, :market-status"
  - Test cases (broker.test.ts):
    - "broker:account returns AccountInfo via AlpacaBrokerProvider"
    - "broker:activities passes since filter through to provider"
    - "broker:market-status returns MarketStatus"
    - "each handler returns { ok: false, errors, code } on BrokerError"
  - Run `pnpm test src/main/ipc/market-data.test.ts src/main/ipc/broker.test.ts` — all new tests must fail

- [x] **[Green]** Implement — modify `src/main/ipc/market-data.ts` + new `src/main/ipc/broker.ts` + `src/main/schemas.ts` _(depends on: Area 7 Red ✓)_
  - Update `market-data.ts`: register only `market-data:stock-quotes`, `market-data:option-snapshot`, `market-data:option-chain` channels using `marketDataFactory.create()`
  - Create `broker.ts`: register `broker:account`, `broker:activities`, `broker:market-status` using `brokerFactory.create()`
  - Add Zod request schemas in `src/main/schemas.ts` matching `contracts/ipc-channels.md` (stock-quotes, option-snapshot, option-chain, broker:activities)
  - Each handler returns `{ ok: true, ...result } | { ok: false, errors, code? }` per project convention
  - Run `pnpm test src/main/ipc/market-data.test.ts src/main/ipc/broker.test.ts` — all tests must pass

- [x] **[Refactor]** `/refactor` _(depends on: Area 7 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Verify no IPC handler imports a vendor SDK directly — only through factories
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 9: Delete Old AlpacaMarketDataProvider

**Requires:** Area 6 Green ✓

- [x] **[Green]** Delete — `src/main/integrations/alpaca-market-data.ts` + `src/main/integrations/alpaca-market-data.test.ts` + `src/main/integrations/alpaca-market-data.e2e.test.ts` _(depends on: Area 6 Green ✓)_
  - Remove the three files
  - Migrate any unique broker-side coverage from the e2e test into `alpaca-broker.test.ts` if not already covered
  - Keep `src/main/integrations/alpaca-stream-test-utils.ts` — add a TODO comment documenting it will be renamed when generic streaming utilities land
  - Run `pnpm typecheck && pnpm test` — fix any straggler imports (should be zero if previous areas were complete)

- [x] **[Refactor]** `/refactor` _(depends on: Area 9 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Final grep for the string `AlpacaMarketDataProvider` in the repo — should match zero results
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 5 — Renderer Wiring (depends on Layer 4 Green)

> Area 8 starts after Area 7 is Green.

### Area 8: Wire Preload + Update Renderer Callers

**Requires:** Area 7 Green ✓

- [x] **[Red]** Write failing tests _(depends on: Area 7 Green ✓)_
  - Snapshot/unit test in renderer that mounts the Greeks panel with `snapshot.greeks = undefined` — assert it renders "—" placeholder without throwing — `src/renderer/src/components/greeks-panel.test.tsx` (or wherever the Greeks panel lives)
  - Renderer integration test that the hook for buying power invokes `broker:account` not `market-data:account`
  - Run `pnpm test` — all new tests must fail

- [x] **[Green]** Implement — modify `src/preload/index.ts` + renderer hooks/components _(depends on: Area 8 Red ✓)_
  - Replace contextBridge `api` shape with the two-namespace structure from `contracts/ipc-channels.md`:
    - `api.marketData.stockQuotes`, `api.marketData.optionSnapshot`, `api.marketData.optionChain`
    - `api.broker.account`, `api.broker.activities`, `api.broker.marketStatus`
  - Update each renderer hook to call `window.api.broker.*` or `window.api.marketData.*` per channel ownership
  - Update Greeks panel and any P&L cell reading Greeks to handle `greeks?.delta` and `impliedVolatility?` — render "—" when absent
  - Run `pnpm test` — all tests must pass

- [x] **[Refactor]** `/refactor` _(depends on: Area 8 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider extracting a `useBrokerEnvironment()` hook fed by `broker:account` for US-37
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 6 — E2E Tests (depends on all Green tasks)

**Requires:** All Green tasks from Layers 1–5 ✓

### E2E Tests

- [x] **[Red]** Write failing e2e tests — `e2e/provider-split.spec.ts` _(depends on: all Green tasks ✓)_
  - One `it()` per AC bullet — test names mirror AC language:
    - US-31 AC coverage:
      - `it('MarketDataProvider exposes stock quote retrieval')` → invoke `market-data:stock-quotes` via renderer
      - `it('MarketDataProvider exposes option contract snapshot')` → invoke `market-data:option-snapshot` with known OCC symbol
      - `it('MarketDataProvider exposes option chain snapshot with filters')` → invoke `market-data:option-chain` with put + expiration window
      - `it('MarketDataProvider declares streaming capability')` → assert `supportsStreaming('stockQuotes')` returns true
      - `it('BrokerProvider exposes account info')` → invoke `broker:account`, assert paper + masked account number
      - `it('BrokerProvider exposes broker activity polling')` → invoke `broker:activities` with a past `since`
      - `it('BrokerProvider exposes market status')` → invoke `broker:market-status`, assert session is one of four values
      - `it('Interfaces remain independent')` → assert no import of `broker-provider.ts` from `market-data-provider.ts`
    - US-39 AC coverage:
      - `it('getStockQuotes returns NBBO for each ticker')` — mocked-fetch fixture
      - `it('getOptionSnapshot returns full snapshot including Greeks when present')` — fixture round-trip
      - `it('getOptionSnapshot omits Greeks when absent')` — fixture round-trip
      - `it('getOptionChainSnapshot filters by strike, expiration, and contract type')` — fixture round-trip
      - `it('API key is loaded once per process and reused')` — spy on safeStorage decrypt, assert called once across multiple calls
      - `it('Missing API key surfaces a typed error')` — unset key, assert MarketDataError surfaces to renderer
      - `it('Massive 429 rate limit response is retried with backoff')` — mock 429 then 200, assert success after retry
      - `it('Massive 401/403 surfaces auth error')` — mock 401, assert MarketDataError code
      - `it('supportsStreaming declares streamable feeds')` — assert true for stocks + options
    - US-40 AC coverage:
      - `it('getAccountInfo returns balances, environment, and masked account number')` — paper credentials round-trip
      - `it('getActivities returns OPASN activities filtered by date')`
      - `it('getMarketStatus returns current session')`
      - `it('Missing Alpaca credentials surface typed error')`
      - `it('Environment is sourced from stored credentials')`
      - `it('Credential environment mismatch is detectable')` — paper URL + live keys → `environment_mismatch`
  - Run `pnpm test:e2e` — all new tests must fail

- [x] **[Green]** Make e2e tests pass _(depends on: E2E Red ✓)_
  - Use Playwright `_electron` to boot the app; inject Fake providers OR real ones via env vars
  - Mock `fetch` for Massive in non-gated tests; allow real fetch when `MASSIVE_E2E=1`
  - Run `pnpm test:e2e` — all tests must pass

- [x] **[Refactor]** `/refactor` e2e tests _(depends on: E2E Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Extract shared helper that boots the app in a known fake state and exposes the IPC bridge

---

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for right reason)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] E2E tests cover every AC from US-31, US-39, and US-40
- [x] `pnpm test && pnpm lint && pnpm typecheck` — all clean
- [x] Final grep: `AlpacaMarketDataProvider` matches zero results in the repo

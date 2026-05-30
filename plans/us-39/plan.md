# Implementation Plan: Provider Split + Massive + Alpaca Broker (US-31 rewrite + US-39 + US-40)

## Summary

Refactor the existing combined `MarketDataProvider` into two independent interfaces (`MarketDataProvider`, `BrokerProvider`), implement `MassiveMarketDataProvider` for live quotes / Greeks / option chains, and implement `AlpacaBrokerProvider` for account info, broker activities, and market status. Wire both through a refactored factory + scoped IPC namespaces. Done when the renderer fetches quotes from Massive, account/activities from Alpaca, and no code path treats Alpaca as a market-data source.

## Supporting Documents

- **User Stories & Acceptance Criteria:**
  - `docs/epics/06-stories/US-31-market-data-provider-adapter.md`
  - `docs/epics/06-stories/US-39-massive-market-data-provider.md`
  - `docs/epics/06-stories/US-40-alpaca-broker-provider.md`
- **Research & Design Decisions:** `plans/us-39/research.md`
- **Data Model:** `plans/us-39/data-model.md`
- **IPC Contracts:** `plans/us-39/contracts/ipc-channels.md`
- **Quickstart & Verification:** `plans/us-39/quickstart.md`

## Prerequisites

- Existing combined `MarketDataProvider`, `AlpacaMarketDataProvider`, `MarketDataFactory`, `FakeMarketDataProvider`, and `market-data` IPC handler are all in place — this plan refactors them.
- US-37 (credentials UI) is not required here; the providers read API keys via the existing `safeStorage`-backed credential loader.

## Implementation Areas

Order matters — interfaces first, then implementations, then factory + IPC, then renderer + e2e.

---

### 1. Define BrokerProvider Interface (US-31 half)

**Files to create or modify:**

- `src/main/integrations/broker-provider.ts` — new
- `src/main/integrations/broker-provider.test.ts` — new

**Red — tests to write:**

- `broker-provider.test.ts` "exports BrokerProvider interface with getAccountInfo, getActivities, getMarketStatus" — type-level check via a `satisfies` fixture object.
- `broker-provider.test.ts` "exports BrokerError class with code field constrained to BrokerErrorCode union" — construct an instance, assert `error.code === 'auth_failed'`.
- `broker-provider.test.ts` "AccountInfo type includes accountNumberMasked with format 'XX…YYY'" — fixture data assertion.

**Green — implementation:**

- Define `BrokerProvider` interface per `plans/us-39/data-model.md` (only `getAccountInfo`, `getActivities`, `getMarketStatus`).
- Define `BrokerError` class with `code: BrokerErrorCode`.
- Re-home `AccountInfo`, `BrokerActivity`, `ActivityFilter`, `MarketStatus` types from `market-data-provider.ts` to this file, adding `accountNumberMasked: string` to `AccountInfo`.

**Refactor — cleanup to consider:**

- Confirm no imports of `BrokerProvider` exist in `market-data-provider.ts`.
- Doc comment on `BrokerError` explaining the difference from `MarketDataError`.

**Acceptance criteria covered:**

- US-31: "BrokerProvider exposes account info" — interface contract.
- US-31: "BrokerProvider exposes broker activity polling".
- US-31: "BrokerProvider exposes market status".
- US-31: "Interfaces remain independent".

---

### 2. Slim Down MarketDataProvider Interface (US-31 half)

**Files to create or modify:**

- `src/main/integrations/market-data-provider.ts` — modify (delete broker methods + types)
- `src/main/integrations/market-data-provider.test.ts` — modify

**Red — tests to write:**

- `market-data-provider.test.ts` "MarketDataProvider does NOT expose getAccountInfo / getActivities / getMarketStatus" — type-level check that those methods are absent.
- `market-data-provider.test.ts` "exports getOptionSnapshot for single contract and getOptionChainSnapshot for chain filter" — fixture object satisfies new interface.
- `market-data-provider.test.ts` "OptionSnapshot.greeks and impliedVolatility are optional" — type assertion that an `OptionSnapshot` without greeks is valid.

**Green — implementation:**

- Remove `getAccountInfo`, `getActivities`, `getMarketStatus` from `MarketDataProvider`.
- Remove broker-related types (`AccountInfo`, `BrokerActivity`, etc.) — they now live in `broker-provider.ts`.
- Split `getOptionSnapshots(symbols)` into `getOptionSnapshot(symbol)` (single contract) and `getOptionChainSnapshot(filter: OptionChainFilter)` (chain with pagination).
- Make `greeks` and `impliedVolatility` optional on `OptionSnapshot`. Move `iv` field out of `greeks` and rename to `impliedVolatility` at the top level.
- Update `MarketDataErrorCode` union: drop `options_no_subscription` (Massive-irrelevant) but keep `auth_failed`, `network_error`, `rate_limited`, `streaming_unsupported`, `unknown`.

**Refactor — cleanup to consider:**

- Verify all `MarketDataError` consumers still build (some will need import-path updates).
- Check that `OptionSnapshot.greeks?.delta` reads compile cleanly.

**Acceptance criteria covered:**

- US-31: "MarketDataProvider exposes stock quote retrieval", "...option contract snapshot", "...option chain snapshot with filters", "declares streaming capability".

---

### 3. Implement AlpacaBrokerProvider (US-40)

**Files to create or modify:**

- `src/main/integrations/alpaca-broker.ts` — new (extract from existing `alpaca-market-data.ts`)
- `src/main/integrations/alpaca-broker.test.ts` — new (port broker-side tests from `alpaca-market-data.test.ts`)

**Red — tests to write:**

- "getAccountInfo returns AccountInfo with masked account number 'PA…ABC' for paper credentials" — mock `@alpacahq/typescript-sdk` getAccount to return `{ account_number: 'PA12345ABC' }`.
- "getAccountInfo throws BrokerError('auth_failed') on 401" — mock client throws 401.
- "getAccountInfo against live credentials hits api.alpaca.markets, paper hits paper-api.alpaca.markets" — assert base URL on the mocked client constructor.
- "getActivities sorts results by transactionTime descending" — mock returns unsorted array, assert sort.
- "getActivities passes through `since` as `date` query parameter".
- "getMarketStatus parses clock response into MarketStatus with session in {regular, pre, post, closed}" — fixture cases for each.
- "missing credentials throws BrokerError('auth_failed') with 'Alpaca credentials not configured' message".
- "credential environment mismatch surfaces BrokerError('environment_mismatch')" — paper URL + live keys → 401; provider wraps as environment_mismatch.

**Green — implementation:**

- Create `AlpacaBrokerProvider` class implementing `BrokerProvider`.
- Construct Alpaca SDK client lazily using stored credentials from `safeStorage` via the existing `src/main/integrations/alpaca.ts` factory.
- Choose base URL based on `environment` field of stored credentials.
- Translate Alpaca SDK errors into `BrokerError` with correct code mapping (HTTP 401 → `auth_failed`, network → `network_error`, 429 → `rate_limited`, environment mismatch → `environment_mismatch`).
- Format `accountNumberMasked` as `first2 + '…' + last3`.

**Refactor — cleanup to consider:**

- Decide whether `alpaca.ts` (lazy client factory) stays or merges into `alpaca-broker.ts`. Recommendation: keep `alpaca.ts` as the credential/client factory and have `alpaca-broker.ts` consume it.
- Verify no remaining direct `@alpacahq/typescript-sdk` imports in `services/` or `ipc/`.

**Acceptance criteria covered:**

- US-40: all five primary scenarios.

---

### 4. Implement MassiveMarketDataProvider (US-39)

**Files to create or modify:**

- `src/main/integrations/massive-market-data.ts` — new
- `src/main/integrations/massive-market-data.test.ts` — new
- `src/main/integrations/massive-market-data.e2e.test.ts` — new (gated by `MASSIVE_E2E=1`)
- `src/main/integrations/massive-credentials.ts` — new small helper for API key loading (mirrors existing `alpaca.ts` pattern)

**Red — tests to write:**

- "getStockQuotes called with ['AAPL', 'MSFT'] issues two GET /v3/quotes/{ticker}/last requests in parallel" — mock `fetch`, assert URLs.
- "getStockQuotes constructs Authorization: Bearer ${apiKey} header on every request" — fetch mock asserts header.
- "getStockQuotes returns Map keyed by ticker with bid/ask/mid/timestamp parsed from results.last.b/a/t" — fixture response.
- "getStockQuotes computes mid as (bid + ask) / 2 with HALF_UP to 2 dp" — fixture with bid=10.01 ask=10.04 → mid=10.03.
- "getOptionSnapshot parses underlying from OCC symbol and calls /v3/snapshot/options/{underlying}/{contract}" — assert URL path.
- "getOptionSnapshot returns greeks + impliedVolatility when response includes them" — fixture with full greeks.
- "getOptionSnapshot returns greeks=undefined and impliedVolatility=undefined when response omits them" — fixture without greeks; assert no fabricated zeros.
- "getOptionChainSnapshot translates filter into query params: expiration_date.gte, expiration_date.lte, contract_type, strike_price.gte/lte, limit" — assert URL.
- "getOptionChainSnapshot follows next_url to fetch additional pages until exhausted" — mock returns two pages then null next_url; assert two fetches.
- "getOptionChainSnapshot returns nextCursor when a caller-supplied page limit is reached" — assert pagination stops.
- "Missing API key throws MarketDataError('auth_failed') with 'Massive API key not configured'".
- "401/403 response throws MarketDataError('auth_failed')".
- "429 response triggers retry with Retry-After wait, up to 2 retries, then throws MarketDataError('rate_limited')".
- "Network failure (fetch throws) returns MarketDataError('network_error')".
- "supportsStreaming('stockQuotes') and supportsStreaming('optionQuotes') return true" — capability flag.
- "stream() throws MarketDataError('streaming_unsupported') for now" — explicit deferred-behavior test.
- E2E (gated): "GET /v3/quotes/AAPL/last with real key returns a valid StockQuote" — only runs with MASSIVE_E2E=1.

**Green — implementation:**

- Build `MassiveMarketDataProvider` class implementing slim `MarketDataProvider`.
- Constructor loads the API key once via `loadMassiveApiKey()` from `massive-credentials.ts`.
- Implement `getStockQuotes`, `getOptionSnapshot`, `getOptionChainSnapshot` per the wire mapping in `plans/us-39/data-model.md`.
- Implement `parseUnderlyingFromOccSymbol` helper (or reuse `src/main/core/option-symbol.ts` if present).
- Implement 429 retry-with-backoff (max 2 retries, honor Retry-After header).
- `connect()` / `disconnect()` are no-ops in this story (streaming deferred); `stream()` throws `streaming_unsupported`.

**Refactor — cleanup to consider:**

- Extract HTTP wrapper (apiKey injection, error mapping) into a private helper so the three methods are not duplicating fetch boilerplate.
- Verify all monetary string parsing goes through `decimal.js` per project convention.

**Acceptance criteria covered:**

- US-39: all nine scenarios.

---

### 5. Split FakeMarketDataProvider; Add FakeBrokerProvider

**Files to create or modify:**

- `src/main/integrations/fake-market-data.ts` — modify (remove broker methods)
- `src/main/integrations/fake-broker.ts` — new
- `src/main/integrations/fake-market-data.test.ts` — modify
- `src/main/integrations/fake-broker.test.ts` — new

**Red — tests to write:**

- `fake-broker.test.ts` "FakeBrokerProvider returns AccountInfo from FAKE_BROKER_ACCOUNT env var if set, otherwise a default fixture".
- `fake-broker.test.ts` "FakeBrokerProvider returns FAKE_BROKER_ACTIVITIES env var parsed JSON when present".
- `fake-broker.test.ts` "FakeBrokerProvider getMarketStatus respects FAKE_MARKET_STATUS env var".
- `fake-market-data.test.ts` "FakeMarketDataProvider no longer exposes broker methods" — type assertion.

**Green — implementation:**

- Move `getAccountInfo`, `getActivities`, `getMarketStatus` implementations from `FakeMarketDataProvider` to new `FakeBrokerProvider` (preserve env-var injection pattern).
- Strip the same methods from `FakeMarketDataProvider`.

**Refactor — cleanup to consider:**

- Share env-var-parsing helpers between the two fakes.

**Acceptance criteria covered:**

- Indirectly: enables US-31 "interfaces remain independent" by ensuring even the test doubles respect the boundary.

---

### 6. Rewire MarketDataFactory + BrokerFactory

**Files to create or modify:**

- `src/main/integrations/market-data-factory.ts` — modify (returns Massive or Fake only)
- `src/main/integrations/broker-factory.ts` — new (returns Alpaca-broker or Fake)
- `src/main/integrations/market-data-factory.test.ts` — modify
- `src/main/integrations/broker-factory.test.ts` — new

**Red — tests to write:**

- `market-data-factory.test.ts` "returns MassiveMarketDataProvider when MASSIVE_API_KEY is configured".
- `market-data-factory.test.ts` "returns FakeMarketDataProvider when FAKE_MARKET_DATA env var is set" (preserves existing test seam).
- `market-data-factory.test.ts` "throws if neither Massive nor Fake is configured" (with code or settings-deeplink hint).
- `market-data-factory.test.ts` "does NOT instantiate AlpacaMarketDataProvider in any branch".
- `broker-factory.test.ts` "returns AlpacaBrokerProvider with paper base URL when active env is paper".
- `broker-factory.test.ts` "returns AlpacaBrokerProvider with live base URL when active env is live".
- `broker-factory.test.ts` "returns FakeBrokerProvider when FAKE_BROKER env var is set".
- `broker-factory.test.ts` "throws BrokerError('auth_failed') when no credentials configured".

**Green — implementation:**

- Rewrite `marketDataFactory.create()` to return `FakeMarketDataProvider` or `MassiveMarketDataProvider`.
- Create `brokerFactory.create()` returning `FakeBrokerProvider` or `AlpacaBrokerProvider`.
- Both factories cache instances and expose a `recreate()` method for US-37 credential changes.

**Refactor — cleanup to consider:**

- Consolidate cache + recreate logic into a shared `createCachingFactory<T>()` helper if patterns diverge.

**Acceptance criteria covered:**

- US-37's later credential reload depends on these factories — verify the interface those stories will consume.

---

### 7. Split IPC Handlers Into market-data and broker

**Files to create or modify:**

- `src/main/ipc/market-data.ts` — modify (drop broker channels; rename to use `getOptionSnapshot` / chain)
- `src/main/ipc/broker.ts` — new
- `src/main/ipc/market-data.test.ts` — modify
- `src/main/ipc/broker.test.ts` — new
- `src/main/schemas.ts` — add Zod schemas per `plans/us-39/contracts/ipc-channels.md`

**Red — tests to write:**

- `market-data.test.ts` "market-data:stock-quotes returns { ok: true, quotes } via Massive provider".
- `market-data.test.ts` "market-data:option-snapshot validates OCC symbol and routes single contract".
- `market-data.test.ts` "market-data:option-chain returns { ok: true, snapshots, nextCursor }".
- `market-data.test.ts` "market-data namespace no longer registers handlers for :activities, :account, :market-status".
- `broker.test.ts` "broker:account returns AccountInfo via AlpacaBrokerProvider".
- `broker.test.ts` "broker:activities passes since filter through to provider".
- `broker.test.ts` "broker:market-status returns MarketStatus".
- `broker.test.ts` "each handler returns { ok: false, errors, code } on BrokerError".

**Green — implementation:**

- Update `market-data.ts` to register only quote / snapshot / chain channels using the slim MarketDataProvider from `marketDataFactory.create()`.
- Create `broker.ts` registering `broker:account`, `broker:activities`, `broker:market-status` using `brokerFactory.create()`.
- Add Zod request schemas matching `contracts/ipc-channels.md`.
- Each handler returns `{ ok: true, ...result } | { ok: false, errors, code? }` per project convention.

**Refactor — cleanup to consider:**

- Verify no IPC handler imports a vendor SDK directly — only through the factory.

**Acceptance criteria covered:**

- Plumbing for US-39 and US-40 acceptance; renderer wiring covered in next area.

---

### 8. Wire Preload + Update Renderer Callers

**Files to create or modify:**

- `src/preload/index.ts` — modify
- `src/renderer/src/api/positions.ts` — audit (likely no change if it already used `marketData.*` hooks)
- Any renderer hook calling old broker-on-market-data channels — modify
- Any renderer component reading `optionSnapshot.greeks.delta` directly — modify to `?.delta`

**Red — tests to write:**

- Snapshot/unit test in renderer that mounts the Greeks panel with `snapshot.greeks = undefined` and asserts it renders the "—" placeholder without throwing.
- Renderer integration test that the hook for buying power invokes `broker:account` not `market-data:account`.

**Green — implementation:**

- Replace contextBridge `api` shape with the two-namespace structure from `contracts/ipc-channels.md`.
- Update each renderer hook to call `window.api.broker.*` or `window.api.marketData.*` per channel ownership.
- Update Greeks panel + any P&L cell that reads Greeks to handle `greeks?.delta` and `impliedVolatility?` cleanly.

**Refactor — cleanup to consider:**

- Consider extracting a `useBrokerEnvironment()` hook fed by `broker:account` so US-37 can read environment from a single source.

**Acceptance criteria covered:**

- US-31 "Interfaces remain independent" — renderer code must not import a vendor concept; only API namespaces.

---

### 9. Delete the Old AlpacaMarketDataProvider

**Files to create or modify:**

- `src/main/integrations/alpaca-market-data.ts` — DELETE
- `src/main/integrations/alpaca-market-data.test.ts` — DELETE
- `src/main/integrations/alpaca-market-data.e2e.test.ts` — DELETE (or migrate any unique broker-side coverage into `alpaca-broker.e2e.test.ts`)
- `src/main/integrations/alpaca-stream-test-utils.ts` — keep until streaming-utils generalisation lands; document in TODO comment

**Red — tests to write:**

- (no Red — deletion only)

**Green — implementation:**

- Remove the three files.
- Run `pnpm typecheck` and `pnpm test` — fix any straggler imports (should be zero if previous areas were done right).

**Refactor — cleanup to consider:**

- Final grep for the string `AlpacaMarketDataProvider` in the repo — should match zero results.

**Acceptance criteria covered:**

- Clean end-state required by research.md decision "no fallback Alpaca market-data path."

---

### 10. E2E Tests

**Files to create or modify:**

- `e2e/provider-split.spec.ts` — new (Playwright `_electron`)
- `e2e/massive-quotes.spec.ts` — new (gated by `MASSIVE_E2E=1`)

**Red — tests to write (each maps to one AC):**

- "User Story US-31 — MarketDataProvider exposes stock quote retrieval" — invoke `market-data:stock-quotes` via the renderer; expect `{ ok: true, quotes: { AAPL: { ... } } }`.
- "User Story US-31 — MarketDataProvider exposes option contract snapshot" — invoke `market-data:option-snapshot` with a known OCC symbol; assert shape.
- "User Story US-31 — MarketDataProvider exposes option chain snapshot with filters" — invoke `market-data:option-chain` with put + expiration window; assert non-empty array.
- "User Story US-31 — MarketDataProvider declares streaming capability" — boot main, call `supportsStreaming('stockQuotes')` via test hook; assert true.
- "User Story US-31 — BrokerProvider exposes account info" — invoke `broker:account`; assert paper environment + masked account number.
- "User Story US-31 — BrokerProvider exposes broker activity polling" — invoke `broker:activities` with a known past `since`; assert non-empty array (paper account with at least one historical OPASN).
- "User Story US-31 — BrokerProvider exposes market status" — invoke `broker:market-status`; assert one of the four session values.
- "User Story US-31 — Interfaces remain independent" — grep test: assert no import of `broker-provider.ts` from `market-data-provider.ts` (lint-style assertion via simple node test).
- "User Story US-39 — getStockQuotes returns NBBO for each ticker" — mocked-fetch integration test in the e2e suite (no real Massive call) confirms the renderer path.
- "User Story US-39 — getOptionSnapshot returns full snapshot including Greeks when present" — fixture round-trip.
- "User Story US-39 — getOptionSnapshot omits Greeks when absent" — fixture round-trip.
- "User Story US-39 — getOptionChainSnapshot filters by strike, expiration, and contract type" — fixture round-trip.
- "User Story US-39 — API key is loaded once per process and reused" — spy on safeStorage decrypt, assert called once across multiple calls.
- "User Story US-39 — Missing API key surfaces a typed error" — unset key, assert MarketDataError surfaces to renderer.
- "User Story US-39 — Massive 429 rate limit response is retried with backoff" — mock 429 then 200, assert success after retry.
- "User Story US-39 — Massive 401/403 surfaces auth error" — mock 401, assert MarketDataError code.
- "User Story US-39 — supportsStreaming declares streamable feeds" — assert true for stocks + options, false for activities.
- "User Story US-40 — getAccountInfo returns balances, environment, and masked account number" — paper credentials round-trip.
- "User Story US-40 — getActivities returns OPASN activities filtered by date".
- "User Story US-40 — getMarketStatus returns current session".
- "User Story US-40 — Missing Alpaca credentials surface typed error".
- "User Story US-40 — Environment is sourced from stored credentials".
- "User Story US-40 — Credential environment mismatch is detectable" — paper URL + live keys → `environment_mismatch`.
- Optional gated by `MASSIVE_E2E=1`: "Live Massive smoke: AAPL stock quote returns price > 0".

**Green — implementation:**

- Use Playwright `_electron` to boot the app, register IPC handlers under a test factory that injects the Fake providers OR the real ones depending on env vars.
- Mock `fetch` for Massive in non-gated tests; allow real fetch when `MASSIVE_E2E=1`.

**Refactor — cleanup to consider:**

- Helper that boots the app in a known fake state and exposes the IPC bridge — shared across all e2e tests in this plan.

**Acceptance criteria covered:**

- Every AC from US-31, US-39, US-40 mapped to a named e2e case above.

---

## AC Audit

### US-31 (rewrite)

| AC                                                            | Covered by                  |
| ------------------------------------------------------------- | --------------------------- |
| MarketDataProvider exposes stock quote retrieval              | Area 2 unit + Area 10 e2e   |
| MarketDataProvider exposes option contract snapshot           | Area 2 unit + Area 10 e2e   |
| MarketDataProvider exposes option chain snapshot with filters | Area 2 unit + Area 10 e2e   |
| MarketDataProvider declares streaming capability              | Area 2 unit + Area 10 e2e   |
| BrokerProvider exposes account info                           | Area 1 unit + Area 10 e2e   |
| BrokerProvider exposes broker activity polling                | Area 1 unit + Area 10 e2e   |
| BrokerProvider exposes market status                          | Area 1 unit + Area 10 e2e   |
| Interfaces remain independent                                 | Area 8 + Area 10 e2e (grep) |

### US-39

| AC                                                                    | Covered by                |
| --------------------------------------------------------------------- | ------------------------- |
| getStockQuotes returns NBBO for each ticker                           | Area 4 unit + Area 10 e2e |
| getOptionSnapshot returns full snapshot including Greeks when present | Area 4 unit + Area 10 e2e |
| getOptionSnapshot omits Greeks when absent                            | Area 4 unit + Area 10 e2e |
| getOptionChainSnapshot filters + paginates                            | Area 4 unit + Area 10 e2e |
| API key is loaded once per process and reused                         | Area 4 unit + Area 10 e2e |
| Missing API key surfaces a typed error                                | Area 4 unit + Area 10 e2e |
| Massive 429 retry-with-backoff                                        | Area 4 unit + Area 10 e2e |
| Massive 401/403 surfaces auth error                                   | Area 4 unit + Area 10 e2e |
| supportsStreaming declares streamable feeds                           | Area 4 unit + Area 10 e2e |

### US-40

| AC                                                                  | Covered by                |
| ------------------------------------------------------------------- | ------------------------- |
| getAccountInfo returns balances, environment, masked account number | Area 3 unit + Area 10 e2e |
| getActivities returns OPASN activities filtered by date             | Area 3 unit + Area 10 e2e |
| getMarketStatus returns current session                             | Area 3 unit + Area 10 e2e |
| Missing Alpaca credentials surface typed error                      | Area 3 unit + Area 10 e2e |
| Environment is sourced from stored credentials                      | Area 3 unit + Area 10 e2e |
| Credential environment mismatch is detectable                       | Area 3 unit + Area 10 e2e |

All ACs covered.

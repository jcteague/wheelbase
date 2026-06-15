# US-43 — IVR Scraper (Barchart) — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off

---

## Layer 1 — Foundations (start immediately)

> These areas can be started immediately and run in parallel.

### Schemas and Result Types

- [x] **[Red]** Write failing tests — `src/main/integrations/barchart-ivr-scraper.test.ts`
  - Test cases: `IVRDataSchema rejects ivr below 0`; `IVRDataSchema rejects ivr above 100`; `IVRDataSchema rejects invalid ticker`; `IVRDataSchema accepts valid payload`
  - Run `pnpm test -- src/main/integrations/barchart-ivr-scraper.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/integrations/barchart-ivr-scraper.ts` _(depends on: Schemas and Result Types Red ✓)_
  - Define `IVRDataSchema`, export `IVRData`, and export the six `IVRResult` variants: `ok | not_available | parse_error | network_error | rate_limited | invalid_input`
  - Match the data model in `plans/us-43/data-model.md`: uppercase ticker regex, `ivr`/`ivp` range `0..100`, optional `iv30`, ISO `observedAt`, `source: 'barchart'`
  - Run `pnpm test -- src/main/integrations/barchart-ivr-scraper.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/integrations/barchart-ivr-scraper.ts` _(depends on: Schemas and Result Types Green ✓)_
  - **Invoke `source-command-refactor` (the migrated `/refactor` command)** — do not substitute a manual cleanup or only the `code-simplifier` skill
  - Confirm exported names match integration naming conventions in `src/main/integrations/`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Ticker Validation

- [x] **[Red]** Write failing tests — `src/main/integrations/barchart-ivr-scraper.test.ts`
  - Test cases: invalid empty ticker; invalid non-alphanumeric ticker (`SP-Y`); invalid 6-character ticker; invalid input does not issue a network request
  - Run `pnpm test -- src/main/integrations/barchart-ivr-scraper.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/integrations/barchart-ivr-scraper.ts` _(depends on: Ticker Validation Red ✓)_
  - Add `validateTicker(ticker: string): boolean` using uppercase normalization plus `/^[A-Z0-9]{1,5}$/`
  - Make `fetchIVR` short-circuit with `{ status: 'invalid_input', error: { code: 'INVALID_TICKER' } }`
  - Ensure invalid input returns before any `fetch` call
  - Run `pnpm test -- src/main/integrations/barchart-ivr-scraper.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/integrations/barchart-ivr-scraper.ts` _(depends on: Ticker Validation Green ✓)_
  - **Invoke `source-command-refactor` (the migrated `/refactor` command)** — do not substitute a manual cleanup or only the `code-simplifier` skill
  - Keep normalization at the boundary so lowercase callers are accepted consistently
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Session Acquisition and Cache

- [x] **[Red]** Write failing tests — `src/main/integrations/barchart-ivr-scraper.test.ts`
  - Test cases: first call fetches a Barchart page for session; API call includes `X-XSRF-TOKEN`; API call includes `Cookie`; second `fetchIVR` call reuses cached session; both requests send `User-Agent` starting with `Wheelbase/`
  - Use `vi.stubGlobal('fetch', mockFetch)` and sequential session/API mock responses
  - Run `pnpm test -- src/main/integrations/barchart-ivr-scraper.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/integrations/barchart-ivr-scraper.ts` _(depends on: Session Acquisition and Cache Red ✓)_
  - Add `USER_AGENT`, `SessionCache`, module-level `sessionCache`, and `getSession()`
  - Fetch `https://www.barchart.com/stocks/quotes/SPY/options`, harvest `Set-Cookie`, build `Cookie` header, extract and decode `XSRF-TOKEN`, cache for 30 minutes
  - Import `package.json` version for the user-agent format from the plan
  - Run `pnpm test -- src/main/integrations/barchart-ivr-scraper.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/integrations/barchart-ivr-scraper.ts` _(depends on: Session Acquisition and Cache Green ✓)_
  - **Invoke `source-command-refactor` (the migrated `/refactor` command)** — do not substitute a manual cleanup or only the `code-simplifier` skill
  - Consider extracting `extractXsrf(setCookieHeaders: string[]): string` and verify Node/Electron compatibility around `headers.getSetCookie()`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### JSON Parser

- [x] **[Red]** Write failing tests — `src/main/integrations/barchart-ivr-scraper.test.ts`
  - Test cases: `impliedVolatilityRank1y` maps to `ivr`; `ivr` rounds to 1 decimal place; `ivp` is `impliedVolatilityPercentile1y * 100` rounded to 1 dp; `iv30` uses `historicVolatility20d`; `ivp` omitted when null; `count: 0` returns `not_available`; missing `impliedVolatilityRank1y` returns `parse_error`; `rawSnippet` is capped at 500 chars; parse failure emits `logger.warn`
  - Use inline fixtures only; no network calls
  - Run `pnpm test -- src/main/integrations/barchart-ivr-scraper.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/integrations/barchart-ivr-scraper.ts` _(depends on: JSON Parser Red ✓; Schemas and Result Types Green ✓)_
  - Add `roundTo1dp(n)` and `parseIVRResponse(ticker, body): IVRResult`
  - Handle `count === 0` as `not_available`; missing numeric `raw.impliedVolatilityRank1y` as `parse_error` with `rawSnippet` and WARN log; valid responses as `ok`
  - Set `observedAt` with `new Date().toISOString()` and `source: 'barchart'`
  - Run `pnpm test -- src/main/integrations/barchart-ivr-scraper.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/integrations/barchart-ivr-scraper.ts` _(depends on: JSON Parser Green ✓)_
  - **Invoke `source-command-refactor` (the migrated `/refactor` command)** — do not substitute a manual cleanup or only the `code-simplifier` skill
  - Share rounding helpers instead of duplicating logic across parser and validation code
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Network Mechanics (after session/types foundations)

> These areas can run in parallel with each other after their upstream Layer 1 Green tasks are complete.

### HTTP Fetch Helper with Retry and Rate Limiter

**Requires:** Session Acquisition and Cache Green ✓

- [x] **[Red]** Write failing tests — `src/main/integrations/barchart-ivr-scraper.test.ts` _(depends on: Session Acquisition and Cache Green ✓)_
  - Test cases: 5xx returns `network_error` after 2 retries; thrown fetch failure returns `network_error` after 2 retries; retries wait with exponential backoff; 429 returns `rate_limited` with no retry; `Retry-After` value is included when present
  - Spy on `setTimeout` for backoff coverage
  - Run `pnpm test -- src/main/integrations/barchart-ivr-scraper.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/integrations/barchart-ivr-scraper.ts` _(depends on: HTTP Fetch Helper with Retry and Rate Limiter Red ✓)_
  - Add `sleep(ms)`, module-level `RateLimiter`, and internal `fetchApi(url, session, retryCount = 0)`
  - Enforce ≥1000 ms between API calls, retry network/5xx failures up to 2 times with jittered exponential backoff, and return `rate_limited` immediately on 429
  - Reuse `isNetworkError` from `src/main/integrations/integration-errors.ts` when classifying thrown failures
  - Run `pnpm test -- src/main/integrations/barchart-ivr-scraper.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/integrations/barchart-ivr-scraper.ts` _(depends on: HTTP Fetch Helper with Retry and Rate Limiter Green ✓)_
  - **Invoke `source-command-refactor` (the migrated `/refactor` command)** — do not substitute a manual cleanup or only the `code-simplifier` skill
  - Keep the helper internal and confirm the rate limiter only gates API calls, not the infrequent session bootstrap
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Public API Orchestration

> This layer starts after all dependency Greens from Layers 1 and 2 are complete.

### Main Function: `fetchIVR`

**Requires:** Schemas and Result Types Green ✓, Ticker Validation Green ✓, Session Acquisition and Cache Green ✓, HTTP Fetch Helper with Retry and Rate Limiter Green ✓, JSON Parser Green ✓

- [x] **[Red]** Write failing tests — `src/main/integrations/barchart-ivr-scraper.test.ts` _(depends on: all required Green tasks ✓)_
  - Test cases: ok result for `SPY`; lowercase ticker is uppercased in URL and result; `observedAt` is valid ISO-8601; `not_available` propagates; `parse_error` propagates; `network_error` propagates; `rate_limited` propagates; INFO log emitted on successful fetch
  - Run `pnpm test -- src/main/integrations/barchart-ivr-scraper.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/integrations/barchart-ivr-scraper.ts` _(depends on: Main Function: `fetchIVR` Red ✓)_
  - Export `fetchIVR(ticker: string): Promise<IVRResult>`
  - Sequence the flow exactly as planned: normalize ticker → validate → get session → call API URL with `baseSymbol`, fields, `limit=1`, `raw=1` → parse JSON → return typed result
  - Catch unexpected throws and convert them to `{ status: 'network_error', error: { code: 'NETWORK_FAILURE', message } }`
  - Log `logger.info({ ticker, ivr }, 'Barchart IVR fetched')` on `ok`
  - Run `pnpm test -- src/main/integrations/barchart-ivr-scraper.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/integrations/barchart-ivr-scraper.ts` _(depends on: Main Function: `fetchIVR` Green ✓)_
  - **Invoke `source-command-refactor` (the migrated `/refactor` command)** — do not substitute a manual cleanup or only the `code-simplifier` skill
  - Keep orchestration thin: validate → session → fetch → parse, with no logic leakage from helpers into the public entry point
  - Verify no unused imports remain after the module is complete
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — AC Coverage Tests

> These black-box acceptance tests start after the implementation Green tasks are complete.

### AC-Level `fetchIVR` Coverage

**Requires:** Main Function: `fetchIVR` Green ✓

- [x] **[Red]** Write failing AC tests — `src/main/integrations/barchart-ivr-scraper.test.ts` _(depends on: Main Function: `fetchIVR` Green ✓)_
  - One `it()` per acceptance scenario, mirrored to the Barchart implementation: covered ticker returns `ok`; `ivr` rounds to 1 decimal; uncovered ticker returns `not_available`; missing response fields return `parse_error`; parse failure emits WARN log; network failure returns `network_error` after retries; HTTP 429 returns `rate_limited` with no retry; polite user-agent is sent; invalid input returns `invalid_input` without network access
  - Group them under `describe('fetchIVR — AC coverage')`
  - Run `pnpm test -- src/main/integrations/barchart-ivr-scraper.test.ts` — all new tests must fail
- [x] **[Green]** Make AC tests pass — `src/main/integrations/barchart-ivr-scraper.ts` _(depends on: AC-Level `fetchIVR` Coverage Red ✓)_
  - No new feature surface expected beyond finishing the production code from earlier layers and aligning any mismatched messages/logging
  - Run `pnpm test -- src/main/integrations/barchart-ivr-scraper.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/integrations/barchart-ivr-scraper.test.ts` _(depends on: AC-Level `fetchIVR` Coverage Green ✓)_
  - **Invoke `source-command-refactor` (the migrated `/refactor` command)** — do not substitute a manual cleanup or only the `code-simplifier` skill
  - Extract shared mock helpers such as `mockSession()`, `mockApiOk()`, and `mockApi429()` if repetition obscures the scenarios
  - Confirm each AC test name mirrors the scenario title closely
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for the right reason)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] AC tests cover every scenario from `docs/epics/06-stories/US-43-market-chameleon-ivr-scraper.md`, adapted to the documented Barchart pivot
- [x] `pnpm test && pnpm lint && pnpm typecheck` — all clean

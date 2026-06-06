---
story: us-43
kind: feature
parent: null
topics: [market-data, iv-rank]
status: planned
---

# Implementation Plan: US-43 — Market Chameleon IVR Scraper

## Summary

Implements `fetchMarketChameleonIVR(ticker)` — a pure TypeScript module in `src/main/integrations/market-chameleon-scraper.ts` that fetches IV Rank (and optionally IV Percentile) from Market Chameleon's free public IV pages using `cheerio` for HTML parsing. The function returns a typed discriminated union (`MCIVRResult`) and never throws. No DB, no IPC, no UI — this is the foundational fetch primitive that US-44 (scheduled collection) and US-45 (UI display) will consume.

## Supporting Documents

- **User Story & Acceptance Criteria:** `docs/epics/06-stories/US-43-market-chameleon-ivr-scraper.md`
- **Research & Design Decisions:** `plans/us-43/research.md`
- **Data Model:** `plans/us-43/data-model.md`
- **Quickstart & Verification:** `plans/us-43/quickstart.md`

## Prerequisites

- `cheerio` must be added as a production dependency (`pnpm add cheerio`)
- Selector discovery: before Green phase, manually inspect `https://marketchameleon.com/Overview/SPY/IV/` in a browser to identify the CSS selectors for IV Rank and IV Percentile. Document them as constants in the scraper.
- The lightweight fetch test script (`scripts/test-mc-fetch.ts`) should be run first to confirm plain HTTPS fetch + cheerio can retrieve IV data from the live page.

## Implementation Areas

---

### 1. Zod Schemas and TypeScript Types

**Files to create or modify:**

- `src/main/integrations/market-chameleon-scraper.ts` — create new file; define all Zod schemas and export TypeScript types

**Red — tests to write:**

In `src/main/integrations/market-chameleon-scraper.test.ts`:

- Test: `MCIVRDataSchema rejects ivr below 0` — assert `MCIVRDataSchema.safeParse({ ticker: 'SPY', ivr: -1, observedAt: new Date().toISOString(), source: 'market-chameleon' }).success === false`
- Test: `MCIVRDataSchema rejects ivr above 100` — same pattern with `ivr: 101`
- Test: `MCIVRDataSchema rejects invalid ticker` — ticker `'sp y'` (contains space) fails
- Test: `MCIVRDataSchema accepts valid ok result` — full valid payload passes

**Green — implementation:**

- Define `MCIVRDataSchema` (Zod): `z.object({ ticker: z.string().regex(/^[A-Z0-9]{1,5}$/), ivr: z.number().min(0).max(100), ivp: z.number().min(0).max(100).optional(), iv30: z.number().positive().optional(), observedAt: z.string().datetime(), source: z.literal('market-chameleon') })`
- Export `MCIVRData` type inferred from schema
- Define `MCIVRResult` discriminated union as documented in `plans/us-43/data-model.md` — six variants: `ok | not_available | parse_error | network_error | rate_limited | invalid_input`
- Export all variant types

**Refactor — cleanup to consider:**

- Check that error variant types are co-located with the schema (no split across files)
- Confirm type names follow existing integration naming conventions in `src/main/integrations/`

**Acceptance criteria covered:**

- Scenario: Scrape IVR for a covered ticker (data shape definition)
- All scenarios (typed return contract)

---

### 2. Ticker Validator

**Files to create or modify:**

- `src/main/integrations/market-chameleon-scraper.ts` — add `validateTicker(ticker: string): boolean`

**Red — tests to write:**

In `src/main/integrations/market-chameleon-scraper.test.ts`:

- Test: `fetchMarketChameleonIVR — invalid ticker (empty string)` — assert `result.status === 'invalid_input'` and `result.error.code === 'INVALID_TICKER'`
- Test: `fetchMarketChameleonIVR — invalid ticker (non-alphanumeric)` — ticker `'SP-Y'` → `invalid_input`
- Test: `fetchMarketChameleonIVR — invalid ticker (too long, 6 chars)` — ticker `'TOOLNG'` → `invalid_input`
- Test: `fetchMarketChameleonIVR — does not issue a network request for invalid ticker` — assert `mockFetch` not called after stubbing global fetch

**Green — implementation:**

- `validateTicker(ticker: string): boolean` — normalizes to uppercase, tests against `/^[A-Z0-9]{1,5}$/`
- In `fetchMarketChameleonIVR`, call `validateTicker` first; return `{ status: 'invalid_input', error: { code: 'INVALID_TICKER' } }` immediately if invalid

**Refactor — cleanup to consider:**

- Ensure normalisation (`.toUpperCase()`) happens before the regex test so callers can pass lowercase tickers

**Acceptance criteria covered:**

- Scenario: Invalid input

---

### 3. RateLimiter and HTTP Fetch Helper

**Files to create or modify:**

- `src/main/integrations/market-chameleon-scraper.ts` — add `RateLimiter` class and `fetchPageHtml` function (module-internal, not exported)

**Red — tests to write:**

In `src/main/integrations/market-chameleon-scraper.test.ts`:

- Test: `fetchMarketChameleonIVR — User-Agent header matches Wheelbase/{version}` — stub global fetch to capture request init; assert `headers['User-Agent']` starts with `'Wheelbase/'`
- Test: `fetchMarketChameleonIVR — network_error on 5xx after 2 retries` — stub fetch to return 503 three times; assert result `status === 'network_error'` and `error.code === 'NETWORK_FAILURE'` and message includes `'503'`; assert fetch was called 3 times total
- Test: `fetchMarketChameleonIVR — network_error on timeout (fetch throws)` — stub fetch to throw `TypeError('fetch failed')`; assert `status === 'network_error'`; assert fetch called 3 times
- Test: `fetchMarketChameleonIVR — retry uses exponential backoff (sleep called between retries)` — spy on `setTimeout`; stub fetch to fail twice then succeed; assert `setTimeout` called at least twice with increasing delays
- Test: `fetchMarketChameleonIVR — rate_limited on 429` — stub fetch to return 429; assert `status === 'rate_limited'` and fetch called exactly once (no retry)
- Test: `fetchMarketChameleonIVR — rate_limited message includes Retry-After when header present` — stub 429 response with `Retry-After: 60` header; assert message includes `'60'`

**Green — implementation:**

- `RateLimiter` class: `private lastAt = 0`; `async throttle(minMs = 1000)` — computes `wait = minMs - (Date.now() - lastAt)`, sleeps if positive, updates `lastAt`. Module-level singleton `const rateLimiter = new RateLimiter()`.
- `USER_AGENT` constant: read version from `../../../package.json` (using `createRequire`), produce `Wheelbase/${version} (+mailto:jcteague@gmail.com)`
- `fetchPageHtml(url: string): Promise<string>` — calls `rateLimiter.throttle()`, then `fetch(url, { headers: { 'User-Agent': USER_AGENT } })`. On 429: return `rate_limited` result immediately. On 5xx or network throw: retry up to 2 times with `Math.random() * 1000 * 2^attempt` ms backoff. On other non-200: throw with status. On 200: return `response.text()`.

**Refactor — cleanup to consider:**

- Extract `sleep(ms)` as a named function (not inline `new Promise(...)`) for readability
- Confirm `isNetworkError` from `./integration-errors.ts` is used to classify thrown errors consistently with the rest of the integration layer

**Acceptance criteria covered:**

- Scenario: Network failure (retry up to 2 times with exponential backoff)
- Scenario: Rate limit / HTTP 429
- Scenario: Request identifies a polite user agent

---

### 4. HTML Parser

**Files to create or modify:**

- `src/main/integrations/market-chameleon-scraper.ts` — add `parseIVRFromHtml(ticker: string, html: string): MCIVRResult`

**Red — tests to write:**

In `src/main/integrations/market-chameleon-scraper.test.ts`:

> Note: tests use fixture HTML strings (not live network). Load representative HTML captured from a real Market Chameleon IV page. Store fixtures as `const` strings inline or in `src/main/integrations/__fixtures__/mc-ivr-spy.html`.

- Test: `parseIVRFromHtml — returns ok with ivr rounded to 1 dp from fixture HTML` — pass fixture HTML with known IVR value `"45.678"`, assert `result.data.ivr === 45.7`
- Test: `parseIVRFromHtml — returns ok with ivp when element present` — fixture with IVP element, assert `result.data.ivp` is a number
- Test: `parseIVRFromHtml — returns ok without ivp when element absent` — fixture without IVP element, assert `result.data.ivp === undefined`
- Test: `parseIVRFromHtml — returns not_available when IVR section absent and "not available" text found` — fixture with empty/absent IVR section, assert `status === 'not_available'` and `error.code === 'TICKER_NOT_COVERED'`
- Test: `parseIVRFromHtml — returns parse_error when selector not found and no "not available" marker` — fixture with unexpected HTML structure, assert `status === 'parse_error'` and `error.code === 'PARSE_FAILED'` and `error.message` contains the selector attempted
- Test: `parseIVRFromHtml — parse_error htmlSnippet is first 500 chars of html` — assert `error.htmlSnippet === html.slice(0, 500)`
- Test: `parseIVRFromHtml — parse_error emits WARN-level log` — spy on logger; assert `logger.warn` called once

**Green — implementation:**

> **Prerequisite:** Identify the actual CSS selectors by inspecting the live page in a browser (see `plans/us-43/quickstart.md`). Define them as named constants at the top of the module:
> ```typescript
> const IVR_SELECTOR = '...'   // to be determined from live page inspection
> const IVP_SELECTOR = '...'   // to be determined, optional
> const NOT_AVAILABLE_MARKER = '...' // text or element that signals "not covered"
> ```

- `parseIVRFromHtml(ticker: string, html: string): MCIVRResult`:
  1. `cheerio.load(html)` → `$`
  2. Check for `NOT_AVAILABLE_MARKER` → return `not_available`
  3. Extract IVR text via `$(IVR_SELECTOR).first().text().trim()` → parse float → round to 1 dp with `Math.round(v * 10) / 10`
  4. If IVR element absent → emit `logger.warn(...)` → return `parse_error` with `message` containing `IVR_SELECTOR`, `htmlSnippet: html.slice(0, 500)`
  5. Optionally extract IVP and IV30 from their selectors
  6. Return `{ status: 'ok', data: { ticker, ivr, ivp?, iv30?, observedAt: new Date().toISOString(), source: 'market-chameleon' } }`
- Import `logger` from `'../logger'` (pino instance) — use `logger.warn(...)` on parse failure

**Refactor — cleanup to consider:**

- Ensure the float→1dp rounding is a named helper (`roundTo1dp`) to keep the parser readable
- Confirm `cheerio` import style matches project ESM conventions (`import * as cheerio from 'cheerio'`)

**Acceptance criteria covered:**

- Scenario: Scrape IVR for a covered ticker (ivr rounded to 1 dp, ivp optional)
- Scenario: Ticker not covered on free tier
- Scenario: Page structure changed and IVR could not be parsed

---

### 5. Main Function: `fetchMarketChameleonIVR`

**Files to create or modify:**

- `src/main/integrations/market-chameleon-scraper.ts` — add and export `fetchMarketChameleonIVR(ticker: string): Promise<MCIVRResult>`

**Red — tests to write:**

In `src/main/integrations/market-chameleon-scraper.test.ts`:

- Test: `fetchMarketChameleonIVR — ok result for covered ticker (SPY)` — stub global fetch to return 200 with fixture HTML; assert `status === 'ok'` and `data.ticker === 'SPY'` and `data.source === 'market-chameleon'` and `data.ivr` is a number
- Test: `fetchMarketChameleonIVR — passes uppercase ticker in URL even when caller passes lowercase` — stub fetch; call with `'spy'`; assert URL contains `/SPY/`
- Test: `fetchMarketChameleonIVR — observedAt is a valid ISO-8601 string` — from ok result, assert `new Date(result.data.observedAt).toISOString() === result.data.observedAt`
- Test: `fetchMarketChameleonIVR — not_available when page returns not-available fixture` — stub fetch with not-available HTML; assert `status === 'not_available'`
- Test: `fetchMarketChameleonIVR — parse_error propagated from parser` — stub fetch with unexpected HTML; assert `status === 'parse_error'`
- Test: `fetchMarketChameleonIVR — network_error propagated from fetch helper` — stub fetch to throw; assert `status === 'network_error'`
- Test: `fetchMarketChameleonIVR — rate_limited propagated from fetch helper` — stub 429; assert `status === 'rate_limited'`

**Green — implementation:**

- `fetchMarketChameleonIVR(ticker: string): Promise<MCIVRResult>`:
  1. Normalize ticker: `const t = ticker.toUpperCase()`
  2. Validate: if `!validateTicker(t)` → return `invalid_input`
  3. Build URL: `` `https://marketchameleon.com/Overview/${t}/IV/` ``
  4. Call `fetchPageHtml(url)` — catches propagated `rate_limited` / `network_error` from `fetchPageHtml`
  5. Pass HTML to `parseIVRFromHtml(t, html)`
  6. Return result
- Wrap step 4–5 in try/catch to ensure any unexpected throw becomes `network_error`
- Log INFO on `ok` result: `logger.info({ ticker: t, ivr: result.data.ivr }, 'MC IVR fetched')`

**Refactor — cleanup to consider:**

- Check for duplication and naming consistency across validate → fetch → parse flow
- Verify logger calls: INFO on ok, WARN on parse_error (in parser), no logging on other error paths (callers observe the typed result)

**Acceptance criteria covered:**

- All scenarios — this is the public API that wires every piece together

---

### 6. E2e Tests

**Files to create or modify:**

- `src/main/integrations/market-chameleon-scraper.test.ts` — AC-level describe block at the bottom: `describe('fetchMarketChameleonIVR — AC coverage')`

> These tests treat `fetchMarketChameleonIVR` as a black box and map 1:1 to story ACs. All use stubbed fetch (no live network).

**Red — tests to write (one per AC):**

- Test: `AC: Scrape IVR for a covered ticker — returns ok with ivr, ivp, observedAt, source` — stub fetch 200 with SPY fixture HTML; assert `status === 'ok'`, `data.ivr` is `number`, `data.ticker === 'SPY'`, `data.source === 'market-chameleon'`, `data.observedAt` matches ISO-8601
- Test: `AC: ivr is rounded to one decimal place` — stub fixture with raw IVR value `"67.333"`; assert `result.data.ivr === 67.3`
- Test: `AC: Ticker not covered on free tier — returns not_available` — stub fetch 200 with not-covered fixture; assert `status === 'not_available'`, `error.code === 'TICKER_NOT_COVERED'`, `error.message` includes `'ILLIQUID'`
- Test: `AC: Page structure changed — returns parse_error with selector and htmlSnippet` — stub fetch 200 with empty-body HTML; assert `status === 'parse_error'`, `error.code === 'PARSE_FAILED'`, `error.message` contains selector name, `error.htmlSnippet.length <= 500`
- Test: `AC: Page structure changed — emits WARN log` — spy logger; same fixture; assert `logger.warn` called
- Test: `AC: Network failure — returns network_error after 2 retries` — stub fetch to throw `TypeError('fetch failed')` three times; assert `status === 'network_error'`, `error.code === 'NETWORK_FAILURE'`, fetch called 3 times
- Test: `AC: Rate limit HTTP 429 — returns rate_limited, no retry` — stub fetch to return 429; assert `status === 'rate_limited'`, `error.code === 'RATE_LIMITED'`, fetch called exactly 1 time
- Test: `AC: Rate limit HTTP 429 — message includes Retry-After if present` — stub 429 with `Retry-After: 120` header; assert `error.message` includes `'120'`
- Test: `AC: Request identifies a polite user agent` — stub fetch 200 with fixture; assert `User-Agent` header passed to fetch starts with `'Wheelbase/'`
- Test: `AC: Invalid input — empty ticker returns invalid_input without network request` — call with `''`; assert `status === 'invalid_input'`, `error.code === 'INVALID_TICKER'`, fetch not called
- Test: `AC: Invalid input — non-alphanumeric ticker returns invalid_input` — call with `'SP-Y'`; assert same

**Green — implementation:**

No new implementation code — all behaviour is already wired in Areas 1–5. This area only requires writing the AC-level test describe block.

**Refactor — cleanup to consider:**

- Extract fixture HTML strings into named constants or a `__fixtures__/` directory to avoid repetition across unit and AC tests
- Confirm each AC test has a descriptive name that mirrors the Gherkin scenario title exactly

**Acceptance criteria covered:**

- All 7 Gherkin scenarios from the user story

---
story: us-43
kind: feature
parent: null
topics: [market-data, iv-rank]
status: planned
---

# Implementation Plan: US-43 — IVR Scraper (Barchart)

## Summary

Implements `fetchIVR(ticker)` — a pure TypeScript module in `src/main/integrations/barchart-ivr-scraper.ts` that fetches IV Rank and IV Percentile from Barchart's internal JSON API (`/proxies/core-api/v1/options/get`). Returns a typed discriminated union (`IVRResult`) and never throws. No DB, no IPC, no UI. This is the foundational fetch primitive that US-44 (scheduled collection) and US-45 (UI display) will consume.

**Note:** The story originally specified Market Chameleon + cheerio. We pivoted to Barchart after discovering MC's IVR data requires JavaScript rendering and a custom XOR cipher — see `plans/us-43/research.md`. Barchart returns the same data as clean JSON via an unauthenticated API call.

## Supporting Documents

- **User Story & Acceptance Criteria:** `docs/epics/06-stories/US-43-market-chameleon-ivr-scraper.md`
- **Research & Design Decisions:** `plans/us-43/research.md`
- **Data Model:** `plans/us-43/data-model.md`
- **Quickstart & Verification:** `plans/us-43/quickstart.md`

## Prerequisites

- `cheerio` was added to `package.json` during research but is **not needed** for this module — do not import it.
- No migrations required.

## Implementation Areas

---

### 1. Zod Schemas and TypeScript Types

**Files to create or modify:**

- `src/main/integrations/barchart-ivr-scraper.ts` — create new file; define all Zod schemas and export TypeScript types

**Red — tests to write:**

In `src/main/integrations/barchart-ivr-scraper.test.ts`:

- Test: `IVRDataSchema rejects ivr below 0` — `IVRDataSchema.safeParse({ ticker: 'SPY', ivr: -1, observedAt: new Date().toISOString(), source: 'barchart' }).success === false`
- Test: `IVRDataSchema rejects ivr above 100` — same with `ivr: 101`
- Test: `IVRDataSchema rejects invalid ticker` — ticker `'SP Y'` fails regex
- Test: `IVRDataSchema accepts valid payload` — full valid object passes

**Green — implementation:**

- `IVRDataSchema`: `z.object({ ticker: z.string().regex(/^[A-Z0-9]{1,5}$/), ivr: z.number().min(0).max(100), ivp: z.number().min(0).max(100).optional(), iv30: z.number().positive().optional(), observedAt: z.string().datetime(), source: z.literal('barchart') })`
- Export `IVRData` type: `z.infer<typeof IVRDataSchema>`
- Define `IVRResult` discriminated union — six variants as documented in `plans/us-43/data-model.md`: `ok | not_available | parse_error | network_error | rate_limited | invalid_input`
- Export all six variant types

**Refactor — cleanup to consider:**

- Confirm all exported type names follow the existing integration naming conventions in `src/main/integrations/`

**Acceptance criteria covered:**

- Scenario: Scrape IVR for a covered ticker (data shape definition)
- All scenarios (typed return contract)

---

### 2. Ticker Validator

**Files to create or modify:**

- `src/main/integrations/barchart-ivr-scraper.ts` — add `validateTicker(ticker: string): boolean`

**Red — tests to write:**

In `src/main/integrations/barchart-ivr-scraper.test.ts`:

- Test: `fetchIVR — invalid ticker (empty string)` — assert `result.status === 'invalid_input'` and `result.error.code === 'INVALID_TICKER'`
- Test: `fetchIVR — invalid ticker (non-alphanumeric, "SP-Y")` — `invalid_input`
- Test: `fetchIVR — invalid ticker (too long, 6 chars)` — `invalid_input`
- Test: `fetchIVR — does not issue network request for invalid ticker` — assert `mockFetch` not called

**Green — implementation:**

- `validateTicker(ticker: string): boolean` — `ticker.toUpperCase()` then test `/^[A-Z0-9]{1,5}$/`
- In `fetchIVR`, call `validateTicker(ticker.toUpperCase())` first; return `{ status: 'invalid_input', error: { code: 'INVALID_TICKER' } }` if false

**Refactor — cleanup to consider:**

- Ensure normalisation (`.toUpperCase()`) happens before the regex test so callers can pass lowercase tickers

**Acceptance criteria covered:**

- Scenario: Invalid input

---

### 3. Session Acquisition and Cache

**Files to create or modify:**

- `src/main/integrations/barchart-ivr-scraper.ts` — add `getSession()`, module-level `sessionCache`, `USER_AGENT` constant

**Red — tests to write:**

In `src/main/integrations/barchart-ivr-scraper.test.ts`:

> All tests stub global `fetch` with `vi.stubGlobal('fetch', mockFetch)`. Two sequential mock responses are needed per test: (1) session acquisition → mock Response with `Set-Cookie` headers; (2) API call → mock JSON response.

- Test: `fetchIVR — acquires session by fetching a Barchart page on first call` — assert `mockFetch` called with a `barchart.com` URL before the API URL
- Test: `fetchIVR — sends X-XSRF-TOKEN header derived from Set-Cookie` — stub session response with `Set-Cookie: XSRF-TOKEN=abc123; path=/`; assert second fetch call has `X-XSRF-TOKEN: abc123`
- Test: `fetchIVR — sends Cookie header from session` — assert second fetch call has `Cookie` header containing the session cookies
- Test: `fetchIVR — reuses cached session on second call` — call `fetchIVR` twice; assert session-acquisition fetch called exactly once total
- Test: `fetchIVR — User-Agent header includes Wheelbase/{version}` — assert both fetch calls send `User-Agent` starting with `'Wheelbase/'`

**Green — implementation:**

- `USER_AGENT` constant: `import pkg from '../../../package.json'; export const USER_AGENT = \`Wheelbase/${pkg.version} (+mailto:jcteague@gmail.com)\``
- `SessionCache` type: `{ cookies: string; xsrf: string; expiresAt: number }`
- Module-level `let sessionCache: SessionCache | null = null`
- `getSession(): Promise<{ cookies: string; xsrf: string }>`:
  1. Return cache if `sessionCache && Date.now() < sessionCache.expiresAt`
  2. `fetch('https://www.barchart.com/stocks/quotes/SPY/options', { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' } })`
  3. Extract `Set-Cookie` headers: `r.headers.getSetCookie()`
  4. Build `cookies` string: `headers.map(c => c.split(';')[0]).join('; ')`
  5. Extract `xsrf`: find the `XSRF-TOKEN=...` cookie, URL-decode the value
  6. Set `sessionCache = { cookies, xsrf, expiresAt: Date.now() + 30 * 60 * 1000 }`
  7. Return `{ cookies, xsrf }`

**Refactor — cleanup to consider:**

- Extract the XSRF extraction logic into a named helper `extractXsrf(setCookieHeaders: string[]): string` for readability
- Check: does `Response.headers.getSetCookie()` exist in the Node version used by Electron? If not, fall back to `r.headers.get('set-cookie')`

**Acceptance criteria covered:**

- Scenario: Request identifies a polite user agent

---

### 4. HTTP Fetch Helper with Retry and Rate Limiter

**Files to create or modify:**

- `src/main/integrations/barchart-ivr-scraper.ts` — add `RateLimiter` class, `sleep()`, `fetchApi()` (module-internal)

**Red — tests to write:**

In `src/main/integrations/barchart-ivr-scraper.test.ts`:

- Test: `fetchIVR — network_error on 5xx after 2 retries` — stub API fetch to return 503 three times; assert `status === 'network_error'`, `error.code === 'NETWORK_FAILURE'`, message includes `'503'`; assert API fetch called 3 times total
- Test: `fetchIVR — network_error when fetch throws (network failure)` — stub fetch to throw `TypeError('fetch failed')` on API call; assert `status === 'network_error'`; assert retried 3 times
- Test: `fetchIVR — retries use exponential backoff (setTimeout called between retries)` — spy `setTimeout`; stub API fetch to fail twice then succeed; assert `setTimeout` called at least twice
- Test: `fetchIVR — rate_limited on 429, fetch called exactly once for API` — stub API fetch to return 429; assert `status === 'rate_limited'`, `error.code === 'RATE_LIMITED'`; assert API fetch called 1 time (no retry)
- Test: `fetchIVR — rate_limited message includes Retry-After when header present` — stub 429 with `Retry-After: 60` header; assert `error.message` includes `'60'`

**Green — implementation:**

- `sleep(ms: number): Promise<void>` — `new Promise(resolve => setTimeout(resolve, ms))`
- `RateLimiter` class: `private lastAt = 0`; `async throttle(minMs = 1000)` — wait if `Date.now() - lastAt < minMs`, then update `lastAt`. Module-level singleton: `const rateLimiter = new RateLimiter()`
- `fetchApi(url: string, session: { cookies: string; xsrf: string }, retryCount = 0): Promise<Response>`:
  1. `await rateLimiter.throttle()`
  2. `fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json', 'X-XSRF-TOKEN': session.xsrf, 'Cookie': session.cookies } })`
  3. On throw: if `retryCount < 2` → `await sleep(Math.random() * 1000 * 2 ** retryCount)` → recurse; else return `network_error` result
  4. On 429: return `rate_limited` result immediately (include `Retry-After` header in message if present)
  5. On 5xx: if `retryCount < 2` → backoff → recurse; else return `network_error`
  6. Return response for caller to parse

**Refactor — cleanup to consider:**

- Use `isNetworkError` from `./integration-errors.ts` consistently with the rest of the integration layer when classifying thrown errors
- Confirm `RateLimiter` is a class rather than a closure — matches the existing project style preference for named constructs

**Acceptance criteria covered:**

- Scenario: Network failure (retry up to 2 times with exponential backoff)
- Scenario: Rate limit / HTTP 429
- Scenario: Request identifies a polite user agent (rate ≤ 1 req/sec)

---

### 5. JSON Parser

**Files to create or modify:**

- `src/main/integrations/barchart-ivr-scraper.ts` — add `parseIVRResponse(ticker: string, body: unknown): IVRResult`

**Red — tests to write:**

In `src/main/integrations/barchart-ivr-scraper.test.ts`:

> Use inline fixture objects (not network calls) for the parser tests.

- Test: `parseIVRResponse — returns ok with ivr from impliedVolatilityRank1y` — pass fixture `{ count: 1, data: [{ raw: { impliedVolatilityRank1y: 45.678, impliedVolatilityPercentile1y: 0.72, historicVolatility20d: 18.5 }, baseSymbol: 'SPY' } ] }`; assert `result.data.ivr === 45.7`
- Test: `parseIVRResponse — ivr rounded to 1 decimal place` — input `impliedVolatilityRank1y: 67.333`; assert `result.data.ivr === 67.3`
- Test: `parseIVRResponse — ivp is impliedVolatilityPercentile1y * 100, rounded to 1 dp` — input `0.81673`; assert `result.data.ivp === 81.7`
- Test: `parseIVRResponse — iv30 is historicVolatility20d when present` — assert `result.data.iv30 === 18.5`
- Test: `parseIVRResponse — ivp absent when impliedVolatilityPercentile1y is null` — input `impliedVolatilityPercentile1y: null`; assert `result.data.ivp === undefined`
- Test: `parseIVRResponse — returns not_available when count is 0` — `{ count: 0, data: [] }`; assert `status === 'not_available'`, `error.code === 'TICKER_NOT_COVERED'`, message includes ticker
- Test: `parseIVRResponse — returns parse_error when impliedVolatilityRank1y missing` — `{ count: 1, data: [{ raw: {} }] }`; assert `status === 'parse_error'`, `error.code === 'PARSE_FAILED'`, `error.message` contains `'impliedVolatilityRank1y'`
- Test: `parseIVRResponse — parse_error rawSnippet is first 500 chars of serialised data[0]` — assert `error.rawSnippet.length <= 500`
- Test: `parseIVRResponse — parse_error emits WARN log` — spy on `logger.warn`; assert called once

**Green — implementation:**

- `roundTo1dp(n: number): number` — `Math.round(n * 10) / 10`
- `parseIVRResponse(ticker: string, body: unknown): IVRResult`:
  1. Cast `body` as `{ count: number; data: Array<{ raw: Record<string, unknown> }> }`
  2. If `body.count === 0` → return `not_available`
  3. Extract `raw = body.data[0]?.raw`
  4. If `typeof raw?.impliedVolatilityRank1y !== 'number'` → emit `logger.warn(...)` → return `parse_error` with message `'Expected impliedVolatilityRank1y in Barchart response'` and `rawSnippet: JSON.stringify(body.data[0]).slice(0, 500)`
  5. Build result: `ivr = roundTo1dp(raw.impliedVolatilityRank1y)`, `ivp = typeof raw.impliedVolatilityPercentile1y === 'number' ? roundTo1dp(raw.impliedVolatilityPercentile1y * 100) : undefined`, `iv30 = typeof raw.historicVolatility20d === 'number' ? raw.historicVolatility20d : undefined`
  6. Return `{ status: 'ok', data: { ticker, ivr, ivp, iv30, observedAt: new Date().toISOString(), source: 'barchart' } }`
- Import `logger` from `'../logger'` — `logger.warn(...)` on parse failure only

**Refactor — cleanup to consider:**

- Confirm `roundTo1dp` is shared with Area 1 (Zod validation) rather than duplicated

**Acceptance criteria covered:**

- Scenario: Scrape IVR for a covered ticker (ivr rounded to 1 dp, ivp present)
- Scenario: Ticker not covered on free tier
- Scenario: Page structure changed / response fields missing (parse_error)

---

### 6. Main Function: `fetchIVR`

**Files to create or modify:**

- `src/main/integrations/barchart-ivr-scraper.ts` — add and export `fetchIVR(ticker: string): Promise<IVRResult>`

**Red — tests to write:**

In `src/main/integrations/barchart-ivr-scraper.test.ts`:

- Test: `fetchIVR — ok result for SPY` — stub session fetch + API fetch with valid fixture; assert `status === 'ok'`, `data.ticker === 'SPY'`, `data.source === 'barchart'`, `data.ivr` is a number
- Test: `fetchIVR — accepts lowercase ticker, upcases it in request URL and result` — call `fetchIVR('spy')`; assert URL contains `baseSymbol=SPY` and `result.data.ticker === 'SPY'`
- Test: `fetchIVR — observedAt is valid ISO-8601` — assert `new Date(result.data.observedAt).toISOString() === result.data.observedAt`
- Test: `fetchIVR — not_available propagated from parser` — stub API with `count: 0` fixture; assert `status === 'not_available'`
- Test: `fetchIVR — parse_error propagated from parser` — stub API with missing-field fixture; assert `status === 'parse_error'`
- Test: `fetchIVR — network_error propagated from fetch helper` — stub API fetch to throw; assert `status === 'network_error'`
- Test: `fetchIVR — rate_limited propagated from fetch helper` — stub 429; assert `status === 'rate_limited'`
- Test: `fetchIVR — logs INFO on ok result` — spy `logger.info`; assert called with `{ ticker, ivr }` context

**Green — implementation:**

- `fetchIVR(ticker: string): Promise<IVRResult>`:
  1. `const t = ticker.toUpperCase()`
  2. If `!validateTicker(t)` → return `invalid_input`
  3. `const session = await getSession()` — catches throw, returns `network_error` if session fetch fails
  4. Build API URL: `` `https://www.barchart.com/proxies/core-api/v1/options/get?baseSymbol=${t}&fields=baseSymbol,impliedVolatilityRank1y,impliedVolatilityPercentile1y,historicVolatility20d&limit=1&raw=1` ``
  5. `const response = await fetchApi(url, session)` — already returns typed `IVRResult` on error paths; returns `Response` on 200
  6. If response is already an `IVRResult` (rate_limited / network_error from fetchApi) → return it
  7. `const body = await response.json()`
  8. `const result = parseIVRResponse(t, body)`
  9. If `result.status === 'ok'` → `logger.info({ ticker: t, ivr: result.data.ivr }, 'Barchart IVR fetched')`
  10. Return `result`
- Wrap steps 3–9 in try/catch — any unexpected throw → `{ status: 'network_error', error: { code: 'NETWORK_FAILURE', message: err.message } }`

**Refactor — cleanup to consider:**

- Review the flow for clarity: validate → session → fetch → parse — confirm no logic leaked into the orchestrator beyond sequencing
- Verify no unused imports after all areas are complete

**Acceptance criteria covered:**

- All scenarios — this is the public API wiring every piece together

---

### 7. E2e Tests (AC-level)

**Files to create or modify:**

- `src/main/integrations/barchart-ivr-scraper.test.ts` — AC-level `describe` block: `describe('fetchIVR — AC coverage')`

> These tests treat `fetchIVR` as a black box and map 1:1 to story ACs. All use stubbed fetch — no live network.

**Red — tests to write (one per AC):**

- Test: `AC: Scrape IVR for a covered ticker — returns ok with ivr, ivp, observedAt, source` — stub session + API with SPY fixture; assert `status === 'ok'`, `data.ivr` is number 0–100, `data.ticker === 'SPY'`, `data.source === 'barchart'`, `data.observedAt` parses as ISO-8601
- Test: `AC: ivr is rounded to one decimal place` — stub API fixture with `impliedVolatilityRank1y: 67.333`; assert `result.data.ivr === 67.3`
- Test: `AC: Ticker not covered — returns not_available with TICKER_NOT_COVERED` — stub API with `count: 0`; assert `status === 'not_available'`, `error.code === 'TICKER_NOT_COVERED'`; assert `error.message` includes ticker name
- Test: `AC: Response fields missing — returns parse_error with PARSE_FAILED` — stub API with `{ count: 1, data: [{ raw: {} }] }`; assert `status === 'parse_error'`, `error.code === 'PARSE_FAILED'`, `error.message` contains `'impliedVolatilityRank1y'`, `error.rawSnippet.length <= 500`
- Test: `AC: Response fields missing — emits WARN log` — same fixture; spy `logger.warn`; assert called
- Test: `AC: Network failure — returns network_error after 2 retries` — stub API fetch to throw `TypeError('fetch failed')` three times; assert `status === 'network_error'`, `error.code === 'NETWORK_FAILURE'`; assert API fetch called 3 times
- Test: `AC: Rate limit HTTP 429 — returns rate_limited, no retry` — stub API 429; assert `status === 'rate_limited'`, `error.code === 'RATE_LIMITED'`; API fetch called exactly 1 time
- Test: `AC: Rate limit HTTP 429 — message includes Retry-After if present` — stub 429 with `Retry-After: 120` header; assert `error.message` includes `'120'`
- Test: `AC: Request identifies a polite user agent` — assert `User-Agent` header on API call starts with `'Wheelbase/'`
- Test: `AC: Invalid input — empty ticker returns invalid_input without network request` — `fetchIVR('')`; assert `status === 'invalid_input'`, fetch not called
- Test: `AC: Invalid input — non-alphanumeric ticker returns invalid_input` — `fetchIVR('SP-Y')`; assert same

**Green — implementation:**

No new production code — all behaviour is wired in Areas 1–6. This area only requires writing the AC-level test `describe` block.

**Refactor — cleanup to consider:**

- Extract shared mock helpers (`mockSession()`, `mockApiOk(ticker, ivr)`, `mockApi429()`) to reduce repetition across unit and AC tests
- Confirm each AC test name mirrors the Gherkin scenario title exactly

**Acceptance criteria covered:**

- All 7 Gherkin scenarios from the user story (mapped to Barchart mechanics)

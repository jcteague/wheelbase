# US-43: IVR Scraper (Barchart)

<!-- generated:from us-43 -->

## Summary

US-43 implements `fetchIVR(ticker)` — a pure TypeScript module in `src/main/integrations/barchart-ivr-scraper.ts` that fetches IV Rank and IV Percentile from Barchart's internal JSON API. Returns a typed discriminated union (`IVRResult`) and never throws. No database writes, no IPC channels, no UI — it is the foundational fetch primitive that US-44 (scheduled collection) and US-45 (UI display) will build on.

The story pivoted from the original Market Chameleon + cheerio specification after investigation revealed MC's IVR data requires JavaScript rendering and a custom XOR cipher on all discovered API endpoints. Barchart provides the same data (IVR + IVP + HV20) as clean JSON via an unauthenticated session-cookie API, tested live against SPY, AAPL, TSLA, and a fictional ticker (`ILLIQUID123`).

Related stories in this IVR cluster:

- US-44 — scheduled IVR collection (stores `fetchIVR` results to the database on a cron schedule)
- US-45 — IVR display in the UI (renders IVR/IVP on position cards and the screener)

## Acceptance criteria

- **AC-1 (Covered ticker):** `fetchIVR("SPY")` returns `{ status: "ok", data: { ticker: "SPY", ivr: number 0..100, ivp?: number 0..100, observedAt: ISO-8601, source: "barchart" } }`; `ivr` is rounded to one decimal place.
- **AC-2 (Ticker not covered):** `count === 0` in the Barchart response returns `{ status: "not_available", error: { code: "TICKER_NOT_COVERED", message includes ticker } }`.
- **AC-3 (Parse error):** `count > 0` but `raw.impliedVolatilityRank1y` is absent or non-numeric returns `{ status: "parse_error", error: { code: "PARSE_FAILED", message includes field name, rawSnippet ≤ 500 chars } }`; a WARN log is emitted.
- **AC-4 (Network failure):** HTTP 5xx or a thrown `TypeError` (DNS/timeout/connection refused) returns `{ status: "network_error", error: { code: "NETWORK_FAILURE" } }` after up to 2 retries with exponential backoff.
- **AC-5 (Rate limit):** HTTP 429 returns `{ status: "rate_limited", error: { code: "RATE_LIMITED", message includes Retry-After if present } }`; no retry.
- **AC-6 (Polite user agent):** Both session-acquisition and API fetches send `User-Agent` starting with `"Wheelbase/{version}"`. Module-level `RateLimiter` enforces ≥ 1000 ms between API calls.
- **AC-7 (Invalid input):** Empty, non-alphanumeric, or >5-char ticker returns `{ status: "invalid_input", error: { code: "INVALID_TICKER" } }` without issuing any network request.

## What was built

- **`fetchIVR(ticker: string): Promise<IVRResult>`** — the public entry point. Normalises the ticker to uppercase, validates it, acquires a Barchart session, calls the JSON API, parses the response, and returns a typed result. Never throws.
- **`IVRResult` discriminated union** — six variants: `ok | not_available | parse_error | network_error | rate_limited | invalid_input`. Each error variant carries a structured `error: { code, message?, rawSnippet? }`.
- **`IVRDataSchema` (Zod)** — validates the `ok` data payload: ticker regex `/^[A-Z0-9]{1,5}$/`, `ivr`/`ivp` in 0–100, optional `iv30`, ISO-8601 `observedAt`, literal `source: 'barchart'`.
- **`getSession(): Promise<SessionResult>`** — harvests a Barchart XSRF token and session cookies from a GET to `barchart.com/stocks/quotes/SPY/options`. Returns `{ ok: true; session } | { ok: false; error }` — never throws.
- **Module-level `SessionCache`** — caches `{ cookies, xsrf, expiresAt }` for 30 minutes, avoiding a session fetch per ticker call.
- **`fetchApi(url, session): Promise<ApiFetchResult>`** — calls the Barchart proxies API with the session headers. Enforces rate limiting, retries network/5xx failures up to twice with jittered exponential backoff (`Math.random() * 1000 * 2^attempt`), and returns `rate_limited` immediately on 429. Returns `{ ok: true; response: Response } | { ok: false; error }`.
- **`createRateLimiter()`** — closure factory returning `{ throttle(minMs) }` that enforces ≥ 1000 ms between API calls. Module-level singleton; gates API calls only (not session acquisition).
- **`parseIVRResponse(ticker, body)`** — maps Barchart raw fields: `impliedVolatilityRank1y → ivr` (0–100, rounded to 1 dp), `impliedVolatilityPercentile1y → ivp` (×100, 1 dp, optional), `historicVolatility20d → iv30` (optional passthrough). Returns `not_available` on `count === 0`; `parse_error` on missing or non-numeric rank field.
- **46 tests** across unit and AC-level describe blocks in `barchart-ivr-scraper.test.ts`. All 7 Gherkin scenarios are covered with stubbed `fetch` — no live network calls in CI.

### Barchart API details

**Endpoint:**

```
GET https://www.barchart.com/proxies/core-api/v1/options/get
  ?baseSymbol={TICKER}
  &fields=baseSymbol,impliedVolatilityRank1y,impliedVolatilityPercentile1y,historicVolatility20d
  &limit=1
  &raw=1
```

**Field mapping (from `raw` object inside `data[0]`):**

| `IVROk.data` field | Barchart raw field                  | Transform                                       |
| ------------------ | ----------------------------------- | ----------------------------------------------- |
| `ivr`              | `raw.impliedVolatilityRank1y`       | `Math.round(v * 10) / 10` — already 0–100 scale |
| `ivp`              | `raw.impliedVolatilityPercentile1y` | `Math.round(v * 1000) / 10` — 0–1 → 0–100, 1 dp |
| `iv30`             | `raw.historicVolatility20d`         | passthrough — optional context                  |
| `observedAt`       | —                                   | `new Date().toISOString()` at fetch time        |
| `source`           | —                                   | literal `"barchart"`                            |

**Authentication:** GET any Barchart page → harvest `Set-Cookie` response headers → extract and URL-decode `XSRF-TOKEN` → send as `X-XSRF-TOKEN` header and `Cookie` header on API calls. No login required.

**"Not covered" detection:** `count: 0` in the response body → ticker has no options data on Barchart → `not_available`.

## Architecture decisions

### Barchart JSON API over Market Chameleon HTML scraping

The original story specified Market Chameleon with `cheerio` parsing. Investigation found MC's IVR data is JavaScript-rendered and all discovered MC API endpoints use a custom XOR cipher keyed to a session cookie — unsuitable for a simple scraper. Playwright headless was also explored but blocked by Cloudflare's HTTP/2 error pages. Barchart returns the same data (IVR + IVP) as clean JSON via an unauthenticated GET with only a session cookie requirement — simpler, more reliable, no cipher. The paid Barchart OnDemand API was rejected (requires API key + paid plan; the internal API requires only a session cookie).

### Two-step session acquisition with module-level cache

On first call, GET a Barchart page to harvest cookies and XSRF token; cache for 30 minutes; reuse on subsequent calls. Per-call session acquisition was considered but rejected as wasteful — US-44 will call `fetchIVR` once per ticker per batch, so a cached session is essential for performance. Hardcoded cookies were rejected as brittle (they expire on server restart). Constructor injection of cookies was rejected as overkill for a single-user desktop app with no testability requirement beyond `vi.stubGlobal`.

### Typed discriminated union — never throws

`IVRResult` is a six-variant discriminated union. The module never throws — every error path returns a typed variant rather than raising. Callers can exhaustively narrow without `try/catch`. This matches the story's acceptance criteria ("no exception is thrown") and is consistent with the broader integration layer convention.

### Typed `SessionResult` and `ApiFetchResult` — no message-string parsing

Identified during refactor: the Green implementation threw on HTTP errors inside `getSession`, and `fetchIVR` caught those throws and used substring matching on the message string to reconstruct typed results. The refactor replaced both with typed discriminated-union returns (`{ ok: true; ... } | { ok: false; error }`), eliminating the message-string anti-pattern and making `fetchIVR`'s orchestration a straight-line happy path with typed early returns.

### `createRateLimiter()` closure factory over class

The Green phase implemented a `RateLimiter` class holding a mutable `lastAt` field. The refactor converted it to a `createRateLimiter()` closure factory that returns `{ throttle(minMs) }`, with `RateLimiter` as a plain TypeScript type. This matches the project's functional-programming standard ("avoid classes in TypeScript; use plain functions and types"). The module-level singleton `const rateLimiter = createRateLimiter()` gates API calls only — not the infrequent session acquisition.

### File and function naming after the actual data source

File: `barchart-ivr-scraper.ts`. Function: `fetchIVR`. Result field: `source: "barchart"`. The story originally named the integration `market-chameleon-scraper.ts`. After the pivot, naming the file and function after the actual data source was chosen to avoid confusing future maintainers. A generic `ivr-scraper.ts` name was also considered but rejected as it obscures which data source is in use.

## Contracts touched

None. US-43 is a pure integration module — it introduces no IPC channels and no database writes. Downstream wiring to the IPC/service layer and the renderer is deferred to US-44 and US-45.

## Source files

- `src/main/integrations/barchart-ivr-scraper.ts` — `fetchIVR`, `IVRResult` union, `IVRDataSchema`, `getSession`, `fetchApi`, `parseIVRResponse`, `createRateLimiter`, result builder helpers
- `src/main/integrations/barchart-ivr-scraper.test.ts` — 46 tests: unit coverage per implementation area + `describe('fetchIVR — AC coverage')` black-box block
<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->

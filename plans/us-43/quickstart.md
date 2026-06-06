# Quickstart: US-43 — IVR Scraper (Barchart)

## Prerequisites

```bash
# After pnpm install, rebuild better-sqlite3 for system Node (required for Vitest)
pnpm rebuild better-sqlite3
```

No migrations required — this story introduces no database changes.

## Run Tests

```bash
# Run only this story's tests
pnpm test -- src/main/integrations/barchart-ivr-scraper.test.ts

# Run with verbose output
pnpm test -- --reporter verbose src/main/integrations/barchart-ivr-scraper.test.ts

# Run all tests (confirm no regressions)
pnpm test
```

## How to Verify Locally Against Live Barchart

Run the test probe script to confirm the API still returns IVR data:

```bash
node scripts/test-bc-fetch.mjs SPY
node scripts/test-bc-fetch.mjs AAPL
node scripts/test-bc-fetch.mjs ZZZNOTREAL   # should show not_available
```

The script performs the same two-step flow the module uses: acquire session cookies, then call the API.

## Expected Passing Criteria

All tests in `src/main/integrations/barchart-ivr-scraper.test.ts` pass:

```
✓ IVRDataSchema — rejects ivr below 0
✓ IVRDataSchema — rejects ivr above 100
✓ IVRDataSchema — rejects invalid ticker
✓ IVRDataSchema — accepts valid payload

✓ fetchIVR — invalid ticker (empty string) → invalid_input, no network request
✓ fetchIVR — invalid ticker (non-alphanumeric) → invalid_input
✓ fetchIVR — invalid ticker (too long, 6 chars) → invalid_input

✓ fetchIVR — acquires session cookies from Barchart on first call
✓ fetchIVR — sends X-XSRF-TOKEN header from session
✓ fetchIVR — sends Cookie header from session
✓ fetchIVR — reuses cached session on second call (only 1 session fetch)
✓ fetchIVR — User-Agent header matches Wheelbase/{version}

✓ fetchIVR — ok result: ivr mapped from impliedVolatilityRank1y
✓ fetchIVR — ok result: ivr rounded to 1 decimal place
✓ fetchIVR — ok result: ivp mapped from impliedVolatilityPercentile1y * 100
✓ fetchIVR — ok result: source is "barchart"
✓ fetchIVR — ok result: observedAt is valid ISO-8601
✓ fetchIVR — ok result: ticker uppercased in response

✓ fetchIVR — not_available when count is 0
✓ fetchIVR — parse_error when impliedVolatilityRank1y missing from response
✓ fetchIVR — parse_error emits WARN log
✓ fetchIVR — parse_error rawSnippet is first 500 chars of data[0]

✓ fetchIVR — network_error on 5xx after 2 retries
✓ fetchIVR — network_error on fetch throw after 2 retries
✓ fetchIVR — retries use exponential backoff

✓ fetchIVR — rate_limited on 429, fetch called exactly once
✓ fetchIVR — rate_limited message includes Retry-After when header present
```

`pnpm lint`, `pnpm typecheck`, and `pnpm format` must also pass cleanly.

# US-43: Scrape current IV Rank from Market Chameleon for a single ticker

**As a** trader who wants to know whether an underlying's implied volatility is rich,
**I want** the app to retrieve current IV Rank (and IV Percentile when available) for a ticker from Market Chameleon's public pages,
**So that** downstream features (position cards, screener, alerts) can show IV context without me leaving the app.

---

## Context

Massive does not provide IV Rank. Market Chameleon publishes IVR on free, unauthenticated pages for many liquid optionable tickers (e.g. SPY, AAPL, TSLA). This story implements a focused scraper module that fetches one ticker's IVR snapshot from the public page and returns a structured result. No storage, no scheduler, no UI — just `fetchMarketChameleonIVR(ticker)` returning a validated payload or a typed "not available" outcome.

This is intentionally narrow because web scraping is brittle: the parser is the failure surface, and isolating it makes the failure recoverable. Daily collection (US-44) and downstream consumption (US-45) build on top.

---

## Acceptance Criteria

```gherkin
Background:
  Given fetchMarketChameleonIVR is defined in src/main/integrations/market-chameleon-scraper.ts
  And it accepts a ticker symbol and returns { status, data?, error? }

Scenario: Scrape IVR for a covered ticker
  Given a ticker "SPY"
  And Market Chameleon's free IVR page is reachable
  When fetchMarketChameleonIVR("SPY") is called
  Then it returns { status: "ok", data: { ticker: "SPY", ivr: number 0..100, ivp?: number 0..100, iv30?: number, observedAt: ISO-8601 timestamp, source: "market-chameleon" } }
  And ivr is rounded to one decimal place

Scenario: Ticker not covered on free tier
  Given a ticker "ILLIQUID"
  And the public page returns a "not available" or empty IVR section
  When fetchMarketChameleonIVR("ILLIQUID") is called
  Then it returns { status: "not_available", error: { code: "TICKER_NOT_COVERED", message: "Market Chameleon does not publish free IVR for ILLIQUID" } }
  And no exception is thrown

Scenario: Page structure changed and IVR could not be parsed
  Given the page returns valid HTML but the IVR field cannot be located
  When the scraper attempts to parse
  Then it returns { status: "parse_error", error: { code: "PARSE_FAILED", message: includes the selector or field name attempted, htmlSnippet: first 500 chars } }
  And a WARN-level log is emitted so the user knows the scraper needs maintenance

Scenario: Network failure
  Given the request to Market Chameleon times out or returns 5xx
  When fetchMarketChameleonIVR is called
  Then it returns { status: "network_error", error: { code: "NETWORK_FAILURE", message: includes HTTP status or timeout reason } }
  And the function retries up to 2 times with exponential backoff before returning

Scenario: Rate limit / HTTP 429
  Given Market Chameleon responds with HTTP 429
  When the scraper receives the response
  Then it returns { status: "rate_limited", error: { code: "RATE_LIMITED", message: includes Retry-After if present } }
  And does not retry within the function (back-off is the caller's responsibility)

Scenario: Request identifies a polite user agent
  When the scraper issues a GET request
  Then the User-Agent header includes "Wheelbase/{version} (+contact info)"
  And the request rate from a single instance never exceeds 1 request/second

Scenario: Invalid input
  Given an empty or non-alphanumeric ticker
  When fetchMarketChameleonIVR is called
  Then it returns { status: "invalid_input", error: { code: "INVALID_TICKER" } }
  And does not issue a network request
```

---

## Technical Notes

- File: `src/main/integrations/market-chameleon-scraper.ts`
- Use `cheerio` for parsing (add if not already in repo).
- Output schema validated with Zod; consumers receive typed results.
- The exact URL pattern (e.g. `https://marketchameleon.com/Overview/{TICKER}/IV/`) must be confirmed during implementation — story names the field shape, not the URL, because MC may move pages.
- Pure module with `fetch` injected at the boundary (for tests). No imports from `db/` or `services/`.

---

## Out of Scope

- Authenticated/paid Market Chameleon access (free pages only).
- Storage of results (US-44).
- Batch fetch of multiple tickers (US-44 schedules per-ticker calls).
- Historical IVR or IV time series.
- Earnings-proximity flags (Epic 12, US-91).

---

## Dependencies

None — pure module.

---

## Estimate

5 points

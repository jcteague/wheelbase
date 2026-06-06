# Quickstart: US-43 — Market Chameleon IVR Scraper

## Prerequisites

```bash
# After pnpm install, rebuild better-sqlite3 for system Node (required for Vitest)
pnpm rebuild better-sqlite3
```

No migrations required — this story introduces no database changes.

## Run Tests

```bash
# Run only this story's tests
pnpm test -- src/main/integrations/market-chameleon-scraper.test.ts

# Run with verbose output
pnpm test -- --reporter verbose src/main/integrations/market-chameleon-scraper.test.ts

# Run all tests (confirm no regressions)
pnpm test
```

## Selector Discovery (required before Green phase)

Before implementing the HTML parser, you must identify the actual CSS selectors for IV Rank on Market Chameleon's live page:

1. Open `https://marketchameleon.com/Overview/SPY/IV/` in a browser
2. Open DevTools → Inspector
3. Locate the IV Rank and IV Percentile values in the DOM
4. Record the CSS selector (class name, data attribute, or element path)
5. Confirm the same selector works for a second ticker (e.g., AAPL)
6. Document the selector in a comment in the parser function

> **Note:** If the page content is loaded via JavaScript (i.e., `cheerio.load(html)` shows no IV data), Cloudflare or JS rendering is blocking the plain fetch approach. In that case, stop and discuss escalating to a Playwright-based fetch before proceeding.

## Expected Passing Criteria

All tests in `src/main/integrations/market-chameleon-scraper.test.ts` pass:

```
✓ fetchMarketChameleonIVR — invalid ticker (empty string)
✓ fetchMarketChameleonIVR — invalid ticker (non-alphanumeric)
✓ fetchMarketChameleonIVR — invalid ticker (too long)
✓ fetchMarketChameleonIVR — ok result for covered ticker
✓ fetchMarketChameleonIVR — ivr rounded to 1 decimal place
✓ fetchMarketChameleonIVR — ivp present when available
✓ fetchMarketChameleonIVR — not_available when IVR section absent
✓ fetchMarketChameleonIVR — parse_error when selector not found
✓ fetchMarketChameleonIVR — parse_error emits WARN log
✓ fetchMarketChameleonIVR — network_error on 5xx after 2 retries
✓ fetchMarketChameleonIVR — network_error on timeout after 2 retries
✓ fetchMarketChameleonIVR — retry uses exponential backoff delay
✓ fetchMarketChameleonIVR — rate_limited on 429, no retry
✓ fetchMarketChameleonIVR — rate_limited message includes Retry-After
✓ fetchMarketChameleonIVR — User-Agent header matches Wheelbase/{version}
✓ fetchMarketChameleonIVR — does not issue network request for invalid ticker
```

`pnpm lint`, `pnpm typecheck`, and `pnpm format` must also pass cleanly.

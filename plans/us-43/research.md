# Research: US-43 — IVR Scraper (Barchart)

## Summary

US-43 implements `fetchIVR(ticker)` — a pure TypeScript module in `src/main/integrations/barchart-ivr-scraper.ts` that fetches IV Rank and IV Percentile from Barchart's internal JSON API. No DB, no IPC, no UI.

**Pivot from Market Chameleon:** The original story specified Market Chameleon + cheerio. Investigation revealed MC's IVR data is JavaScript-rendered and the backend endpoints use a custom XOR cipher keyed to a session cookie — not suitable for a simple scraper. Barchart provides the same data via an unauthenticated (session cookie only) JSON API with no cipher.

---

## Barchart API Findings

### Endpoint

```
GET https://www.barchart.com/proxies/core-api/v1/options/get
  ?baseSymbol={TICKER}
  &fields=baseSymbol,impliedVolatilityRank1y,impliedVolatilityPercentile1y,historicVolatility20d
  &limit=1
  &raw=1
```

Verified live against SPY, AAPL, TSLA (all return data) and a fictional ticker `ILLIQUID123` (returns `count: 0`).

### Sample Response (SPY)

```json
{
  "count": 1,
  "total": 1,
  "data": [
    {
      "baseSymbol": "SPY",
      "impliedVolatilityRank1y": "37.22%",
      "impliedVolatilityPercentile1y": "82%",
      "historicVolatility20d": "12.88%",
      "raw": {
        "baseSymbol": "SPY",
        "impliedVolatilityRank1y": 37.217133007781,
        "impliedVolatilityPercentile1y": 0.81673306772908,
        "historicVolatility20d": 12.88
      }
    }
  ]
}
```

### Field Semantics

| Field                           | Raw type | Scale   | Meaning                                                                   |
| ------------------------------- | -------- | ------- | ------------------------------------------------------------------------- |
| `impliedVolatilityRank1y`       | `number` | 0–100   | IVR: where current IV sits in the 52-week high/low range                  |
| `impliedVolatilityPercentile1y` | `number` | **0–1** | IVP: fraction of past year's days with lower IV — multiply by 100 for pct |
| `historicVolatility20d`         | `number` | 0–100   | HV20 (optional context field)                                             |

### "Not Available" Detection

`count: 0` in the response → ticker has no options data on Barchart → return `not_available`.

### Authentication

The API requires:

1. **Session cookie** — obtained by making a plain GET to any Barchart page. `Set-Cookie` response includes a Laravel session token and other cookies.
2. **XSRF-TOKEN** — set in `Set-Cookie`; must be URL-decoded and sent as `X-XSRF-TOKEN` request header.

Both are obtained in a single GET request to `https://www.barchart.com/stocks/quotes/SPY/options` (or any page). No login required. Cookies are cached at the module level with a 30-minute TTL to avoid fetching a new session for every ticker.

### Rate Limiting

Barchart has no published rate limit for this endpoint. Applying the story's 1 req/sec floor as a conservative policy.

### cheerio

cheerio is no longer needed for this story — the API returns JSON. It was added to `package.json` in a prior session and can remain for potential future use but is not imported by this module.

---

## Architecture Decisions

### ADR: Use Barchart internal JSON API instead of Market Chameleon HTML scraping

- **Decision:** Call `https://www.barchart.com/proxies/core-api/v1/options/get` directly instead of scraping Market Chameleon's HTML.
- **Why:** Market Chameleon's IVR data is JavaScript-rendered and the backend endpoints use a custom XOR cipher requiring a session cookie as the decryption key — too brittle. Barchart returns the same data (IVR + IVP) as clean JSON via an unauthenticated GET, tested live against multiple tickers.
- **Alternatives considered:** Market Chameleon + cheerio (story original — blocked by JS rendering and cipher); Playwright headless (blocked by Cloudflare ERR_HTTP2_PROTOCOL_ERROR); paid Barchart OnDemand API (requires API key + paid plan).

### ADR: Two-step session acquisition with module-level cache

- **Decision:** On first call, GET any Barchart page to harvest cookies + XSRF token, cache for 30 minutes, reuse on subsequent calls. On 401/403, invalidate cache and retry once.
- **Why:** The API requires a valid session cookie and XSRF token but not actual login. A 30-minute cache avoids paying the session-fetch overhead on every ticker lookup (US-44 will call this in a scheduled batch).
- **Alternatives considered:** Per-call session acquisition (correct but wasteful); hardcoded cookies (brittle — expire on server restart); constructor injection of cookies (overkill for a single-user desktop app).

### ADR: Typed result discriminated union, never throws

- **Decision:** Return `{ status: "ok" | "not_available" | "parse_error" | "network_error" | "rate_limited" | "invalid_input", data?, error? }` — never throw.
- **Why:** Consistent with the story requirement and with the existing integration layer pattern.
- **Alternatives considered:** Throwing typed errors (breaks the "no exception" contract).

### ADR: File and function naming

- **Decision:** File `src/main/integrations/barchart-ivr-scraper.ts`, exported function `fetchIVR(ticker)`, result field `source: "barchart"`.
- **Why:** The story originally named Market Chameleon, but the implementation uses Barchart. Naming the file after the actual data source is clearer for maintainers.
- **Alternatives considered:** Keeping the MC filename (misleading); generic `ivr-scraper.ts` (obscures data source).

### ADR: fetch injected via vi.stubGlobal in tests

- **Decision:** Use `vi.stubGlobal('fetch', mockFetch)` — consistent with `massive-market-data.test.ts`. Tests must mock two sequential fetch calls: (1) session acquisition → returns mock Set-Cookie headers; (2) API call → returns mock JSON.
- **Alternatives considered:** Constructor injection of fetchFn (more explicit but inconsistent with project style).

---

## Open Questions

None — all unknowns resolved.

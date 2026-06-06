# Research: US-43 — Market Chameleon IVR Scraper

## Summary

US-43 implements `fetchMarketChameleonIVR(ticker)` — a pure TypeScript module in `src/main/integrations/` that fetches IV Rank (and optionally IV Percentile) from Market Chameleon's free public pages. No DB, no IPC, no UI.

---

## Findings

### URL Pattern

Confirmed URL pattern:
```
https://marketchameleon.com/Overview/{TICKER}/IV/
```

Verified from multiple community references (e.g., `https://marketchameleon.com/Overview/META/IV/`). The `{TICKER}` segment is the plain uppercase stock symbol.

### Cheerio vs Headless Browser

The story specifies cheerio for HTML parsing. Research findings are ambiguous:

- Market Chameleon sits behind **Cloudflare**. Direct HTTP fetch attempts from non-browser clients either time out (Cloudflare managed challenge) or return a challenge page.
- The only known GitHub scraper for Market Chameleon uses **Selenium WebDriver** (i.e., full browser automation), not a static HTTP + HTML parser approach.
- However, Cloudflare's behavior varies: some routes are protected, others allow bots through with a valid User-Agent. The IV page specifically is unknown without a live test.

**This is a `NEEDS CLARIFICATION` item** — see below.

### Market Chameleon Terms of Service

Market Chameleon's [Developer page](https://marketchameleon.com/Home/Developer) explicitly states that automated harvesting is **against their Terms of Use**, is "closely monitored," and is "vigorously enforced." No public REST API exists on the free tier.

**This is a `NEEDS CLARIFICATION` item** — see below.

### HTML Selectors

The exact CSS selectors for IV Rank and IV Percentile cannot be determined from research alone — they require inspecting a live rendered page. This is a known gap that must be filled during implementation by loading the page in a browser and using DevTools.

### cheerio Library

- Current stable: v1.2.0 (released post-1.0 GA August 2024)
- Install: `pnpm add cheerio`
- TypeScript types bundled — no `@types/cheerio` needed
- Pure HTML parser — no JS execution; adequate only if the page HTML contains IVR values server-rendered

```typescript
import * as cheerio from 'cheerio'
const $ = cheerio.load(html)
const ivr = $('[data-field="iv_rank"]').first().text().trim()
```

### Exponential Backoff Pattern

Idiomatic TypeScript without external libraries:

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  baseDelayMs = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === maxRetries) throw err
      await sleep(Math.random() * baseDelayMs * Math.pow(2, attempt))
    }
  }
  throw new Error('unreachable')
}
```

- 429 (rate limited) must **not** be retried — surface immediately as `rate_limited`
- 5xx and network errors retry up to 2 times with jitter

### Rate Limiting (1 req/sec)

Single shared timestamp gate — no library needed:

```typescript
class RateLimiter {
  private lastAt = 0
  constructor(private readonly minMs = 1000) {}
  async throttle() {
    const wait = this.minMs - (Date.now() - this.lastAt)
    if (wait > 0) await sleep(wait)
    this.lastAt = Date.now()
  }
}
```

A single module-level `RateLimiter` instance covers single-instance usage. Sequential calls are guaranteed polite; parallel calls must not be issued to this scraper.

### User-Agent

The story requires: `"Wheelbase/{version} (+contact info)"`.

Pattern: read version from `package.json` at module load time:

```typescript
import pkg from '../../../package.json'
export const USER_AGENT = `Wheelbase/${pkg.version} (+mailto:jcteague@gmail.com)`
```

The `jcteague@gmail.com` email from user settings is the natural contact; the `mailto:` form is the accepted alternative when no public URL exists.

### Fetch Injection for Tests

The existing `massive-market-data.test.ts` pattern uses `vi.stubGlobal('fetch', mockFetch)` to inject fetch — no explicit constructor injection. This pattern works and is consistent with the rest of the integration layer.

### Existing Patterns

| Concern | Location |
|---|---|
| Retry/error handling | `src/main/integrations/massive-market-data.ts` |
| Network error detection | `src/main/integrations/integration-errors.ts` |
| Test fetch injection | `src/main/integrations/massive-market-data.test.ts` — `vi.stubGlobal('fetch', mockFetch)` |

---

## Architecture Decisions

### ADR: Use cheerio for HTML parsing (conditional)

- **Decision:** Use `cheerio` for static HTML parsing, consistent with the story's explicit instruction. If Cloudflare blocks the plain fetch, the implementation falls back to a `Playwright`-based fetch (which is already a dev dependency). The scraper's `fetchFn` injection point makes this swap transparent to callers.
- **Why:** The story specifies cheerio. Playwright is heavier (spawns a browser process) and is already used for E2E testing, not production integrations. The correct sequence is: attempt cheerio first; if blocked in production, escalate.
- **Alternatives considered:** Playwright headless browser (already in repo, but overkill if cheerio works); Puppeteer (not in repo); paid API alternative (Barchart OnDemand has IVR but requires paid plan).

### ADR: Module-level RateLimiter singleton

- **Decision:** Export a single `RateLimiter` instance within the module, shared across all calls to `fetchMarketChameleonIVR`.
- **Why:** The story requires "request rate from a single instance never exceeds 1 req/second." A module-level singleton is the simplest correct implementation for sequential, single-instance use.
- **Alternatives considered:** Constructor injection (overkill — no need to vary rate limits); `p-limit` library (not in repo; unnecessary for sequential scraping).

### ADR: Typed result discriminated union (no exceptions)

- **Decision:** Return a discriminated union `{ status: "ok" | "not_available" | "parse_error" | "network_error" | "rate_limited" | "invalid_input", data?, error? }` — never throw.
- **Why:** The story explicitly requires no exceptions thrown. Discriminated unions are idiomatic TypeScript and make exhaustive handling possible at call sites. Validated with Zod at the boundary.
- **Alternatives considered:** Throwing typed errors (breaks the "no exception" contract); `Result<T,E>` type alias (redundant — the discriminated union already is one).

### ADR: fetch injected via `vi.stubGlobal` in tests

- **Decision:** Use the project's existing pattern of `vi.stubGlobal('fetch', mockFetch)` rather than constructor-injecting a fetch parameter.
- **Why:** Consistent with `massive-market-data.test.ts`. No need to plumb a `fetchFn` parameter through every call when global stub achieves the same isolation.
- **Alternatives considered:** Constructor injection (more explicit but inconsistent with project style); `msw` mock service worker (not in repo).

---

## Open Questions

**Resolved:** Use cheerio + plain HTTPS fetch as the story specifies. If Cloudflare blocks live requests, escalate to Playwright in a follow-up story. Selectors are confirmed via manual browser inspection during implementation.

**Resolved:** ToS risk acknowledged. Single-user desktop app, public pages, polite User-Agent, 1 req/sec limit.

# Data Model: US-43 — Market Chameleon IVR Scraper

## Overview

This story introduces no database entities. The output is a pure in-memory, in-process result type. All shapes below are TypeScript types (validated with Zod at the scraper boundary).

---

## Result Type: `MCIVRResult`

Discriminated union — one of six statuses. Never throws.

```typescript
type MCIVRResult =
  | MCIVROk
  | MCIVRNotAvailable
  | MCIVRParseError
  | MCIVRNetworkError
  | MCIVRRateLimited
  | MCIVRInvalidInput
```

### `MCIVROk`

```typescript
type MCIVROk = {
  status: 'ok'
  data: {
    ticker: string          // uppercase, 1–5 alphanumeric chars
    ivr: number             // 0–100, rounded to 1 decimal place
    ivp?: number            // 0–100, rounded to 1 decimal place (optional — not always published)
    iv30?: number           // current 30-day implied volatility (optional)
    observedAt: string      // ISO-8601 UTC timestamp set at fetch time
    source: 'market-chameleon'
  }
}
```

Validation rules (Zod):
- `ivr`: `z.number().min(0).max(100)` — rounded to 1 dp before validation
- `ivp`: `z.number().min(0).max(100).optional()`
- `iv30`: `z.number().positive().optional()`
- `observedAt`: `z.string().datetime()` — produced by `new Date().toISOString()`
- `ticker`: `z.string().regex(/^[A-Z0-9]{1,5}$/)` — uppercase, alphanumeric only

### `MCIVRNotAvailable`

```typescript
type MCIVRNotAvailable = {
  status: 'not_available'
  error: {
    code: 'TICKER_NOT_COVERED'
    message: string  // "Market Chameleon does not publish free IVR for {TICKER}"
  }
}
```

Trigger: the page loads successfully but the IVR section is absent or explicitly shows "not available."

### `MCIVRParseError`

```typescript
type MCIVRParseError = {
  status: 'parse_error'
  error: {
    code: 'PARSE_FAILED'
    message: string     // includes the selector or field name that could not be located
    htmlSnippet: string // first 500 chars of the response body
  }
}
```

Trigger: the page loaded (HTTP 200) but the expected IVR element could not be found with the known selector. Emits a WARN-level log.

### `MCIVRNetworkError`

```typescript
type MCIVRNetworkError = {
  status: 'network_error'
  error: {
    code: 'NETWORK_FAILURE'
    message: string  // includes HTTP status (e.g., "HTTP 503") or timeout reason
  }
}
```

Trigger: HTTP 5xx, DNS failure, timeout, or connection refused — after exhausting 2 retries with exponential backoff.

### `MCIVRRateLimited`

```typescript
type MCIVRRateLimited = {
  status: 'rate_limited'
  error: {
    code: 'RATE_LIMITED'
    message: string  // "HTTP 429" + Retry-After value if present in response header
  }
}
```

Trigger: HTTP 429 received. No retry — surface immediately. Retry-After header included in message if present.

### `MCIVRInvalidInput`

```typescript
type MCIVRInvalidInput = {
  status: 'invalid_input'
  error: {
    code: 'INVALID_TICKER'
  }
}
```

Trigger: ticker is empty string, contains non-alphanumeric characters, or exceeds 5 characters. No network request issued.

---

## Ticker Validation Rule

A valid ticker passes: `/^[A-Z0-9]{1,5}$/` (after `toUpperCase()`). Anything else → `invalid_input`.

---

## Retry Policy

| HTTP status | Action |
|---|---|
| Network error / 5xx | Retry up to 2 times with exponential backoff + jitter |
| 429 | Return `rate_limited` immediately — no retry |
| 404 | Treat as `not_available` |
| Other 4xx | Return `network_error` |
| 200 | Parse with cheerio |

Backoff formula: `Math.random() * 1000ms * 2^attempt` (full jitter, base 1 s).

---

## Rate Limit

A module-level `RateLimiter` singleton enforces ≥ 1000 ms between requests. The limiter gates the HTTPS fetch — it does not gate the `invalid_input` path (no network request issued).

---

## Zod Schemas (to define in `src/main/integrations/market-chameleon-scraper.ts`)

```typescript
const MCIVRDataSchema = z.object({
  ticker: z.string().regex(/^[A-Z0-9]{1,5}$/),
  ivr: z.number().min(0).max(100),
  ivp: z.number().min(0).max(100).optional(),
  iv30: z.number().positive().optional(),
  observedAt: z.string().datetime(),
  source: z.literal('market-chameleon'),
})

const MCIVROkSchema = z.object({ status: z.literal('ok'), data: MCIVRDataSchema })
```

Error variants are constructed directly (not Zod-validated) since they come from the scraper's own logic and are always structurally correct.

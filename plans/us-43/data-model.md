# Data Model: US-43 — IVR Scraper (Barchart)

## Overview

No database entities. The output is a pure in-memory, in-process result type. All shapes are TypeScript types validated with Zod at the scraper boundary.

---

## Result Type: `IVRResult`

Discriminated union — one of six statuses. Never throws.

```typescript
type IVRResult =
  | IVROk
  | IVRNotAvailable
  | IVRParseError
  | IVRNetworkError
  | IVRRateLimited
  | IVRInvalidInput
```

### `IVROk`

```typescript
type IVROk = {
  status: 'ok'
  data: {
    ticker: string // uppercase, 1–5 alphanumeric chars
    ivr: number // 0–100, rounded to 1 decimal place
    ivp?: number // 0–100, rounded to 1 decimal place (optional — multiply Barchart's 0-1 raw by 100)
    iv30?: number // 20-day historical vol from Barchart (historicVolatility20d), optional context
    observedAt: string // ISO-8601 UTC timestamp set at fetch time
    source: 'barchart'
  }
}
```

**Field mapping from Barchart API:**

| `IVROk.data` field | Barchart raw field                  | Transform                                       |
| ------------------ | ----------------------------------- | ----------------------------------------------- |
| `ivr`              | `raw.impliedVolatilityRank1y`       | `Math.round(v * 10) / 10` (already 0–100)       |
| `ivp`              | `raw.impliedVolatilityPercentile1y` | `Math.round(v * 1000) / 10` (0–1 → 0–100, 1 dp) |
| `iv30`             | `raw.historicVolatility20d`         | passthrough as optional context                 |
| `observedAt`       | —                                   | `new Date().toISOString()` at fetch time        |
| `source`           | —                                   | literal `"barchart"`                            |

**Validation rules (Zod):**

- `ivr`: `z.number().min(0).max(100)` — after rounding
- `ivp`: `z.number().min(0).max(100).optional()`
- `iv30`: `z.number().positive().optional()`
- `observedAt`: `z.string().datetime()`
- `ticker`: `z.string().regex(/^[A-Z0-9]{1,5}$/)`

### `IVRNotAvailable`

```typescript
type IVRNotAvailable = {
  status: 'not_available'
  error: {
    code: 'TICKER_NOT_COVERED'
    message: string // "Barchart has no options data for {TICKER}"
  }
}
```

**Trigger:** `count === 0` in the Barchart API response (ticker has no options data).

### `IVRParseError`

```typescript
type IVRParseError = {
  status: 'parse_error'
  error: {
    code: 'PARSE_FAILED'
    message: string // "Expected impliedVolatilityRank1y in response"
    rawSnippet: string // JSON.stringify(data[0]).slice(0, 500)
  }
}
```

**Trigger:** `count > 0` but `raw.impliedVolatilityRank1y` is absent or non-numeric — the API shape changed. Emits WARN-level log.

### `IVRNetworkError`

```typescript
type IVRNetworkError = {
  status: 'network_error'
  error: {
    code: 'NETWORK_FAILURE'
    message: string // includes HTTP status or timeout reason
  }
}
```

**Trigger:** HTTP 5xx, DNS failure, timeout, connection refused — after exhausting 2 retries with exponential backoff. Applies to both the session-acquisition fetch and the API fetch.

### `IVRRateLimited`

```typescript
type IVRRateLimited = {
  status: 'rate_limited'
  error: {
    code: 'RATE_LIMITED'
    message: string // "HTTP 429" + Retry-After value if present
  }
}
```

**Trigger:** HTTP 429. No retry — surface immediately.

### `IVRInvalidInput`

```typescript
type IVRInvalidInput = {
  status: 'invalid_input'
  error: {
    code: 'INVALID_TICKER'
  }
}
```

**Trigger:** Ticker is empty, non-alphanumeric, or longer than 5 characters. No network request issued.

---

## Ticker Validation

Valid ticker: `/^[A-Z0-9]{1,5}$/` applied after `.toUpperCase()`.

---

## Session Cache

Module-level singleton. Invalidated after 30 minutes or on 401/403 response.

```typescript
type SessionCache = {
  cookies: string // raw cookie string for Cookie header
  xsrf: string // URL-decoded XSRF token for X-XSRF-TOKEN header
  expiresAt: number // Date.now() + 30min
}
```

---

## Retry Policy

| HTTP status          | Action                                                   |
| -------------------- | -------------------------------------------------------- |
| Network error / 5xx  | Retry up to 2 times with exponential backoff             |
| 429                  | Return `rate_limited` immediately — no retry             |
| 401 / 403            | Invalidate session cache, re-acquire session, retry once |
| 200 + `count: 0`     | Return `not_available`                                   |
| 200 + missing fields | Return `parse_error` + WARN log                          |
| 200 + valid data     | Return `ok`                                              |

Backoff: `Math.random() * 1000ms * 2^attempt` (full jitter, base 1 s).

---

## Rate Limit

Module-level `RateLimiter` singleton enforces ≥ 1000 ms between API calls. The rate limit applies to the data API call only (not the session-acquisition call, which is made at most once per 30 minutes).

---

## Zod Schemas

```typescript
// src/main/integrations/barchart-ivr-scraper.ts

const IVRDataSchema = z.object({
  ticker: z.string().regex(/^[A-Z0-9]{1,5}$/),
  ivr: z.number().min(0).max(100),
  ivp: z.number().min(0).max(100).optional(),
  iv30: z.number().positive().optional(),
  observedAt: z.string().datetime(),
  source: z.literal('barchart')
})

const IVROkSchema = z.object({ status: z.literal('ok'), data: IVRDataSchema })

export type IVRData = z.infer<typeof IVRDataSchema>
export type IVROk = z.infer<typeof IVROkSchema>
// ... other variants constructed directly (no schema needed — scraper controls their shape)
```

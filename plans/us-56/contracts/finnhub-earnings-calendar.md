# Contract: finnhub-earnings-calendar (external HTTP contract)

## Purpose

Fetch the earnings calendar for one ticker from Finnhub so the alert engine can compute days-until-earnings. This is an **external vendor contract** consumed by `fetchNextEarningsDates` — there is no new IPC handler in this story (the renderer reads new alerts through the existing `alerts:list` channel unchanged).

## Request

```typescript
// GET https://finnhub.io/api/v1/calendar/earnings
// One request per ticker; auth via `token` query param (Finnhub free tier).
interface FinnhubEarningsRequest {
  symbol: string // uppercased ticker, e.g. 'NVDA'
  from: string // 'YYYY-MM-DD' — now − EARNINGS_LOOKBACK_DAYS (7)
  to: string // 'YYYY-MM-DD' — now + EARNINGS_LOOKAHEAD_DAYS (30)
  token: string // loadFinnhubApiKey(): MAIN_VITE_FINNHUB_API_KEY || process.env.FINNHUB_API_KEY
}
```

## Response (success)

```typescript
// HTTP 200
interface FinnhubEarningsResponse {
  earningsCalendar: Array<{
    date: string // 'YYYY-MM-DD' — the only field the story consumes
    symbol: string
    hour?: 'bmo' | 'amc' | 'dmh' | ''
    quarter?: number
    year?: number
    epsEstimate?: number | null
    epsActual?: number | null
    revenueEstimate?: number | null
    revenueActual?: number | null
  }>
}
// Empty earningsCalendar array = no events in the window (valid; cached as null → rule skips).
```

Internal batch wrapper built on this contract:

```typescript
// src/main/integrations/finnhub-earnings.ts
export async function fetchNextEarningsDates(
  tickers: string[],
  opts?: { now?: Date; logger?: LoggerLike }
): Promise<Record<string, string>> // ticker → selected event date; failed/eventless tickers absent
```

Per-ticker selection: earliest event with `date >= today`, else most recent past event in the window. Results (including "no event" nulls) cached per ticker for 12 h (module-level, `clearEarningsCache()` exported for tests).

## Error codes

No IPC envelope applies (not an IPC handler). Vendor/transport failures are isolated per ticker and never thrown to the caller of the batch wrapper:

| condition                                     | behavior                                             | log event                                                           |
| --------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------- |
| API key missing/empty                         | return `{}` immediately                              | WARN `earnings_fetch_no_api_key` (once per process)                 |
| HTTP 401/403                                  | ticker omitted from result                           | WARN `earnings_fetch_failed` (`code: 'auth_failed'`)                |
| HTTP 429                                      | ticker omitted (no retry loop in v1)                 | WARN `earnings_fetch_failed` (`code: 'rate_limited'`)               |
| network error / other non-OK / malformed JSON | ticker omitted                                       | WARN `earnings_fetch_failed` (`code: 'network_error' \| 'unknown'`) |
| empty `earningsCalendar`                      | ticker omitted; `null` cached (no refetch until TTL) | DEBUG `earnings_no_event_in_window`                                 |

A whole-feed outage therefore degrades to an empty record; downstream, `evaluateAlerts` additionally wraps the batch call in the existing `fetchOrDegrade` (WARN `alert_evaluation_earnings_unavailable`) so even a thrown programming error cannot suppress the other rules.

## Source

- Integration: `src/main/integrations/finnhub-earnings.ts` (new)
- Consumed by service: `src/main/services/evaluate-alerts.ts` (third concurrent boundary fetch)
- Key loader: `loadFinnhubApiKey()` in `src/main/integrations/finnhub-credentials.ts` (new, mirrors `massive-credentials.ts`)
- Vendor docs: https://finnhub.io/docs/api/earnings-calendar

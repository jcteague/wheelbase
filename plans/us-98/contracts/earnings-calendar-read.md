# Contract: earnings calendar read amended by US-98

## Integration function

```ts
fetchEarningsCalendar(
  tickers: string[],
  opts?: { now?: Date; logger?: LoggerLike; lookaheadDays?: number }
): Promise<Record<string, EarningsCalendarRead>>
```

Replaces fetchNextEarnings inside the integration/store boundary. Return an entry per unique uppercase ticker: `{ status: 'read', next: string | null, last: string | null }` or `{ status: 'unavailable' }`.

GET the existing Finnhub calendar endpoint once per ticker with symbol, from (ET today minus 30 days), to (ET today plus lookaheadDays), and token. Never log the token/URL. Default lookahead remains 30; screener's existing dteMax + 45 horizon stays intact.

Validate yyyy-MM-dd as actual calendar dates. Next is earliest on/after today; last latest strictly before today, both within request bounds. Empty or placeholder-only successful arrays return two nulls. Invalid response body or request failure returns unavailable. Keep existing concurrency four and five-minute failure backoff.

## Store functions

```ts
getEarningsCalendar(db, tickers, { horizon, now, fetch? })
  : Promise<Map<string, { next: EarningsLookup; last: string | null | undefined }>>
getEarnings(db, tickers, { horizon, now, fetch? })
  : Promise<Map<string, EarningsLookup>>
```

The next-only method is a projection of the shared resolver, not a second request. Existing callers and next-date found/none/unavailable semantics remain. A successful feed read is returned even when its upsert fails; per-ticker failures do not erase other results. Unavailable refresh degrades last to undefined while retaining existing next-date cache fallback when valid.

Persist last_earnings with next_earnings and existing cache metadata. Preserve refresh intervals and horizon rules. Legacy null last values mean no known print, not proof of a 30-day check. No public IPC is added for earnings.

## Fake integration

WHEELBASE_MOCK_EARNINGS becomes a record of EarningsCalendarRead. Missing ticker represents a successful empty calendar; explicit unavailable and the existing whole-request outage seam remain distinct. Honour both lookback and lookahead so tests exercise real boundary rules. Update all existing feed/store test fixtures and alert regression fixtures alongside the shape change.

## Logging and errors

Existing classified warn logs (auth_failed, rate_limited, network_error, unknown) remain per ticker. INFO records relevant store/collection business outcomes; DEBUG records ticker/date bounds, cache decisions and selected dates. No logs in core and no secrets in diagnostics.

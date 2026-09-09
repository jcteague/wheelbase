# Data model: US-98

## Trading sessions

Create `src/main/core/trading-calendar-data.ts` containing immutable annual closure/early-close tables for 2025–2028, verified against the sources in research.md. Include verification date and coverage bounds. Create `src/main/core/trading-calendar.ts`:

```ts
type TradingSession = { date: string; closeAt: string } // ET day; UTC ISO instant
type SessionLookup =
  | { status: 'open'; session: TradingSession }
  | { status: 'closed' }
  | { status: 'unavailable' }

getTradingSession(day: string): SessionLookup
getMostRecentCompletedSession(instant: Date): TradingSession | null
countCompletedSessionsAfter(session: TradingSession, now: Date): number | null
etDateOf(instant: Date): string
```

Inputs are validated dates/instants. null is unknown calendar coverage, never zero sessions. Use date-fns and TZDate in America/New_York. Within coverage, weekends/full closures have no session; normal close is 16:00 ET, published early close is 13:00 ET. The observation belongs to the latest session whose close is at/before observedAt. Count closes strictly after that close and at/before now.

An observation before coverage can be classified expired only if at least 11 covered closes are provably after observedAt; otherwise return unknown. This avoids needing a full historical exchange calendar for old snapshots. Unsupported current dates degrade to unknown. Test the December/January coverage boundary explicitly.

| Example                                          | Expected                                                      |
| ------------------------------------------------ | ------------------------------------------------------------- |
| Fri 2026-06-12 16:00 ET → Mon Jun 15 15:59:59 ET | age 0                                                         |
| Same observation → Mon Jun 15 16:00 ET           | age 1                                                         |
| Wed 2026-11-25 close → Thanksgiving Nov 26       | age 0                                                         |
| Same observation → Fri Nov 27 13:00 ET           | age 1 (early close)                                           |
| Fri Nov 27 observation 14:00 ET                  | Friday session                                                |
| 2026-09-15T02:30:00Z                             | Monday Sep 14 22:30 ET; Monday session                        |
| Fri March 6 / Mon March 9, 2026 closes           | 21:00Z / 20:00Z across DST                                    |
| 2025-01-09                                       | exceptional full closure                                      |
| 2027-12-31                                       | ordinary session (no Friday observance for Saturday New Year) |

## IVR assessment

Create `src/main/core/ivr-freshness.ts`. Raw `IvRank` remains owned by `core/screener.ts`.

```ts
type AssessedIvRank = {
  value: string
  observedAt: string
  ageTradingDays: number
  state: 'fresh' | 'aging' | 'stale' | 'predates_earnings'
  usable: boolean
}
type AssessContext = { now: Date; lastEarnings: string | null | undefined }
assessIvRank(reading: IvRank | null, ctx: AssessContext): AssessedIvRank | null
tierForAge(age: number): 'fresh' | 'aging' | 'stale' | 'expired'
```

Constants: FRESH_MAX_AGE = 1, AGING_MAX_AGE = 3, STALE_MAX_AGE = 10.

1. Reject absent/invalid readings, invalid clocks, future observations, and unassessable calendar coverage to null. Boundary services validate persisted values and log degradation; core does no logging.
2. Compute age from completed session closes, not UTC dates or elapsed calendar days.
3. With a known valid last-print date strictly after observation session day and at/before today in ET: state predates_earnings, usable false. This override precedes expiry.
4. Otherwise age 0–1 is fresh, 2–3 aging, 4–10 stale, over 10 null (expired).
5. usable is exactly state fresh or aging. Do not allow inconsistent state/usable fixtures.

Date-only earnings cannot order a print on the same session day relative to its close; the strict later-day predicate does not invalidate that case. Never assert that lack of an override certifies freshness through earnings.

With now = 2026-09-23T14:00:00Z (Wednesday 10:00 ET):

| observedAt           | Age | Time verdict |
| -------------------- | --- | ------------ |
| 2026-09-22T21:00:00Z | 0   | fresh        |
| 2026-09-21T21:00:00Z | 1   | fresh        |
| 2026-09-18T21:00:00Z | 2   | aging        |
| 2026-09-17T21:00:00Z | 3   | aging        |
| 2026-09-16T21:00:00Z | 4   | stale        |
| 2026-09-14T21:00:00Z | 6   | stale        |
| 2026-09-08T21:00:00Z | 10  | stale        |
| 2026-09-04T21:00:00Z | 11  | expired/null |
| 2026-09-03T21:00:00Z | 12  | expired/null |

No assessment state is persisted. Recompute per existing service request. No lifecycle or money model changes.

## Earnings integration and cache

```ts
type EarningsCalendarRead =
  | { status: 'read'; next: string | null; last: string | null }
  | { status: 'unavailable' }

type EarningsCalendarKnowledge = {
  next: EarningsLookup // existing found/none/unavailable union
  last: string | null | undefined
}
```

Fetcher request window: ET today minus 30 calendar days through existing lookahead. Validate actual yyyy-MM-dd dates and exclude out-of-window rows. Next = earliest date on/after today; last = latest strictly before today. Feed errors retain per-ticker isolation and failure backoff.

Migration `014_add_last_earnings.sql` (renumber if US-96 takes 014):

```sql
ALTER TABLE earnings_date ADD COLUMN last_earnings TEXT;
```

Existing table stays one row per ticker with next_earnings, checked_through, checked_at, source. Upsert both dates together on success; unavailable writes no row. Legacy NULL last_earnings cannot be distinguished from a checked-empty result from this column alone: treat it as no known last print and never use it as an affirmative safety claim. No migration backfill or cadence change.

In `services/earnings-dates.ts`, `getEarningsCalendar(db, tickers, options)` returns Map<string, EarningsCalendarKnowledge>. `getEarnings` projects only next for unchanged alert/US-70 callers. The new resolver performs the existing read/refresh once; successful fetched knowledge wins even when the cache write fails. Cache read failures isolate each ticker; statement preparation failure degrades the batch boundary. Existing next-date fallback semantics remain. When a refresh is unavailable, last is undefined for IVR assessment even if the legacy next fallback succeeds.

null means no known last date (a successful feed result establishes an empty lookback; migrated cache rows do not). undefined means missing/unavailable knowledge. Both use time tiers alone.

## Service and wire shape

`getAssessedIvrByUnderlying(db, tickers, { now, lastEarnings })` in `services/ivr-snapshots.ts` returns Map<string, AssessedIvRank | null>. It reads raw snapshots without network I/O and assesses per ticker. lastEarnings is the knowledge map projected by the caller after the shared earnings read.

`services/screener.ts` adds:

```ts
type RankedCandidate = Omit<ScoredCandidate, 'ivRank'> & {
  ivRank: AssessedIvRank | null
}
```

For each ticker, engine context receives raw value/observedAt only when usable, else null. After rankCandidates, replace row ivRank with assessed display data. Earnings rank tiers, yield score, promotion data, and exclusion reasons remain unchanged.

US-96's watchlist snapshot carries the same assessed IVR. Its IV gate treats null or unusable as unknown; stale label “IV too old to judge”, earnings-invalid label “IV predates earnings”, absent label “IV unavailable”. An unknown IV gate prevents Entry ready. It does not create a new gate for a ticker with no IV condition. Preserve earnings-first and price-before-IV precedence and use secondary text when another gate is primary.

## Shared cell

`components/IvrCell.tsx` takes `ivRank: AssessedIvRank | null` through renderer mirror types and an optional usable-tone class from the watchlist's existing threshold helper.

| State             | Visible content                 | Tone                               |
| ----------------- | ------------------------------- | ---------------------------------- |
| fresh             | 38                              | surface's normal usable-value tone |
| aging             | 38 · 2d                         | usable value; secondary age        |
| stale             | 58 · 6d                         | text-wb-text-muted throughout      |
| predates_earnings | 62; caption “predates earnings” | muted throughout                   |
| null              | n/a                             | muted                              |

Use data-ivr-state for deterministic assertions. Expose exact age in accessible text/title: “2 trading days old”. All non-null cells may show ET observation date in a tooltip; Fresh has no visible age/date qualifier. Do not promise an earnings-date tooltip field absent from the payload. Keep Decimal normalization (38.0 → 38).

## Test fixtures

ScreenerLaunchOpts gains fakeNow and per-ticker IVR `number | { ivr: number; observedAt: string }`. Earnings fixture supports independent nullable next and last day offsets, plus unavailable. Preserve existing dayOffset shorthand where useful, mapping negative historical offsets into last.

Use a single captured base Date for expiry, earnings and default IVR timestamps. Default IVR is one hour before base. Test-only clock setter changes the same clock instance injected into collector, screener and watchlist; no production payload controls time. Seed holiday scenarios at the prior trading close, advance clock, then request results. Do not collect on the holiday to seed them.

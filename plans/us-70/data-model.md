# Data Model: US-70 — Earnings in the DTE window

One new table (§2). Everything else is an in-memory type flowing
feed → store → service → pure engine → IPC → renderer.

---

## 1. `EarningsLookup` — what the feed knows about one ticker

Lives in `src/main/integrations/finnhub-earnings.ts`.

```typescript
export type EarningsLookup =
  | { status: 'found'; date: string } // 'YYYY-MM-DD', the next event in the requested window
  | { status: 'none' } // request succeeded, no event in the window
  | { status: 'unavailable' } // request failed, quota exhausted, or no API key
```

**Invariant:** `fetchNextEarnings` returns an entry for **every** requested ticker.
A missing key is never a valid outcome — that ambiguity is the defect this story
fixes. Callers may still defensively default to `{ status: 'unavailable' }`.

| Source condition                                        | Result                      |
| ------------------------------------------------------- | --------------------------- |
| `earningsCalendar` has ≥1 well-formed date in window    | `{ status: 'found', … }`    |
| `earningsCalendar` is `[]`, or every row's date is junk | `{ status: 'none' }`        |
| HTTP non-2xx, network error, malformed body             | `{ status: 'unavailable' }` |
| `loadFinnhubApiKey()` returns `''`                      | `{ status: 'unavailable' }` |

Date selection is unchanged from the shipped `selectEventDate`: rows are filtered
to `/^\d{4}-\d{2}-\d{2}$/`, sorted, and the first date `>= today` wins, falling
back to the latest past date.

**The 12-hour success `Map` is removed** — the `earnings_date` table below is the
cache. The 5-minute **failure** cache stays in memory: a failed fetch is not
knowledge about the ticker, so it is never written to the DB, but a rate-limited
symbol still must not be re-hammered every 60 s by the alert scheduler.

---

## 2. `earnings_date` — the persisted store

New migration `migrations/013_create_earnings_date.sql`:

```sql
CREATE TABLE earnings_date (
  ticker          TEXT PRIMARY KEY,
  next_earnings   TEXT,                             -- 'YYYY-MM-DD'; NULL = checked, nothing scheduled
  checked_through TEXT NOT NULL,                    -- 'YYYY-MM-DD', the `to` bound of the request that produced this row
  checked_at      TEXT NOT NULL,                    -- ISO timestamp of that request
  source          TEXT NOT NULL DEFAULT 'finnhub'
);
```

One row per ticker, overwritten on each successful fetch (`INSERT … ON CONFLICT
(ticker) DO UPDATE`). No history — see the persistence ADR for why this differs
from `ivr_snapshot`'s time series.

**The three known-states are distinguishable**, which is the whole point:

| Row state                     | Meaning                                    | Maps to               |
| ----------------------------- | ------------------------------------------ | --------------------- |
| no row                        | never successfully checked                 | fetch, then decide    |
| row, `next_earnings` NOT NULL | a date is scheduled                        | `{ status: 'found' }` |
| row, `next_earnings` IS NULL  | checked, nothing scheduled through horizon | `{ status: 'none' }`  |

`unavailable` is never a persisted state — it is produced at read time when a fetch
was needed and failed.

### `checked_through` is what makes one row serve two horizons

US-56 asks about a 30-day horizon; the screener asks about ~50. A stored
`next_earnings = NULL` from a 30-day request does **not** answer the 50-day
question — there may well be an event at day 40. Recording the `to` bound the row
was built from lets a shallow row be reused when it carries a date, and re-fetched
only when its `NULL` is too shallow for the caller. This replaces the composite
`${ticker}:${lookaheadDays}` cache key an earlier draft proposed, which would have
split the two consumers into separate cache slots and doubled request volume.

### Refresh rule

`getEarnings(db, tickers, { horizon, now })` fetches a ticker only when **any** of:

1. no row exists, **or**
2. `next_earnings` is non-null and earlier than today — the print has happened, so
   the next one is unknown, **or**
3. `next_earnings` is null and `checked_through < horizon` — we did not look far
   enough to answer this caller, **or**
4. `checked_at` is older than `STALE_AFTER_DAYS` (7) — the revision backstop.

Rules 1–3 are the user-stated rule: fetch when we don't have it, or the saved date
has passed. Rule 4 exists because Finnhub dates are **estimates that move**; a
purely event-driven rule would hold a revised date indefinitely. Seven days bounds
the drift at roughly twelve refreshes per ticker per year instead of one per run,
and the exposure it leaves is narrow: a revision only changes a verdict if it
crosses the expiry boundary, since both sides of a small slip fall in-window
anyway.

Everything else is served from the table with no HTTP call — the ordinary steady
state, and the reason a cold start no longer issues one request per watchlist
ticker.

---

## 3. `CandidateEarnings` — what the engine decided for one candidate

Lives in `src/main/core/screener.ts`. Replaces `ScoredCandidate.earningsFlagged: boolean`.

```typescript
export type CandidateEarnings =
  | { status: 'clear' } // known date, falls after expiry (or already past)
  | { status: 'flagged'; date: string; daysBeforeExpiry: number } // flag mode only
  | { status: 'unknown' } // feed returned no event
  | { status: 'unavailable' } // feed could not be read
```

`daysBeforeExpiry` is `differenceInCalendarDays(parseISO(expiration), parseISO(date))`
— it feeds the badge copy `⚠ Earnings Jul 31 · 21d before expiry` so the renderer
never redoes date math.

A `flagged` candidate can only exist when `criteria.earningsHandling === 'flag'`.
In `exclude` mode the same input produces an `ExcludedCandidate` with code
`earnings_in_window` and never reaches `ScoredCandidate`.

### Derivation

| `EarningsLookup` | Handling  | In window? | Outcome                             |
| ---------------- | --------- | ---------- | ----------------------------------- |
| `found`          | `exclude` | yes        | **excluded**, `earnings_in_window`  |
| `found`          | `exclude` | no         | `{ status: 'clear' }`               |
| `found`          | `flag`    | yes        | `{ status: 'flagged', date, days }` |
| `found`          | `flag`    | no         | `{ status: 'clear' }`               |
| `none`           | either    | —          | `{ status: 'unknown' }`             |
| `unavailable`    | either    | —          | `{ status: 'unavailable' }`         |

"In window" is the existing `earningsWithinHolding` predicate, unchanged:
`startOfDay(currentDate) <= earnings <= expiration`, inclusive at both ends.

---

## 4. `TickerScreeningInput.earnings` — engine input

```typescript
export type TickerScreeningInput = {
  ticker: string
  strikes: CandidateStrike[]
  ivRank: IvRank | null
  underlyingPrice: string | null
  earnings: EarningsLookup // was: earningsDate: string | null
}
```

`FilterInput.earningsDate: string | null` widens to `earnings: EarningsLookup` the
same way. The `earnings_in_window` filter's `applies` guard becomes:

```typescript
applies: (ctx, criteria) =>
  criteria.earningsHandling === 'exclude' && ctx.earnings.status === 'found'
```

which is what keeps `unknown` and `unavailable` from ever excluding.

**The engine stays pure.** It imports no fetcher and performs no I/O — it receives
an already-resolved `EarningsLookup` as a plain value, exactly as it already
receives `ivRank` and `underlyingPrice`.

---

## 5. Ranking tier

```typescript
// 0 = clear, 1 = unknown/unavailable, 2 = earnings in window.
// Sorts before yield-per-delta: pre-earnings IV inflation is what lifts these
// candidates up the score, so a high score must never rescue a tier.
function earningsTier(candidate: ScoredCandidate): 0 | 1 | 2
```

`rankCandidates` becomes `earningsTier(a) - earningsTier(b)` **then**
`compareYieldPerDelta(a, b)` **then** `a.ticker.localeCompare(b.ticker)`.

`screenTicker`'s intra-ticker best-strike pick is **unchanged** — every strike for
one ticker shares that ticker's earnings status, so the tier is constant within a
ticker and cannot reorder anything.

---

## 6. Renderer types

`ScreenerCandidate.earningsFlagged: boolean` in `src/renderer/src/api/screener.ts`
is replaced by `earnings: ScreenerCandidateEarnings`, a field-for-field mirror of
`CandidateEarnings`. `IpcScoredCandidate` in `src/preload/index.d.ts` mirrors it
identically.

### Badge presentation (from `mockups/us-66-screener-results.mdx:285`)

| Status        | Rank cell | Badge copy                              | Treatment                                                        |
| ------------- | --------- | --------------------------------------- | ---------------------------------------------------------------- |
| `clear`       | number    | none                                    | —                                                                |
| `flagged`     | `—`       | `⚠ Earnings Jul 31 · 21d before expiry` | gold — `bg-wb-gold-dim`, `border-wb-gold-border`, `text-wb-gold` |
| `unknown`     | `—`       | `? Earnings date unknown`               | neutral — muted surface/border, `text-wb-text-secondary`         |
| `unavailable` | `—`       | `? Earnings date unavailable`           | neutral, same as `unknown`                                       |

Gold is the caution colour, deliberately not red: an earnings-window candidate is
a judgement call the trader may take on purpose, not an error.

Date formatting uses the existing `fmtDate` (`MMM d`) from
`src/renderer/src/lib/format.ts` — the same helper the Exp column already uses.

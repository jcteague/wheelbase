# ADR: Earnings dates persist as one current row per ticker; only failure backoff stays in memory

<!-- generated:from us-70 -->

## Decision

`migrations/013_create_earnings_date.sql` adds an `earnings_date` table with one row per
ticker (`ticker` PRIMARY KEY, nullable `next_earnings`, `checked_through`, `checked_at`,
`source`), read and written through `src/main/services/earnings-dates.ts`. The table is
the cache. The Finnhub integration lost its 12-hour in-memory success `Map` and keeps only
a short **failure** backoff (5 minutes).

Rows are overwritten via `INSERT … ON CONFLICT (ticker) DO UPDATE` — no history. A
`next_earnings` of NULL means "checked, nothing scheduled through `checked_through`", which
is positive knowledge, not absence. **A failed fetch writes no row**; `unavailable` is
produced at read time and never persisted.

`checked_through` records the `to` bound of the request that produced the row, which is
what lets one row answer two callers asking different depths — the earnings-proximity
alert looks ~30 days out, the screener ~90. A stored NULL from a 30-day request does not
answer the 90-day question, so it is re-fetched; a row carrying a date is reused by both.

**Supersedes** US-56's decision that earnings data is transient and belongs in a
per-run boundary fetch behind a module-level 12-hour TTL cache.

## Why

Three reasons, in order of weight.

1. **Future work needs earnings outside the running process.** The watchlist already ships
   an unimplemented `post_earnings_only` entry condition whose whole premise is "has this
   ticker already reported?" — unanswerable from a cache that dies on restart. US-96's
   watchlist earnings column is the same shape.
2. **A process-local `Map` throws the answer away on every restart.** For a desktop app
   that is the common case, so the effective hit rate is far below what a 12-hour TTL
   suggests, and every cold start re-issues one Finnhub call per watchlist ticker against a
   60 calls/minute free-tier ceiling.
3. **An earnings date is the right shape to persist.** It is a durable fact about a
   scheduled event, not a live quote — unlike a bid/ask it does not decay between reads.
   The natural refresh trigger is a calendar event (the date passed) rather than a clock
   TTL, which is what makes "fetch only when we don't have it" correct rather than merely
   cheap.

**Why this differs from the Barchart IVR feed.** `ivr_snapshot` is a time series with a
composite `(underlying, observed_at)` key because IVR's history _is_ the product — US-98
exists to age a reading. Earnings is a point-in-time lookup where a stale value is simply
wrong, so it stores one current row and overwrites. Both auxiliary feeds persist; they
persist differently because the data has different semantics.

## Alternatives considered

- **Keep the in-memory cache alone** — rejected: it cannot serve `post_earnings_only`, and
  it loses every answer on restart.
- **A full per-event history table keyed `(ticker, event_date)`, mirroring `ivr_snapshot`**
  — rejected, and this is the sharpest reason for the chosen shape: such a table cannot
  express "we checked and there is nothing scheduled". An absent row and a genuinely empty
  calendar become indistinguishable, and US-70 turns on exactly that difference.
- **Cache in both places** — rejected: two caches with different TTLs over one fact is the
  drift that the reuse-one-feed decision already argues against.
- **Persist failures too** — rejected: a 429 or auth error is not knowledge about the
  ticker. Backoff for a failing symbol stays in memory so a restart correctly retries it.

## Consequences

Because a stored row can now outlive the fetch that produced it, the store has to separate
"stale" from "not an answer". A merely time-stale future date is the best knowledge
available and is served through an outage — that is the point of persisting. But a date
that has already passed says nothing about the _next_ print, and a NULL shallower than the
caller's horizon cannot speak for a window it never examined; both are rejected and read as
`unavailable`. Removing the feed's success cache also removed the only throttle on repeat
fetches, so the refresh rule carries an explicit minimum interval (short for a passed or
near-term date, weekly for a distant one) rather than re-asking whenever the stored date
looks unhelpful.

## Source

- `migrations/013_create_earnings_date.sql`
- `src/main/services/earnings-dates.ts` — `getEarnings`, the refresh rule, the upsert
- `src/main/integrations/finnhub-earnings.ts` — failure backoff only; no success cache
- Feature page: `../../features/us-70-earnings-in-window-warning.md`
- Schema: `../../schema/tables.md#earnings_date`, `../../schema/migrations.md`
- Domain pages: `../../domain/market-data.md`, `../../domain/alerts.md`
<!-- /generated -->

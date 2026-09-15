# ADR: Same-day IVR refresh uses delete-then-insert

<!-- generated:from us-44,us-100 -->

## Decision

When a fresh IVR snapshot arrives, the collector deletes any existing row for the same `underlying` within the window the reading belongs to, then inserts the new row inside one transaction.

**Amended by [us-100](../../features/us-100-ivr-on-demand-and-outside-market-hours.md):** the
window is the **exchange session**, not the UTC calendar day, and the row is stamped at that
session's close rather than at the fetch instant.

```
session = getMostRecentCompletedSession(calendar, parseISO(observedAt))
window  = observationWindowOf(calendar, session)   // [session.closeAt, nextSession.closeAt)
DELETE WHERE underlying = ? AND observed_at >= window.from
                            AND (window.to IS NULL OR observed_at < window.to)
INSERT (underlying, window.from, ...)
```

`window.to` is null for the newest session the calendar holds, whose window is still open at
its far end; the SQL skips that half. When the calendar cannot place the instant — an install
whose `trading_session` cache has never been fetched — the reading falls back to the old UTC-day
bounds (`utcDayBounds`, retained only for this) and is written at the raw fetch instant, with
`ivr_observation_unstamped` warned.

The invariant is now **at most one row per `underlying` per exchange session**, still enforced by
this delete window rather than by a constraint; the primary key stays `(underlying, observed_at)`.

## Why

`ivr_snapshot` uses `(underlying, observed_at)` as its primary key. A later run on the same day naturally produces a different `observed_at` timestamp, so a plain insert would create a second row instead of replacing the earlier value. The story requirement is "latest same-day value wins," and a transaction-local delete-then-insert satisfies that requirement while preserving the exact observation timestamp of the winning row.

Keeping the overwrite rule in the collector also avoids reshaping the table around a derived date column just to support one replace policy.

US-100 changed the _window_ because the UTC day was the wrong unit once collection could happen
on a non-trading day. Barchart derives IV rank from the **last close**, so a Saturday scrape and a
Sunday scrape are the same observation — and keying on the fetch's UTC day stored both, as two
rows carrying Friday's values under two different dates. `ivr_snapshot` is a time series
[us-98](../../features/us-98-ivr-staleness-tiers.md) ages in completed exchange sessions, so a
weekend row made a Friday reading look fresher than it was, and any percentile work computed over
stored rows would be skewed by duplicated non-observations. Stamping the observation rather than
the fetch preserves what every reader already assumed: a row means "a trading day's close".

## Alternatives considered

- **Primary key on `(underlying, observed_date)`** — rejected because downstream consumers benefit from keeping the precise observation timestamp.
- **Synthetic upsert key or trigger** — rejected because the service-layer transaction is simpler and easier to reason about in SQLite.
- **Allow weekend rows and teach readers to tolerate them** (us-100) — rejected: simpler to build,
  but it pushes the problem onto us-98 and everything downstream of the series.

## Source

- `plans/us-44/research.md`
- `plans/us-44/data-model.md`
- [extract: us-100](../../.extracts/us-100.md) — ADR "A reading is stamped at the session close it reflects, not the fetch instant"
- `src/main/services/ivr-collector.ts`
- `src/main/core/trading-calendar.ts` — `observationWindowOf`
- Feature pages: [us-44](../../features/us-44-ivr-snapshot-store-and-scheduler.md),
[us-100](../../features/us-100-ivr-on-demand-and-outside-market-hours.md)
<!-- /generated -->

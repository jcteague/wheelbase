# ADR: The exchange calendar is fetched and cached, not checked in

<!-- generated:from us-98 -->

## Decision

Trading sessions are treated as **exchange facts to cache**, not rules to derive or a
table to maintain by hand. `BrokerProvider.getMarketCalendar({ start, end })` returns the
venue's published sessions; `refreshTradingCalendar` in
`src/main/services/trading-calendar-store.ts` writes them to the `trading_session` table
(migration `015`), which is the only writer.

Every calendar day in the fetched range is written, **closures included** as a NULL
`close_at`. That is what lets coverage be derived as `MIN(date)..MAX(date)`, so a day
that was never fetched reads as _unknown_ rather than silently as a closure.
`SessionLookup` is therefore a three-way union: `open` / `closed` / `unavailable`.

`readTradingCalendar` is pure DB and never fetches. The daily IVR collector is what keeps
the cache ahead of today: it refreshes at most weekly, over 120 days back through 400
ahead, before reading.

## Context / Why

- A hand-maintained holiday table expires silently. US-98's original plan called for a
  checked-in 2025–2028 NYSE table; the implementation rejected it because nothing would
  fail loudly the year nobody renewed it.
- Observed-holiday conventions have exceptions (the 2025-01-09 national day of mourning)
  and unscheduled closures happen. Neither is derivable.
- A read must never hang on the broker — a screen renders from the cache, and a
  brokerless watchlist trader still gets answers from whatever was fetched last.
- Certifying freshness against a window that was never read is exactly the failure the
  `unavailable` state exists to prevent.

## Consequences

- **Coverage is operational, not editorial.** The store warns 30 days before coverage runs
  out, and warns when the calendar has never been fetched — an exhausted calendar silently
  disables every freshness judgement.
- A broker outage during refresh leaves the previous rows untouched and reports `failed`;
  the batch it gates still runs, per the batch failure-isolation rule.
- Reads are bounded to 45 days back / 2 ahead, comfortably past the ten-session stale
  boundary, so an ancient snapshot cannot make the read walk months of rows.
- `getMarketCalendar` is now part of the `BrokerProvider` interface, so every
  implementation — Alpaca, the fake, the scheduler's fallback — must answer it.

## Alternatives considered

- **A checked-in offline table** (the plan's choice) — rejected: silent annual expiry, and
  it would have put data inside `src/main/core`.
- **A live lookup with no cache** — rejected: reads would hang on the broker, and a
  brokerless install would lose freshness entirely.
- **Deriving holidays from rules** — rejected: exceptions and early closes are not
  derivable.

## Sources

- [extract: us-98](../../.extracts/us-98.md) — ADR "The exchange calendar is fetched and cached, not checked in"
- [feature: us-98-ivr-staleness-tiers](../../features/us-98-ivr-staleness-tiers.md)
- [`schema/tables.md`](../../schema/tables.md#trading_session)
<!-- /generated -->

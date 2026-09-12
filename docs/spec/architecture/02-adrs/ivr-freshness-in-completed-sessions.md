# ADR: IV-rank freshness is measured in completed exchange sessions

<!-- generated:from us-98 -->

## Decision

A reading's age is the number of exchange session closes **strictly after** the close of
the session it was observed in, up to and including `now`. `assessIvRank` in
`src/main/core/ivr-freshness.ts` maps that count onto four tiers — `fresh` (0–1),
`aging` (2–3), `stale` (4–10), expired (over 10) — and `isUsableState` derives usability
from the state rather than carrying a second flag that could drift from it.

The count comes from `countCompletedSessionsAfter` in `src/main/core/trading-calendar.ts`,
which is pure over a `TradingCalendar` value the caller supplies. An observation belongs
to the latest session whose close is at or before its timestamp.

## Context / Why

- Elapsed calendar days and UTC-date arithmetic both mis-age readings. Friday's close is
  still the last close all Monday morning; a Thanksgiving holiday ages nothing; an early
  close at 13:00 ET is a whole session, and Black Friday's 14:00 ET already belongs to
  Friday.
- "How many chances has the market had to move since this number was taken?" is the
  question a trader is actually asking, and sessions are its unit.
- Keeping the count in a pure core module keeps `src/main/core` free of I/O and lets the
  screener and the watchlist reach the same verdict from the same inputs.

## Consequences

- Every consumer must supply a calendar. There is no ambient default and no hidden clock
  read: `AssessContext` requires `now` explicitly.
- A calendar that cannot speak for the moment in question yields unknown, never a guessed
  age — see [the fetched-and-cached calendar ADR](./trading-calendar-fetched-and-cached.md).
- Tier boundaries are constants in one module (`FRESH_MAX_AGE`, `AGING_MAX_AGE`,
  `STALE_MAX_AGE`), not duplicated in Signal, services or JSX.

## Alternatives considered

- **Elapsed calendar days** — fails the Monday-morning and holiday cases outright.
- **Weekend-only heuristics** — still ages a reading across every holiday.
- **Derived holiday formulas** — observed-holiday conventions have exceptions and say
  nothing about early closes.

## Sources

- [extract: us-98](../../.extracts/us-98.md) — ADR "Freshness is measured in completed exchange sessions, not calendar days"
- [feature: us-98-ivr-staleness-tiers](../../features/us-98-ivr-staleness-tiers.md)
<!-- /generated -->

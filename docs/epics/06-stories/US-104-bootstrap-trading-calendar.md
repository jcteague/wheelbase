# US-104: Bootstrap the trading calendar so IV rank works on a fresh install

**As a** trader who has just installed Wheelbase, or just started using the bench,
**I want** the exchange calendar to be fetched as soon as the app needs it,
**So that** IV rank is judged and displayed from the first day, instead of every reading on every screen silently resolving to "n/a" until some unrelated nightly job happens to run.

---

## Context

US-98 made IV-rank freshness depend on a cached exchange calendar. `assessIvRank` ages a
reading against completed sessions, and it will not guess: a calendar that cannot reach the
observation yields `unreadable`, which `getAssessedIvrByUnderlying` maps to `null`, which the
bench renders as `n/a`.

That is correct behaviour. The problem is who fills the calendar. `refreshTradingCalendar`
has **exactly one caller in the entire codebase** — inside `collectIVRSnapshots`, the daily
IVR job registered at `afterClose + 60min`:

```ts
// src/main/services/ivr-collector.ts
if (brokerProvider !== undefined) {
  await refreshTradingCalendar(db, brokerProvider, now)
}
```

So the only thing that can populate the calendar is a job that runs once a market day, an
hour after the close. Until it has run at least once, `trading_session` is empty and **no IV
reading can be aged at all** — not a stale one, not a fresh one, not one collected seconds
ago. The entire IV column is dead, and the only signal is a warning in the log:

```
"Trading calendar has never been fetched; IVR freshness is unavailable"
```

**Observed 2026-09-13 (a Sunday), on a working install with Alpaca paper credentials saved
and option chains pulling normally:**

| Table             | Rows                  |
| ----------------- | --------------------- |
| `trading_session` | 0                     |
| `ivr_snapshot`    | 0                     |
| `watchlist`       | AAPL, MSFT, NVDA, SPY |

The warning fired on every single `watchlist_snapshot_built`. Every ticker read `n/a`, and
nothing the trader could do in the UI would change it: the manual "Refresh IVR now" control
routes through the same collector, which on a Sunday refreshes the calendar and then
correctly skips collection because the market is shut.

This is a chicken-and-egg. The job that fills the calendar is gated on market hours; the
calendar is what every bench render needs, at any hour.

### Why this is not US-100

[US-100](./US-100-collect-ivr-on-demand-and-outside-market-hours.md) adds collection
triggers — on watchlist add, and on an explicit refresh regardless of market hours. It is
about **when rows are written to `ivr_snapshot`**.

This story is about **whether any row can be interpreted once written.** Both are required
and neither substitutes for the other: with US-100 alone, a trader on a fresh install would
collect a perfectly good reading on Sunday and still see `n/a`, because there is no calendar
to age it against. US-100's context also predates US-98 and quotes an `isTradingDay` helper
that US-98 deleted.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader has saved broker credentials
  And the watchlist contains KO

Scenario: A fresh install fetches the calendar before the first bench render
  Given the trading calendar has never been fetched
  And KO has an IV rank recorded at the previous close
  When the trader opens the Watchlist page
  Then the trading calendar is fetched
  And the KO IV rank is shown with its freshness ring
  And no "calendar has never been fetched" warning is logged

Scenario: A populated calendar is not refetched on every render
  Given the trading calendar was fetched today
  When the trader opens the Watchlist page twice
  Then the calendar is fetched no more than once

Scenario: The bench still renders when the calendar cannot be fetched
  Given the broker is unreachable
  And the trading calendar has never been fetched
  When the trader opens the Watchlist page
  Then every saved stock is still listed with its ticker, thesis and price
  And each IV rank reads "n/a"
  And the failure is logged at warn level
  And no error is surfaced to the trader

Scenario: A trader with no broker configured is told why IV rank is unavailable
  Given no broker credentials are saved
  And the trading calendar has never been fetched
  When the trader opens the Watchlist page
  Then the bench explains that IV-rank freshness needs a broker connection
  And the explanation offers a way to open Settings

Scenario: An empty calendar is distinguishable from a ticker never collected
  Given the trading calendar has never been fetched
  And KO has an IV rank recorded at the previous close
  And XYZ has never had an IV rank collected
  When the trader views the bench
  Then KO's IV rank does not read as "never collected"
  And XYZ's IV rank reads "n/a"

Scenario: Collection still refreshes the calendar on its own schedule
  Given the trading calendar was last fetched eight days ago
  When the scheduled IVR collection fires
  Then the trading calendar is refreshed
```

---

## Technical Notes

- **The trigger is the open question this story must settle.** Three candidates, in
  increasing eagerness:
  1. **Lazy, on read.** `readTradingCalendar` finds no coverage and refreshes. Simplest to
     reason about and fires exactly when needed — but it makes a pure-ish DB read
     asynchronous and network-bound, which is precisely what US-98's ADR "Read never
     fetches" ruled out ("a screen must not hang on the broker"). Do not do this without
     revisiting that ADR explicitly.
  2. **At startup**, after migrations and broker-factory configuration. Costs one request
     per launch at most, keeps the read path pure, and matches the existing refresh's
     7-day throttle so it is nearly always a no-op.
  3. **From the snapshot service**, fired-and-forgotten alongside the first bench build.

  Option 2 is the recommendation: it preserves US-98's read-never-fetches invariant, which
  the bench depends on for responsiveness, and puts the bootstrap where every other
  one-time initialisation already lives.

- **The existing throttle already does most of the work.** `refreshTradingCalendar` refreshes
  at most once every 7 days over a 120-day-back / 400-day-ahead window. A startup call is
  therefore cheap in steady state; the change is about removing the market-hours gate from
  the _calendar_, not from _collection_.
- **Keep the two concerns separate.** Collection must stay gated on the session (that is
  US-44's rule, and US-100 only relaxes it for explicit triggers). The calendar is reference
  data with no market-hours dependency at all — Alpaca's calendar endpoint answers the same
  on a Sunday as on a Tuesday.
- **Degradation is not optional here.** A broker outage during bootstrap must leave the
  bench fully rendered with `n/a` IV ranks, per the boundary-I/O rule in `CLAUDE.md` and the
  alert-evaluation ADR. The snapshot service already degrades this way; do not introduce a
  path where a calendar failure empties rows.
- **The "no broker configured" case is genuinely different** and worth its own copy.
  `BrokerProvider.getMarketCalendar` is the only calendar source, so a trader running
  market-data-only will never have freshness. Today that is indistinguishable from "nothing
  collected yet". The bench should say so once, not per row.
- **Distinguishing empty-calendar from never-collected** needs the `unreadable` state to
  survive to the renderer. The engine already separates it from absent
  (`IvRankAssessment.status`), and `getAssessedIvrByUnderlying` then collapses both to
  `null`. Widening the IPC reading — or carrying a reason alongside it — is the smallest
  honest fix. This is the same class of defect the US-96 review caught in `ReadingNote`,
  which asserted "never collected" for a row that may in fact be unreadable.

---

## Out of Scope

- **Changing when IVR is collected.** That is US-100 — this story changes only whether a
  collected reading can be interpreted.
- **The IVR scraper** (US-43), its pacing, or its session handling.
- **The freshness tiers themselves** (US-98). Boundaries, ring treatment, and tooltip copy
  are unchanged.
- **Per-contract implied volatility on the position cockpit** — that is a different value
  from a different provider; see US-105.
- Backfilling a calendar older than the existing 120-day lookback.
- Any alternative calendar source. `BrokerProvider.getMarketCalendar` stays the only one.

---

## Dependencies

- **US-98:** introduced `trading_session`, `refreshTradingCalendar`, and the freshness
  engine whose bootstrap gap this story closes
- **US-96:** the bench is the surface where the empty column is visible
- **Pairs with US-100:** US-100 makes readings exist; this makes them legible. A fresh
  install needs both before IV rank works at all
- **Reconciles:** `followup-ivr-trading-day-calendar.md` shares the trading-day helper

---

## Estimate

3 points

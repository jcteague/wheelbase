# US-100: Collect IVR on watchlist add and outside market hours

**As a** wheel trader building a bench in the evening or over a weekend,
**I want** IV rank fetched the moment I add a ticker to the watchlist, and collection that isn't refused just because the market is shut,
**So that** a name I add on Sunday is screenable on Sunday, instead of reading "n/a" until Monday's after-close run.

---

## Context

IV rank is the first thing a premium seller looks at when deciding whether a name is worth selling a put on at all. US-97 made the collector cover watchlist underlyings, so the bench finally has a data source — but only on the collector's own schedule:

```ts
scheduler.register({
  name: IVR_COLLECT_JOB_NAME,
  cadence: { kind: 'afterClose', offsetMinutes: 60 },
  ...
})
```

That is once per market day, 60 minutes after close. A ticker added at any other time reads `n/a` until that window comes round. Research doesn't happen on the market's schedule — it happens in the evening and at weekends, which is exactly when this gap is widest.

A second guard closes the door the rest of the way:

```ts
function isTradingDay(now: Date, session: MarketStatus['session']): boolean {
  if (session !== 'closed') return true
  const day = now.getUTCDay()
  return day !== 0 && day !== 6
}
```

On a weekend this returns `false`, the run exits with `skippedReason: 'market_closed'`, and nothing is written. Critically, the **manual** trigger is not exempt: `ivr:collect-now` routes through `scheduler.runNow(IVR_COLLECT_JOB_NAME)` into the same handler, so "Refresh IVR now" is refused too. The trader has no way to populate IVR at all.

**Observed 2026-09-06 (a Sunday):** AAPL and NVDA added to the watchlist, screener renders both with IV rank `n/a`, and clicking "Refresh IVR now" changes nothing. Nothing short of waiting for Monday will fix it.

Worth stating precisely, because it narrows the change: **after-hours on a weekday already works.** `session` is `'closed'` after the bell, the weekday check passes, and collection proceeds. The two real gaps are **weekends** and **the absence of an on-add trigger**.

Barchart is the reason this is safe to loosen. It needs no broker credentials and serves the last close's `impliedVolatilityRank1y` whenever it is asked, so there is no market-hours dependency in the data source itself — only in a guard that was written to avoid pointless scheduled fetches, not to refuse a trader who is explicitly asking.

### The open design question this story must settle

Barchart's IVR is derived from the **last close**. Collecting on Saturday and again on Sunday writes two rows carrying Friday's values under two different dates. `persistSnapshot` keys on the UTC day, so it will happily store both.

That matters because `ivr_snapshot` is a time series other things read:

- **US-98** reasons about staleness by row age. Weekend rows make a Friday reading look fresher than it is.
- Any future IV-rank-of-IV-rank or percentile work computed over stored rows would be skewed by duplicated non-observations.

Two defensible answers, and the story should not be implemented until one is chosen:

1. **Stamp the observation, not the fetch.** Write the row under the trading day the reading belongs to (Friday), so a weekend fetch refreshes Friday's row rather than inventing Saturday's. Keeps the series one-row-per-trading-day and makes weekend collection genuinely free.
2. **Allow weekend rows and teach readers to tolerate them.** Simpler to build, pushes the problem onto US-98 and everything downstream.

Option 1 is the recommendation: it preserves the invariant that a row means "a trading day's close", which is what every reader already assumes.

### Reconciling with the existing follow-up

`docs/epics/06-stories/followup-ivr-trading-day-calendar.md` reports the **opposite** complaint about the same function: `isTradingDay` misclassifies a weekday market **holiday** as a trading day, so a manual refresh scrapes Barchart on Thanksgiving in violation of US-44's AC.

These are not in conflict once separated properly, and doing so is the cleanest form of this change:

- **Scheduled** runs should be _stricter_ — skip weekends **and** holidays (the follow-up's ask).
- **Explicit** runs — the trader clicking refresh, or adding a ticker — should not consult the calendar at all. The trader's intent is the trigger.

Landing this story should therefore close, or substantially subsume, that follow-up. Do not implement the two independently against the same function.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader holds an open CSP on MSFT
  And the watchlist contains KO

Scenario: Adding a ticker to the watchlist collects its IVR immediately
  Given AAPL is not on the watchlist and has no ivr_snapshot
  When the trader adds AAPL to the watchlist
  Then IVR is fetched for AAPL
  And an AAPL IV rank is readable without waiting for the scheduled run

Scenario: Adding a ticker collects only that ticker
  When the trader adds AAPL to the watchlist
  Then IVR is fetched for AAPL
  And no IVR request is made for KO or MSFT

Scenario: Adding a ticker that already has a reading for the day does not refetch
  Given AAPL has an ivr_snapshot recorded for the current trading day
  When the trader adds AAPL to the watchlist
  Then no IVR request is made for AAPL
  And the existing AAPL reading is unchanged

Scenario: The add succeeds even when the IVR fetch fails
  Given the IVR fetch for AAPL fails with a network error
  When the trader adds AAPL to the watchlist
  Then AAPL appears on the watchlist
  And the failure is logged at warn level
  And no error is surfaced to the trader

Scenario: A ticker Barchart does not cover is added without an IV rank
  Given Barchart does not cover XYZ
  When the trader adds XYZ to the watchlist
  Then XYZ appears on the watchlist
  And XYZ shows an IV rank of "n/a" on the screener

Scenario: Manual refresh works on a weekend
  Given today is Sunday
  When the trader triggers IVR collection manually
  Then IVR is fetched for KO and MSFT
  And the summary does not report "market_closed"

Scenario: Manual refresh works on a weekday market holiday
  Given today is Thanksgiving
  When the trader triggers IVR collection manually
  Then IVR is fetched for KO and MSFT

Scenario: A weekend reading is stored against the trading day it belongs to
  Given today is Sunday
  And Friday was the most recent trading day
  When the trader triggers IVR collection manually
  Then the KO reading is stored against Friday
  And exactly one KO snapshot exists for Friday

Scenario: The scheduled run still skips a weekend
  Given today is Saturday
  When the scheduled IVR collection fires
  Then no IVR request is made
  And the summary reports skipped with reason "market_closed"

Scenario: The scheduled run still fires after hours on a weekday
  Given today is a Wednesday and the market has closed
  When the scheduled IVR collection fires
  Then IVR is fetched for KO and MSFT
```

---

## Technical Notes

- **Split the guard by trigger, don't delete it.** `collectIVRSnapshots` needs to know whether it was invoked by the scheduler or by a person. A `trigger: 'scheduled' | 'explicit'` field on its input, defaulted to `'scheduled'`, keeps the existing call sites honest and makes the bypass explicit at the one place that wants it. Resist a boolean named `force`.
- **`ivr:collect-now` must pass `'explicit'`.** It currently delegates to `scheduler.runNow(IVR_COLLECT_JOB_NAME)`, which runs the registered handler and therefore inherits the scheduled behaviour. Either the handler needs to accept a trigger through `runNow`, or the IPC should call `collectIVRSnapshots` directly and stop routing through the scheduler. The second is simpler but loses the scheduler's run tracking and concurrency guard — check `polling-scheduler.ts` for whether two concurrent collections can overlap before choosing.
- **On-add collection is a single-ticker path.** Do not reuse the full-batch `collectIVRSnapshots` for it — the targets query would refetch the entire watchlist plus every open position on every add. Extract the per-ticker body (fetch → classify → `persistSnapshot`) so both callers share it.
- **The add must not wait on the network.** `watchlist:add` is a user-facing IPC call; a ~1s Barchart fetch inside it makes the add feel broken. Fire the collection after the row is committed and let the renderer's IVR query pick it up, or return the added row immediately and push the snapshot separately. Whichever is chosen, a failing fetch must never fail the add — this is the boundary-I/O degradation rule from CLAUDE.md and the alert-evaluation ADR.
- **Same-day dedupe needs a real read.** "Already has a reading for the day" should be answered from `ivr_snapshot`, not from an in-memory cache that a restart would lose. `getLatestIvrByUnderlying` already exists; check its date against the resolved trading day.
- **Resolving "the trading day a reading belongs to"** (design option 1) is the only genuinely new logic. It needs the most recent trading day at or before now, which is the same calendar the holiday follow-up needs. Build it once; that shared helper is what lets both stories land together.
- `persistSnapshot` already overwrites same-UTC-day rows, so re-collection is idempotent once the date is resolved correctly.
- Sequential collection with its ~1s inter-ticker pause and per-ticker failure isolation stays as-is for batch runs. The single-ticker path has no pacing concern.
- `not_available` remains a skip, not an error — bench names are likelier to be uncovered than held names.

---

## Out of Scope

- **Changing the scheduled cadence itself.** `afterClose + 60min` stays; this story adds triggers, it does not re-time the existing one.
- **Backfilling IVR history.** Tickers already on the watchlist get their first reading from the next run, scheduled or manual.
- Collecting IVR for a ticker when a _position_ is opened — same shape as this story, but positions already imply a prior watchlist add in the common flow. Worth its own story if the gap proves real.
- The Barchart scraper itself (US-43), its rate limiting, or its session handling.
- IVR staleness display and tiering (US-98) — this story changes when rows are written, not how their age is presented. If option 1 is chosen, US-98's inputs get _more_ trustworthy, not different.
- Any IV rank derived from Alpaca option snapshots. Alpaca serves per-contract implied volatility but publishes no rank or percentile, and building one requires a year of accumulated history; Barchart remains the IVR source.
- The screener's IV-rank cell, coloring, and floor behaviour (US-66, US-67, US-96).

---

## Dependencies

- **US-44:** `ivr_snapshot` table, collector, and the scheduler registration this story adds triggers around
- **US-63:** `watchlist` table and its add path, which becomes a collection trigger
- **US-97:** established the watchlist as a collection target; this story makes that collection timely
- **Reconciles / likely closes:** `followup-ivr-trading-day-calendar.md` — the shared trading-day calendar helper is the overlap, and `isTradingDay` must not be changed by both independently
- **Improves US-98:** staleness tiers become meaningful only if a row's date is the trading day it reflects

---

## Estimate

5 points — two triggers, one shared calendar helper, and a decision on row dating. Rises to 8 if the scheduler's `runNow` has to grow parameter passing.

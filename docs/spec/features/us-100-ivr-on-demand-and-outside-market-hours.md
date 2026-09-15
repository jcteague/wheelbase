# US-100: Collect IVR on watchlist add and outside market hours

<!-- generated:from us-100 -->

## Summary

IV rank is collected the moment a ticker enters the app, and an explicit refresh is no
longer refused because the exchange happens to be shut.

Before this, IV rank existed on exactly one schedule — the `afterClose + 60min`
collection registered by [US-44](./us-44-ivr-snapshot-store-and-scheduler.md), once per
market day. A ticker added at any other time read `n/a` until that window came round, and
research does not happen on the market's schedule: it happens in the evening and at
weekends, which is precisely when the gap was widest. A name added on a Sunday stayed
unscreenable until Monday evening, and "Refresh IVR now" did nothing about it, because
`ivr:collect-now` routes through `scheduler.runNow` into the same handler and inherited
the scheduled behaviour.

Three changes, and they are separable. A **trigger on the way in**: adding a ticker to the
watchlist, or manually entering a position on one, collects that ticker and only that
ticker. A **trigger-scoped guard**: the batch still refuses to run itself on a weekend or
a holiday, but a person asking is never refused. And a **new meaning for
`ivr_snapshot.observed_at`**: a reading is stamped at the close of the session it
reflects, not the instant it was fetched.

No migration. `ivr_snapshot` (007), `watchlist` (012) and `trading_session` (015) are
unchanged in shape.

## Acceptance criteria

Background: the trader holds an open CSP on MSFT, and the watchlist contains KO.

- Adding a ticker to the watchlist collects its IVR immediately
- Adding a ticker collects only that ticker
- Adding a ticker that already has a reading for the day does not refetch
- The add succeeds even when the IVR fetch fails
- A ticker Barchart does not cover is added without an IV rank
- Opening a position collects its IVR immediately
- Opening a position for an already-collected ticker does not refetch
- The position is created even when the IVR fetch fails
- Manual refresh works on a weekend
- Manual refresh works on a weekday market holiday
- A weekend reading is stored against the trading day it belongs to
- The scheduled run still skips a weekend
- The scheduled run still fires after hours on a weekday

## What was built

### Two collection paths, one shared body

`collectTicker({ db, logger, fetchIvr, calendar, ticker })` is the per-ticker body — fetch,
classify, persist — lifted out of the batch loop in `src/main/services/ivr-collector.ts`.
It returns `TickerOutcome`: `'persisted' | 'not_available' | 'failed'`, where `failed`
covers both a scraper error result and a thrown fetch. `persistSnapshot` stays outside its
`try`, because a DB write failing is systemic rather than per-ticker — the reasoning
recorded in
[ivr-collector-per-ticker-failure-isolation](../architecture/02-adrs/ivr-collector-per-ticker-failure-isolation.md).

The new `IvrOnDemand` port (`createIvrOnDemand` in
`src/main/services/ivr-on-demand.ts`) calls `collectTicker` for exactly one ticker. It
deliberately does **not** reuse `collectIVRSnapshots`, which resolves its targets from
positions ∪ watchlist — firing that per add would refetch the whole bench every time.
"Adding a ticker collects only that ticker" is precisely this distinction.

`collect(ticker)` skips when the ticker already has a reading for the current trading day.
Attribution is by session: the reading's most-recent-completed-session equals the current
one. With no calendar at all it degrades to Eastern-calendar-day equality, which is
coarser but still stops a same-evening re-add from refetching.

### The add never waits on the network

`addWatchlistEntry(db, payload, ivrOnDemand?)` and
`createPosition(db, payload, ivrOnDemand?)` fire `void ivrOnDemand?.collect(ticker)`
**after** the write has committed and after their existing `watchlist_entry_added` /
`position_created` INFO log. `IvrOnDemand.collect` never rejects — its whole body sits in a
`try/catch` that logs and swallows — and that guarantee is load-bearing rather than a
courtesy: the call is detached, so a rejection would surface as an unhandled rejection and
make a perfectly good add look like a failure. This is CLAUDE.md's boundary-I/O
degradation rule, the same one behind
[alert-evaluation-failure-isolation](../architecture/02-adrs/alert-evaluation-failure-isolation.md).

The duplicate-ticker `ValidationError` is thrown before the insert, so a rejected add never
triggers collection.

Because the add response has already returned by the time the reading lands, the renderer
learns about it out of band: `onCollected` sends `ivr:snapshot-updated` on the main
window's `webContents`, and `useIvrSnapshotUpdates` invalidates
`watchlistQueryKeys.snapshot` and `screenerQueryKeys.results`. `useWatchlistSnapshot` has
no `refetchInterval` by design, so without that push a newly added card would read `n/a`
until a manual reload.

### The guard is scoped, not deleted

`collectIVRSnapshots` takes `trigger?: 'scheduled' | 'explicit'`, defaulting to
`'scheduled'` so every existing call site keeps its behaviour:

```ts
if (session.status === 'closed') {
  if (trigger === 'scheduled') return { ...skippedReason: 'market_closed' }
  logger.info({ etDate, trigger }, 'IVR collection proceeding on a closed day at explicit request')
}
```

The trigger travels through the scheduler, because `ivr:collect-now` reaches the collector
via `scheduler.runNow`. `JobHandler` now takes a
`JobRunContext = { trigger: JobTrigger }`; a timer tick passes `'scheduled'` and
`runNow(name, opts?)` defaults to `'explicit'`. A `runNow` that _joins_ an in-flight run
keeps the trigger that run started with — the joiner's context is never handed to a handler
already executing.

Scheduled runs are therefore now strictly _stricter_ (weekends **and** holidays), while
explicit runs do not consult the calendar for permission at all. That closes the trigger
half of `docs/epics/06-stories/followup-ivr-trading-day-calendar.md`; its holiday half was
already resolved by [US-98](./us-98-ivr-staleness-tiers.md)'s calendar-backed guard.

### A reading names the session it reflects

Barchart derives IV rank from the **last close**, so a Saturday fetch and a Sunday fetch are
the same observation. The old `persistSnapshot` keyed dedupe on the UTC day of the fetch and
stored both — two rows carrying Friday's numbers under two different dates.

`persistSnapshot` now resolves
`session = getMostRecentCompletedSession(calendar, parseISO(observedAt))`, writes
`observed_at = session.closeAt`, and deletes over that session's half-open **observation
window** `[session.closeAt, nextSession.closeAt)`. The window comes from a new pure helper
`observationWindowOf(calendar, session)` in `src/main/core/trading-calendar.ts`, returning
`ObservationWindow | null`; `to` is `null` for the newest session the calendar holds, whose
window is still open at its far end.

| Fetch instant (ET)                    | `session` resolved | `observed_at` written |
| ------------------------------------- | ------------------ | --------------------- |
| Wed 17:00, Wed is a session           | Wed                | Wed 16:00 ET close    |
| Sun 15:00, Fri the last session       | Fri                | Fri 16:00 ET close    |
| Thanksgiving Thu 18:00 (closure)      | Wed                | Wed 16:00 ET close    |
| Tue 10:00 (session open, not closed)  | Mon                | Mon 16:00 ET close    |
| Black Friday 15:00, 13:00 early close | Fri                | Fri 13:00 ET close    |
| any, calendar never fetched           | `null`             | fetch instant (warn)  |

The invariant this buys — **at most one row per underlying per exchange session** — is
enforced by the delete window rather than a constraint. The primary key stays
`(underlying, observed_at)` and a same-session overwrite is still delete-then-insert.
`utcDayBounds` survives only as the unstamped fallback and is named and commented as such;
when it is used, `ivr_observation_unstamped` is warned.

`ensureTradingCalendar` is awaited before the stamp is resolved. On a fresh install the
calendar is empty, so an unawaited refresh would write the reading at the raw fetch instant
and US-98 would assess it as unreadable — the reading would exist and still render `n/a`.
This is why the story depended on [US-116](./us-116-market-facts-from-market-data-provider.md)
shipping first: US-100 makes readings _exist_, US-116 makes them _legible_.

### Renderer

`SettingsPage` dropped its `skippedReason === 'market_closed'` message branch — the manual
trigger is the explicit path and can no longer be refused by the calendar.
`CollectIvrNowResult.skippedReason` stays in `src/renderer/src/api/ivr.ts`, since the
envelope shape and the scheduled path's skip are unchanged.

## Architecture decisions

- **The non-trading-day guard is scoped by trigger, not deleted** — amends
  [ivr-non-trading-day-guard-in-collector](../architecture/02-adrs/ivr-non-trading-day-guard-in-collector.md).
  A named `trigger` says who is asking; a boolean `force` only says the guard is being
  overridden.
- **A reading is stamped at its session close, and dedupe runs over the session window** —
  amends
  [ivr-same-day-overwrite-delete-then-insert](../architecture/02-adrs/ivr-same-day-overwrite-delete-then-insert.md).
  Builds directly on
  [ivr-freshness-in-completed-sessions](../architecture/02-adrs/ivr-freshness-in-completed-sessions.md).
- **On-demand collection is a single-ticker path**, sharing only the per-ticker body with
  the batch, so an add cannot refetch the bench.
- **The add is detached and its collection never fails it** — boundary-I/O degradation.
- **The renderer learns about a late reading from a push event**, following the
  `market-data:stock-quote` precedent from US-32.
- **The scheduler tells a handler which trigger started the run**, because the manual
  trigger reaches the collector through `scheduler.runNow`.

## Contracts touched

- `ivr:collect-now` — amended: now an **explicit** run, which the calendar never refuses.
  Result shape unchanged, but it can no longer return `skippedReason: 'market_closed'`.
- `ivr:snapshot-updated` — **new** push event, main → renderer:
  `{ ticker: string }` (upper-cased).
- `watchlist:add` — amended: payload and envelope unchanged; collection fires after commit.
  An IVR fetch failure is never an error on this channel.
- `positions:create` — amended: same, after the transaction commits.
- `_test:ivr-fetch-log` — **new**, dev-only (`NODE_ENV === 'test'`): every ticker the fake
  scraper was asked for, in call order; reset by `_test:ivr-set-outcomes`. Negative
  acceptance clauses are otherwise unassertable, since a fetch returning `not_available`
  writes no row either.
- `_test:scheduler-run-scheduled` — **new**, dev-only: runs a job on the _scheduled_
  trigger and returns its result.

See [contracts/ipc-handlers.md](../contracts/ipc-handlers.md).

## Out of scope

- Changing the `afterClose + 60min` cadence — this story adds triggers, it does not re-time
  the existing one.
- Backfilling IVR history for tickers already on the watchlist; the first collection after
  this ships produces their first stamped row.
- The Barchart scraper itself ([US-43](./us-43-barchart-ivr-scraper.md)), its rate limiting,
  or its session handling.
- Staleness tiers and `IvrCell` rendering ([US-98](./us-98-ivr-staleness-tiers.md)) — this
  story changes when rows are written, not how their age is presented. US-98's inputs get
  more trustworthy, not different.
- Any IV rank derived from Alpaca option snapshots; Barchart remains the IVR source.
- The screener's IV-rank cell, colouring and floor behaviour (US-66, US-67, US-96).
- The `PollingScheduler.runNow` error-propagation cleanup remains untaken — shared US-46
  infrastructure.

## Source

- `plans/us-100/`
- `src/main/core/trading-calendar.ts`
- `src/main/services/ivr-collector.ts`
- `src/main/services/ivr-on-demand.ts`
- `src/main/services/polling-scheduler.ts`
- `src/main/services/watchlist.ts`, `src/main/services/positions.ts`
- `src/main/ipc/watchlist.ts`, `src/main/ipc/positions.ts`
- `src/main/ipc/test-ivr.ts`, `src/main/ipc/test-scheduler.ts`
- `src/main/integrations/fake-ivr.ts`
- `src/main/index.ts`
- `src/preload/index.ts`, `src/preload/index.d.ts`
- `src/renderer/src/hooks/useIvrSnapshotUpdates.ts`
- `src/renderer/src/pages/WatchlistPage.tsx`, `src/renderer/src/pages/SettingsPage.tsx`
- `e2e/ivr-on-demand.spec.ts`, `e2e/ivr-collector.spec.ts`,
  `e2e/ivr-watchlist-collection.spec.ts`, `e2e/ivr-helpers.ts`,
  `e2e/trading-day-fixtures.ts`

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->

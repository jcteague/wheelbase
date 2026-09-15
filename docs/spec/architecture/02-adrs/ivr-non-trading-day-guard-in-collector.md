# ADR: Non-trading-day IVR guard lives in the collector

<!-- generated:from us-44,us-98,us-100 -->

## Decision

The weekend/holiday guard runs at the top of `collectIVRSnapshots(...)`, short-circuiting
the batch before any network fetch and returning `skippedReason = 'market_closed'`.

**Amended by [us-98](../../features/us-98-ivr-staleness-tiers.md):** the verdict now comes
from the cached exchange calendar, not from the broker's clock. The collector refreshes
`trading_session` when a broker is configured, then calls `getTradingSession` for today's
Eastern date:

| Calendar verdict | Behaviour                                             |
| ---------------- | ----------------------------------------------------- |
| `closed`         | skip, with the existing `market_closed` batch summary |
| `unavailable`    | warn and collect best-effort                          |
| `open`           | collect                                               |

`BrokerProvider.getMarketStatus()` is no longer consulted here, and `isTradingDay` and
`fetchMarketStatusOrNull` are deleted. The broker argument is now **optional** and is used
only to refresh the calendar.

**Amended by [us-100](../../features/us-100-ivr-on-demand-and-outside-market-hours.md):** the
guard is **scoped by trigger**. `collectIVRSnapshots` takes
`trigger?: 'scheduled' | 'explicit'`, defaulting to `'scheduled'` so every pre-existing call
site keeps its behaviour:

| Calendar verdict | `trigger: 'scheduled'`                 | `trigger: 'explicit'`                   |
| ---------------- | -------------------------------------- | --------------------------------------- |
| `closed`         | skip, `skippedReason: 'market_closed'` | collect, logging the overridden verdict |
| `unavailable`    | warn and collect best-effort           | warn and collect best-effort            |
| `open`           | collect                                | collect                                 |

An explicit run can therefore never return `market_closed`. The trigger reaches the collector
through the scheduler: `JobHandler` takes a `JobRunContext = { trigger }`, a timer tick passes
`'scheduled'`, and `runNow(name, opts?)` defaults to `'explicit'` — which is the path
`ivr:collect-now` uses. A `runNow` that joins an in-flight run keeps the trigger that run
started with.

## Why

US-44 required the guard to protect both the scheduled after-close path and the manual
Settings trigger. Keeping the check in the collector means both entry points share one
code path, one batch-summary shape, and one logging decision.

US-100 kept that shared code path but **reversed the manual half of the US-44 rationale**. The
guard exists to avoid pointless _scheduled_ fetches; a trader clicking "Refresh IVR now", or
adding a ticker, has stated their intent. Barchart needs no broker credentials and serves the
last close whenever it is asked, so there is no market-hours dependency in the data source
itself — only in a guard written for the other caller. The observed symptom was a trader on a
Sunday with no way to populate IV rank at all.

Splitting by trigger also lets scheduled runs become _stricter_ (weekends **and** holidays)
while explicit runs stop consulting the calendar for permission, which is what reconciles this
ADR with `docs/epics/06-stories/followup-ivr-trading-day-calendar.md` — that follow-up
complained about the opposite failure against the same function.

US-98 changed the _source_ of the verdict because the old one was wrong in the case that
mattered. A missing or failing broker was treated as "assume trading day", so a holiday
run still fetched and overwrote the previous good reading — and a UTC weekday check
disagrees with the exchange's own calendar for part of every evening. Reading the cached
calendar also means a brokerless watchlist-only trader gets a correct guard rather than an
optimistic one.

## Alternatives considered

- **Rely only on `afterClose` scheduling** — rejected because the manual trigger must also
  be safe on weekends and holidays.
- **Put the guard only in the IPC handler** — rejected because that would leave the
  scheduled path with different behavior.
- **Keep the broker market-status check** (us-98) — rejected: it cannot answer for a
  brokerless install, and its fallback silently collected on closures.
- **Delete the guard outright** (us-100) — rejected: the scheduled after-close run would then
  scrape Barchart every weekend and holiday for readings it already has.
- **A boolean `force` flag** (us-100) — rejected: it says the guard is being overridden but not
  who is asking, and the collector's behaviour depends on exactly that.
- **Have `ivr:collect-now` call `collectIVRSnapshots` directly**, bypassing the scheduler
  (us-100) — simpler, but it loses the scheduler's run tracking and its join-in-flight
  concurrency guard.

## Source

- `plans/us-44/research.md`
- [extract: us-98](../../.extracts/us-98.md) — ADR "The collector's non-trading-day guard moves from the broker clock to the calendar"
- [extract: us-100](../../.extracts/us-100.md) — ADR "The non-trading-day guard is scoped by trigger, not deleted"
- `src/main/services/ivr-collector.ts`
- `src/main/services/trading-calendar-store.ts`
- `src/main/services/polling-scheduler.ts` — `JobTrigger`, `JobRunContext`
- `src/main/index.ts`
- Feature pages: [us-44](../../features/us-44-ivr-snapshot-store-and-scheduler.md),
[us-98](../../features/us-98-ivr-staleness-tiers.md),
[us-100](../../features/us-100-ivr-on-demand-and-outside-market-hours.md)
<!-- /generated -->

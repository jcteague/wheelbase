# US-49: Parked polling jobs self-resume at the next market open

**As a** wheel trader who leaves Wheelbase running overnight or launches it after hours,
**I want** the detect-assignments poll (and any `marketClosedMs: null` interval job) to wake itself up when the market reopens,
**So that** assignment detection resumes automatically each session without an app restart or a manual nudge.

---

## Context

A post-merge review of US-48 surfaced the root cause behind US-48 finding #1. The `PollingScheduler` only schedules a job's _next_ tick at the end of its _current_ tick (`tick()` / `runNow()` → `reschedule()`). For an interval job configured with `marketClosedMs: null` (detect-assignments), `reschedule()` resolves the next cadence to `null` whenever the market is closed and then **schedules nothing** — the job is parked with no timer. Because only a prior tick arms the next one, a parked job never re-arms itself: it stays dead until the app restarts or something calls `runNow()`.

The practical failure: a trader launches Wheelbase after hours (or simply leaves it open past the closing bell). The job fires once on start, sees the market closed, and parks. When the market reopens the next morning, **nothing wakes it** — assignment polling silently never resumes for that session.

This is precisely the behavior US-46 already promised but never delivered. US-46's acceptance criteria state:

> _Scenario: Market-hours-aware interval respects marketClosedMs of null_
> _Then the job runs once on start (initial fetch) and then does not run again until the next market open_
> _And an INFO log records "job {name} parked until next market open at {nextOpen}"_

Neither the next-market-open wake nor the INFO log exists in the shipped scheduler. This story hardens US-46 to fulfill its own contract, mirroring the US-47 broker-provider AC-hardening pattern.

This is distinct from US-48's fix. US-48 wired `brokerFactory.recreate()` to call `scheduler.runNow(...)` so a **runtime credential change** re-ticks the job. US-49 covers the case where credentials are already valid but the job parked at market close — a timing concern the credential path does not touch. With both in place, the job resumes whether the trigger is a credential change _or_ the natural market-open boundary.

No UI ships.

---

## Acceptance Criteria

```gherkin
Background:
  Given PollingScheduler is running with the detect-assignments job
  And the job cadence is { kind: "interval", marketOpenMs: 60_000, extendedHoursMs: 300_000, marketClosedMs: null }
  And market status is resolved through BrokerProvider.getMarketStatus()

Scenario: A job parked at market close schedules a wake for the next market open
  Given the market is closed and getMarketStatus reports nextOpen 2026-06-15T13:30:00Z
  When the job ticks and reschedule() resolves the next cadence to null
  Then the scheduler schedules a single wake-up timer for 2026-06-15T13:30:00Z
  And no further handler invocations occur before that time
  And an INFO log records "job detect-assignments parked until next market open at 2026-06-15T13:30:00Z"

Scenario: The job resumes its normal cadence when the market reopens
  Given the job is parked with a wake-up scheduled for the next market open
  And getMarketStatus will report session "regular" at that time
  When the wake-up timer fires
  Then the handler runs once
  And the job reschedules at the marketOpenMs cadence (60_000ms) from that point

Scenario: A job parked at close resumes at extended-hours cadence when pre-market opens first
  Given the job is parked with a wake-up scheduled for the next market open
  And getMarketStatus will report session "pre" at that time
  When the wake-up timer fires
  Then the handler runs once
  And the job reschedules at the extendedHoursMs cadence (300_000ms) from that point

Scenario: Launching the app after hours parks the job rather than killing it
  Given the market is closed when the app starts
  When scheduler.start() runs the job once on startup
  Then the job runs its initial handler invocation
  And the job is parked with a wake-up scheduled for getMarketStatus().nextOpen
  And the job is NOT left without any pending timer

Scenario: stop() cancels a pending market-open wake-up
  Given the job is parked with a wake-up scheduled for the next market open
  When scheduler.stop() is called
  Then the pending wake-up timer is cleared
  And no handler invocation fires at the previously scheduled market-open time

Scenario: A stale or missing nextOpen falls back to a bounded re-check instead of parking forever
  Given the market is closed and getMarketStatus reports a nextOpen that is already in the past (clock skew)
  When the job ticks and reschedule() resolves the next cadence to null
  Then the scheduler schedules a bounded re-check timer (the marketOpenMs cadence) rather than no timer
  And a WARN log records that nextOpen was unusable and a fallback re-check was scheduled

Scenario: System wake from sleep past the market open does not fire a burst
  Given the job was parked with a wake-up scheduled for the next market open
  And the OS slept past that scheduled instant
  When the OS wakes
  Then the handler runs at most once for the missed wake-up
  And the next tick is scheduled from "now" forward (no backfilled burst)
```

---

## Technical Notes

- File: `src/main/services/polling-scheduler.ts`. No new DB tables; scheduler state stays process-local.
- The fix lives in `reschedule()` for the `interval` branch. Today, when `decideNextCadenceMs(cadence, status)` returns `null`, the function returns without arming a timer. Change it so that a `null` result _caused by a closed market_ schedules a wake at `status.nextOpen` instead of nothing.
- Compute the wake delay as `new Date(status.nextOpen).getTime() - clock.now()`. Reuse the existing `scheduleTick(state, delayMs)` path so the wake reuses `state.timerId` — that guarantees `stop()` (which clears `state.timerId`) already cancels the pending wake with no extra code.
- When the wake fires, it runs the normal `tick()` → `runHandler()` → `reschedule()` cycle, so cadence resumption (regular vs extended-hours vs re-park) falls out of the existing logic for free. No special-case state machine.
- Emit the INFO log US-46 specified: `logger.info({ job, nextOpen }, 'job <name> parked until next market open at <nextOpen>')`.
- Defensive bound: if `nextOpen` is missing, unparseable, or `<= now`, do not schedule a zero/negative-delay timer (which would busy-loop). Fall back to scheduling a re-check at `marketOpenMs` and log at WARN. Keep the `marketClosedMs: null` semantics — the fallback is a re-check cadence, not a "poll while closed" cadence; the next tick will re-evaluate the session and re-park if still closed.
- Guard against the `setTimeout` 32-bit overflow only if needed: the maximum realistic `nextOpen` gap (long holiday weekend) is well under the ~24.8-day `setTimeout` ceiling, so no clamping is required, but note the assumption in a comment.
- Tests: extend `src/main/services/polling-scheduler.test.ts` using `vi.useFakeTimers()` and `vi.setSystemTime()` — assert the wake is scheduled at the right delay, that advancing to `nextOpen` resumes the cadence, that `stop()` clears the wake (`vi.getTimerCount()` returns to 0), and the stale-`nextOpen` fallback.

---

## Out of Scope

- Backfilling missed polls while the app was closed or asleep (US-46 explicitly excludes backfill; a single catch-up run on resume is sufficient).
- `afterClose` cron-style jobs — they already compute their own next fire time from `nextClose` and are unaffected.
- Jobs with a numeric `marketClosedMs` — those already self-resume because `reschedule()` returns a concrete delay while closed.
- The credential-change re-tick path (delivered in US-48).
- Any change to `decideNextCadenceMs`'s pure return contract; the parked-wake decision belongs in `reschedule()`, which owns timing/IO.

---

## Dependencies

- US-46 (polling scheduler — this hardens its `marketClosedMs: null` behavior)
- US-40 (`BrokerProvider.getMarketStatus` supplies `nextOpen`)
- Related: US-35 (assignment detection job) and US-48 (credential-change re-tick) — complementary triggers for the same job

---

## Estimate

3 points

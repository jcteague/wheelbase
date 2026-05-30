# US-46: Shared polling scheduler service for periodic background jobs

**As a** developer building features that run on a schedule (assignment detection, IVR collection, future quote refresh),
**I want** a single, testable `PollingScheduler` service that owns interval logic, market-hours awareness, and graceful shutdown,
**So that** every periodic job in the main process behaves consistently and we never ship two diverging scheduler implementations.

---

## Context

Two stories in Epic 06 need to run jobs on a schedule: **US-35** (poll broker activities every 30–60s during market hours) and **US-44** (collect IVR once per market day after close). They share concerns that are easy to get wrong if duplicated: market-session awareness, skipping weekends/holidays, retry-on-failure without piling up runs, clean shutdown when the app quits, and pausing while the OS is asleep.

This story extracts those concerns into one `PollingScheduler` service. Jobs register themselves with a name, a cadence policy (interval-based or cron-style "after market close"), and a handler function. The scheduler owns the timing primitives and lifecycle. No business logic lives here.

No UI ships.

---

## Acceptance Criteria

```gherkin
Background:
  Given PollingScheduler is defined in src/main/services/polling-scheduler.ts
  And it exposes register(jobConfig), start(), stop(), and runNow(jobName)

Scenario: Register an interval job
  Given a job config { name: "detect-assignments", cadence: { kind: "interval", marketOpenMs: 60_000, marketClosedMs: null }, handler: async () => { ... } }
  When the trader calls scheduler.register(jobConfig)
  Then the job is added to the registry
  And no execution has occurred yet

Scenario: Start invokes every registered job once and then on cadence
  Given two registered jobs "a" and "b" with interval 1000ms
  When the trader calls scheduler.start()
  Then handler "a" and handler "b" each run once immediately
  And each subsequent invocation is at least 1000ms after the previous

Scenario: Market-hours-aware interval respects marketClosedMs of null
  Given a job with cadence { kind: "interval", marketOpenMs: 60_000, marketClosedMs: null }
  And the market is currently closed (per BrokerProvider.getMarketStatus)
  When scheduler.start() runs
  Then the job runs once on start (initial fetch) and then does not run again until the next market open
  And an INFO log records "job {name} parked until next market open at {nextOpen}"

Scenario: Market-hours-aware interval with extended hours uses different cadence
  Given a job with cadence { kind: "interval", marketOpenMs: 60_000, extendedHoursMs: 300_000, marketClosedMs: null }
  And the market is in pre or post session
  When the scheduler ticks
  Then the job's next run is scheduled 300_000ms later

Scenario: After-market-close cron-style job
  Given a job with cadence { kind: "afterClose", offsetMinutes: 30 }
  When the market closes at 16:00 ET
  Then the job runs once at 16:30 ET
  And the job does not run on weekends or recognised holidays
  And missed runs (app was closed) are NOT backfilled

Scenario: Handler exception does not stop the scheduler
  Given a job whose handler throws on invocation
  When the scheduler runs the job
  Then the error is logged at WARN level with the job name and error message
  And the job is rescheduled for the next cadence tick (no exponential back-off pile-up)
  And other jobs continue running on their own schedule

Scenario: runNow triggers an out-of-band invocation
  Given a registered job "ivr-collect"
  When the trader calls scheduler.runNow("ivr-collect")
  Then the handler runs immediately
  And the scheduled cadence resumes from "now" (not from the prior scheduled instant)

Scenario: stop cancels all pending invocations
  Given the scheduler is running with 2 jobs
  When scheduler.stop() is called
  Then no further handler invocations occur
  And in-flight handler promises are awaited up to a 5-second drain timeout
  And after drain, scheduler.start() can be called again to resume

Scenario: System wake from sleep does not fire missed ticks
  Given the scheduler was running and the OS slept for 4 hours
  When the OS wakes
  Then the scheduler does NOT fire a burst of missed ticks
  And each job's next tick is scheduled from "now" forward

Scenario: Concurrent registration is rejected
  Given a job named "detect-assignments" is already registered
  When register is called again with the same name
  Then it throws SchedulerError "job already registered: detect-assignments"
```

---

## Technical Notes

- File: `src/main/services/polling-scheduler.ts`
- No new database tables. Scheduler state is process-local.
- Use plain `setTimeout` chains rather than `setInterval` — easier to reason about with async handlers and avoids overlapping runs.
- Each registered job is wrapped: `await handler(); scheduleNext()`. A handler that takes longer than the interval simply means the next run is delayed, not stacked.
- Market-session decisions go through `BrokerProvider.getMarketStatus()`. Cache the last result for the duration of a tick to avoid hammering the broker.
- Drain on `stop()`: track in-flight handler promises in a Set; await `Promise.allSettled([...inflight])` with a `Promise.race` against a 5-second timeout.
- Wire `scheduler.start()` into the main process lifecycle (`app.on('ready')` after IPC handlers are registered) and `scheduler.stop()` into `app.on('before-quit')`.
- The scheduler does NOT own job state or retry policy beyond rescheduling. Jobs that want exponential back-off implement it in their handler.

---

## Out of Scope

- Persisting "last successful run" timestamps (handler's responsibility if needed).
- Cron-style arbitrary expressions — only `interval` and `afterClose` for now.
- Multi-process scheduling.
- Job dependency graphs ("run B after A succeeds").
- Backfill of missed runs.

---

## Dependencies

- US-40 (`BrokerProvider.getMarketStatus` for market-session awareness)

---

## Estimate

5 points

---

## Consumers (informational)

- US-35 (assignment detection) — registers an interval job, runs every 60s during market hours, parked overnight.
- US-44 (IVR collection) — registers an `afterClose` job at offset +30 minutes.

# Red Phase Results: PollingScheduler (US-46 Layer 1, Area 1)

## Feature Context

- **Feature directory**: `plans/us-35/`
- **User story**: `docs/epics/06-stories/US-46-polling-scheduler.md`
- **Plan file**: `plans/us-35/plan.md`
- **Data model**: `plans/us-35/data-model.md`

## Test Files Created

- `src/main/services/polling-scheduler.test.ts`

## Interfaces Under Test

```typescript
// src/main/services/polling-scheduler.ts  (does NOT exist yet)

export type CadencePolicy =
  | {
      kind: 'interval'
      marketOpenMs: number
      extendedHoursMs?: number
      marketClosedMs?: number | null
    }
  | { kind: 'afterClose'; offsetMinutes: number }

export type JobConfig = {
  name: string
  cadence: CadencePolicy
  handler: () => Promise<void>
}

export interface PollingScheduler {
  register(config: JobConfig): void
  start(): void
  stop(): Promise<void>
  runNow(jobName: string): Promise<void>
}

export class SchedulerError extends Error {
  readonly code: 'already_registered' | 'job_not_found' | 'not_started'
}

export function createPollingScheduler(
  brokerProvider: BrokerProvider,
  clock?: {
    now(): number
    setTimeout(fn: () => void, ms: number): NodeJS.Timeout
    clearTimeout(id: NodeJS.Timeout): void
  }
): PollingScheduler
```

## Test Coverage Summary

| #   | Test                                                                   | Describe block           |
| --- | ---------------------------------------------------------------------- | ------------------------ |
| 1   | register() adds job without throwing                                   | `register()`             |
| 2   | register() throws `SchedulerError('already_registered')` for duplicate | `register()`             |
| 3   | runNow() throws `SchedulerError('job_not_found')` for unknown job      | `runNow() — unknown job` |
| 4   | start() fires all handlers once immediately                            | `start()`                |
| 5   | schedules subsequent invocations cadenceMs after previous run          | `interval cadence`       |
| 6   | parks when marketClosedMs is null and market is closed                 | `interval cadence`       |
| 7   | uses extendedHoursMs during pre/post sessions                          | `interval cadence`       |
| 8   | afterClose fires at nextClose + offsetMinutes                          | `afterClose cadence`     |
| 9   | afterClose does not backfill missed run                                | `afterClose cadence`     |
| 10  | logs WARN on handler error and reschedules                             | `error handling`         |
| 11  | runNow() fires immediately and resets cadence clock                    | `runNow()`               |
| 12  | stop() drains in-flight handlers                                       | `stop()`                 |
| 13  | stop() returns after 5s drain timeout for hung handler                 | `stop()`                 |
| 14  | no burst of missed ticks after system wake from sleep                  | `system wake from sleep` |

## Test Design Assumptions

- `createPollingScheduler(brokerProvider)` — factory function (not class constructor)
- `start()` fires handlers via `setTimeout(fn, 0)` (async, not synchronous)
- After each handler completes, scheduler calls `brokerProvider.getMarketStatus()` to decide next cadence
- `afterClose` fire time = `new Date(nextClose).getTime() + offsetMinutes * 60_000`; if in the past, skip (no backfill)
- `stop()` internal drain timeout is 5 seconds; uses `setTimeout` (so fake timers control it)
- System-wake test uses `vi.setSystemTime()` to jump the clock (not `vi.advanceTimersByTimeAsync()`) to simulate sleep without firing burst ticks
- Logger (`../logger`) is vi.mocked; `logger.warn` is a spy for the error-handling test

## Test Execution Results

```
Error: Cannot find module '/src/main/services/polling-scheduler' imported from
'/Users/johnteague/my-stuff/wb-35/src/main/services/polling-scheduler.test.ts'

1 failed, 0 tests run
```

## Verification

- ✅ Failure is "module not found" — implementation does not exist yet
- ✅ No syntax errors in the test file
- ✅ No fixture or import errors caused by test setup mistakes

## Handoff to Green Phase

Run `/green` for `src/main/services/polling-scheduler.ts`. Green phase must:

1. Create `src/main/services/polling-scheduler.ts` exporting `createPollingScheduler` and `SchedulerError`
2. Implement `PollingScheduler` interface with `register`, `start`, `stop`, `runNow`
3. Use `setTimeout` chains — one per job, never overlapping
4. Track in-flight promises in a `Set<Promise<void>>` for `stop()` drain
5. Pure helpers: `decideNextCadenceMs(policy, marketStatus)` and `decideAfterCloseFireAt(nextClose, offsetMinutes)`
6. Cache `getMarketStatus()` result per tick (single shared in-flight promise)
7. Inject `clock` boundary defaulting to real system clock
8. Log at WARN on handler error; continue scheduling

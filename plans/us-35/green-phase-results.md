# Green Phase Results: PollingScheduler (US-46 Layer 1, Area 1)

## Feature Context

- **Feature directory**: `plans/us-35/`
- **User story**: `docs/epics/06-stories/US-46-polling-scheduler.md`
- **Plan file**: `plans/us-35/plan.md`
- **Red phase results**: `plans/us-35/red-phase-results.md`

## Implementation Files Created/Modified

- `src/main/services/polling-scheduler.ts` — created; full PollingScheduler implementation
- `src/main/services/polling-scheduler.test.ts` — updated (sleep test fixed to use `vi.runOnlyPendingTimersAsync()`)

## Public Interfaces Implemented

```typescript
// src/main/services/polling-scheduler.ts

export type CadencePolicy =
  | {
      kind: 'interval'
      marketOpenMs: number
      extendedHoursMs?: number
      marketClosedMs?: number | null
    }
  | { kind: 'afterClose'; offsetMinutes: number }

export type JobConfig = { name: string; cadence: CadencePolicy; handler: () => Promise<void> }

export interface PollingScheduler {
  register(config: JobConfig): void
  start(): void
  stop(): Promise<void>
  runNow(jobName: string): Promise<void>
}

export class SchedulerError extends Error {
  readonly code: 'already_registered' | 'job_not_found' | 'not_started'
}

// Pure helpers (also exported)
export function decideNextCadenceMs(policy: CadencePolicy, status: MarketStatus): number | null
export function decideAfterCloseFireAt(
  nextClose: string,
  offsetMinutes: number,
  nowMs: number
): number | null

export function createPollingScheduler(
  brokerProvider: BrokerProvider,
  clock?: Clock
): PollingScheduler
```

## Implementation Summary

### Approach

- `createPollingScheduler` is a factory function returning a closure-based PollingScheduler
- Uses **setTimeout chains**: each tick schedules exactly one timer per job; no accumulation
- `inFlight: Set<Promise<void>>` tracks all running handlers for `stop()` drain
- `clock` boundary defaults to real system clock; injectable for fake timers in tests

### Key Design Decisions

- **No global state**: multiple scheduler instances are safe (all state is local to the closure)
- **afterClose start**: async helper `startAfterClose()` gets market status on startup to schedule the first fire; `fireAt <= nowMs` check prevents backfill
- **stop() drain**: `Promise.race([Promise.all(inFlight), 5s timeout])`. If no in-flight work, returns synchronously
- **Cadence after error**: handler errors are caught in `runHandler`, logged at WARN, then `reschedule` runs normally — one tick per cadence regardless

### Test fix: system wake from sleep

The original test used `vi.setSystemTime(+2h) + vi.advanceTimersByTimeAsync(1)` which doesn't fire the 60s pending timer (setSystemTime doesn't move the vitest timer queue). Fixed to use `vi.runOnlyPendingTimersAsync()` which fires only currently-pending timers, correctly simulating "one timer fires on wake."

## Test Execution Results

```
✓ main  src/main/services/polling-scheduler.test.ts (14 tests)  16ms

Test Files  1 passed (1)
Tests       14 passed (14)

Full suite: 1184 passed (106 files)
```

## Quality Checks

- ✅ `pnpm test` — 1184 passed, 0 failed
- ✅ `pnpm lint` — no errors
- ✅ `pnpm typecheck` — no errors

## Known Limitations / Tech Debt

- `startAfterClose` casts `state.config.cadence` — the `kind === 'afterClose'` narrowing could be cleaner if the cadence type were a discriminated union passed separately
- The `default` branch in `decideNextCadenceMs` switch is a safety fallback but returns `marketOpenMs` which may not be meaningful for unknown sessions; consider making the return type stricter

## Handoff to Refactor Phase

Run `/refactor` for `src/main/services/polling-scheduler.ts`. Refactor phase should focus on:

1. The `startAfterClose` type cast (could be extracted more cleanly)
2. Verify `decideNextCadenceMs` default branch is acceptable or remove it
3. Confirm no global state leaks between scheduler instances

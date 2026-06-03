# Red Phase Results: Area 6 — Wire Scheduler into Main Process Bootstrap

## Feature Context

- **Feature directory**: `plans/us-35/`
- **Plan file**: `plans/us-35/plan.md`
- **Layer**: Layer 4 (depends on Layer 3 complete)

## Test Files Created

- `src/main/index.test.ts` — new file

## Interfaces Under Test

```typescript
// src/main/services/scheduler-instance.ts (new)
export const scheduler: PollingScheduler // lazily-created singleton

// src/main/index.ts (modified)
// Bootstrap must:
//   scheduler.register({ name: 'detect-assignments', cadence: { kind: 'interval', marketOpenMs: 60_000, ... }, handler })
//   scheduler.start()
//   app.on('before-quit', async (e) => { e.preventDefault(); await scheduler.stop(); app.exit(0) })
```

## Test Coverage Summary

| Test                                                               | Failure Reason                                                                |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Singleton: importing scheduler-instance twice returns same object  | `Module not found: src/main/services/scheduler-instance` (file doesn't exist) |
| Bootstrap registers detect-assignments job                         | Assertion — `mockSchedulerRegister` never called (wiring not in index.ts)     |
| Bootstrap starts the scheduler after registering jobs              | Assertion — `mockSchedulerStart` never called                                 |
| Before-quit calls scheduler.stop() and awaits it before app.exit() | Assertion — `mockSchedulerStop` never called                                  |

## Test Execution Results

```
 FAIL src/main/index.test.ts
  ● scheduler-instance singleton › importing scheduler-instance twice returns the same object reference
    Error: Cannot find module '/src/main/services/scheduler-instance'

  ● main process bootstrap › bootstrap registers detect-assignments job on the scheduler
    AssertionError: expected "vi.fn()" to be called with arguments: [ObjectContaining{name: 'detect-assignments'}]
    Number of calls: 0

  ● main process bootstrap › bootstrap starts the scheduler after registering jobs
    AssertionError: expected "vi.fn()" to be called at least once

  ● main process bootstrap › before-quit handler calls scheduler.stop() and awaits it before app.exit()
    AssertionError: expected "vi.fn()" to be called at least once

4 failed, 0 passed
```

## Verification

- ✅ Test 1 fails because `src/main/services/scheduler-instance.ts` does not exist yet
- ✅ Tests 2–4 fail because `src/main/index.ts` has no scheduler wiring
- ✅ No syntax errors or test-bug failures

## Handoff to Green Phase

Green phase must:

1. Create `src/main/services/scheduler-instance.ts` exporting a `scheduler` singleton via `createPollingScheduler`
2. In `src/main/index.ts`:
   - Import `{ scheduler }` from `./services/scheduler-instance`
   - Import `{ registerAssignmentsIpc }` and call it with `{ db, scheduler }`
   - Register `'detect-assignments'` job before `scheduler.start()`
   - Wire `app.on('before-quit', async (e) => { e.preventDefault(); await scheduler.stop(); app.exit(0) })`

# Refactor Phase Results: PollingScheduler (US-46 Layer 1, Area 1)

## Automated Simplification

- code-simplifier agent: not run (changes were small and targeted; manual refactors applied directly)

## Manual Refactorings Performed

### 1. Eliminate `as` type cast in `startAfterClose`

**File**: `src/main/services/polling-scheduler.ts`
**Before**: `startAfterClose(state: JobState)` accessed `state.config.cadence` with an explicit cast: `state.config.cadence as { kind: 'afterClose'; offsetMinutes: number }`
**After**: `startAfterClose(state: JobState, offsetMinutes: number)` — accepts `offsetMinutes` directly. At each call site (`start()` and `reschedule()`), the cadence is already narrowed by a `kind === 'interval'` branch so TypeScript knows `cadence.offsetMinutes` is valid without a cast.
**Reason**: Type casts suppress type checking. Passing the value explicitly lets TypeScript verify the narrowing at the call site.

### 2. Fix double `clock.now()` in reschedule/startAfterClose

**File**: `src/main/services/polling-scheduler.ts`
**Before**: `clock.now()` was called twice for each `afterClose` scheduling decision — once for `decideAfterCloseFireAt` and once for `fireAt - clock.now()`.
**After**: Captured in a single `const nowMs = clock.now()` and used consistently.
**Reason**: Two `now()` calls could theoretically diverge if the clock changes between calls. Single capture guarantees a consistent timestamp for both the threshold check and the delay calculation.

### 3. Remove unreachable `default` branch from `decideNextCadenceMs`

**File**: `src/main/services/polling-scheduler.ts`
**Before**: `switch (status.session)` had a `default: return policy.marketOpenMs` that could never be reached since `session` is a 4-value literal union and all cases were handled.
**After**: Branch removed. TypeScript recognises the switch as exhaustive (no `default` needed when all union members are covered).
**Reason**: Dead code misleads readers into thinking an unknown session value is possible.

## Test Execution Results

```
✓ main  src/main/services/polling-scheduler.test.ts (14 tests) 12ms
Test Files  1 passed (1)
Tests       14 passed (14)
```

## Quality Checks

- ✅ `pnpm test` passed (14/14, no regressions)
- ✅ `pnpm lint` passed
- ✅ `pnpm typecheck` passed

## Remaining Tech Debt

None identified. File is 200 lines after formatting, types are clean, all state is closure-local.

## Notes

All three changes were applied incrementally with tests confirmed green after each step.

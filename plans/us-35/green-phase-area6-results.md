# Green Phase Results: Area 6 — Wire Scheduler into Main Process Bootstrap

## Feature Context

- **Feature directory**: `plans/us-35/`
- **Plan file**: `plans/us-35/plan.md`
- **Red phase results**: `plans/us-35/red-phase-area6-results.md`

## Files Touched (production)

- `src/main/services/scheduler-instance.ts` — new: singleton `PollingScheduler` export
- `src/main/index.ts` — modified: added scheduler wiring, job registration, before-quit handler

## E2E Coverage Added

None (covered by Area 8 e2e specs).

## Public Interfaces Implemented

```typescript
// src/main/services/scheduler-instance.ts
export const scheduler: PollingScheduler
// Module-level singleton via createPollingScheduler(getSafeBroker())
// getSafeBroker() falls back to a closed-market stub if broker credentials are missing

// src/main/index.ts additions
scheduler.register({
  name: 'detect-assignments',
  cadence: {
    kind: 'interval',
    marketOpenMs: 60_000,
    extendedHoursMs: 300_000,
    marketClosedMs: null
  },
  handler: async () => {
    await detectAssignments({ db, brokerProvider: bp, env })
  }
})
scheduler.start()
app.on('before-quit', async (e) => {
  e.preventDefault()
  await scheduler.stop()
  app.exit(0)
})
```

## Implementation Summary

### Approach

- `scheduler-instance.ts` exports a module-level `const scheduler` — Node.js module caching ensures singleton semantics.
- A `getSafeBroker()` helper wraps `brokerFactory.create()` in a try/catch, falling back to a stub `BrokerProvider` that returns `session: 'closed'` for `getMarketStatus()`. This prevents the module from blowing up at import time when Alpaca credentials aren't configured; parked jobs (no ticks) are the safe degraded state.
- In `index.ts`, `brokerProvider` is hoisted outside the try/catch so it's accessible for the `detect-assignments` job handler. Job registration is guarded by `brokerProvider !== null` — if broker creation fails, the job is skipped (scheduler still starts, just with no jobs).
- The before-quit handler is `async`, returning a Promise so the test can `await` it to verify ordering.

### Key Design Decisions

- **Fallback broker on missing credentials**: Jobs are not registered when the broker fails; the scheduler still starts cleanly with zero jobs. This matches the existing pattern in `index.ts` for `registerBrokerHandlers`.
- **`async` before-quit handler**: Electron ignores the return value of event handlers, but the async form allows the test to `await` it and verify that `stop()` completes before `exit()` is called.
- **`registerAssignmentsIpc` called unconditionally**: The IPC handlers are always registered (even if broker is missing), since `list-pending` / `confirm` / `dismiss` are DB-only operations.

### Deviations from Plan

None.

## Test Execution Results

```
✓ src/main/index.test.ts (4 tests) 51ms

Test Files  110 passed (110)
Tests       1215 passed (1215)
```

## Quality Checks

- ✅ `pnpm test` passed (1215 tests)
- ✅ `pnpm lint` passed
- ✅ `pnpm typecheck` passed

## Known Limitations / Tech Debt

- `bootCallback` in the test used a `ref` object pattern to work around TypeScript's control-flow narrowing in async closures — acceptable for a test file but worth noting.
- The `env` value passed to `detectAssignments` is hardcoded via `process.env.ALPACA_PAPER` — consistent with `brokerFactory` but could be surfaced as a first-class config value in a later refactor.

## Handoff to Refactor Phase

Refactor phase should examine `src/main/index.ts` for any cleanup opportunities introduced by the new wiring (e.g. comment clarity, import ordering).

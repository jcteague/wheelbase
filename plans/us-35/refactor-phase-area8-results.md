# Refactor Phase Results: Area 8 (E2E Tests)

## Automated Simplification

- code-simplifier agent: not delegated (changes were small, focused, and faster to apply
  manually; each e2e iteration costs ~5 minutes so minimising round-trips matters)
- Files processed manually: `e2e/polling-scheduler.spec.ts`,
  `e2e/assignment-detection.spec.ts`, `e2e/assignment-helpers.ts`

## Manual Refactorings Performed

### 1. Extract Type — `CspFixture`

**File**: `e2e/assignment-helpers.ts`
**Before**: `AAPL_PUT_180` and `MSFT_PUT_400` were structurally identical anonymous objects;
`seedCsp` took an inline 5-field parameter type duplicating the shape.
**After**: Single `CspFixture` type declared once; both constants annotate it; `seedCsp` takes
`CspFixture` directly.
**Reason**: One source of truth for the CSP shape; new fixtures can be added without re-typing.

### 2. Consolidate Factories — `makeOpasn`

**File**: `e2e/assignment-helpers.ts`, `e2e/assignment-detection.spec.ts`
**Before**: `aaplOpasn` and `msftOpasn` were near-identical 8-line factories with hard-coded
`symbol`, `qty`, and `price` values mirroring `AAPL_PUT_180` / `MSFT_PUT_400`.
**After**: One `makeOpasn(fixture, opts)` helper derives `symbol`, `qty`, and `price` from
the fixture; the spec keeps tiny named wrappers that bind transaction time.
**Reason**: Eliminates two-way drift between fixture and factory.

### 3. Move `goToPositionsList` to helpers

**File**: `e2e/assignment-helpers.ts`, `e2e/assignment-detection.spec.ts`
**Before**: `goToPositionsList` lived in the spec; its bounce-via-`/new` remount trick was
a non-obvious project pattern.
**After**: Lives in helpers next to `seedCsp` so future specs can reuse it.
**Reason**: Reusable, non-trivial navigation primitive belongs in the shared helper file.

### 4. Replace inline cast — `simulateSchedulerWake`

**File**: `e2e/assignment-helpers.ts`, `e2e/polling-scheduler.spec.ts`
**Before**: The system-wake test cast `window.api` to an inline structural type inside
`page.evaluate` — duplicating the `TestSchedulerApi` shape already defined in helpers.
**After**: `simulateSchedulerWake(page, jumpMs)` helper alongside the existing
`runNowTestJob` / `tryRegisterTestJob`.
**Reason**: All four `_test:scheduler-*` channels now consume the same `TestSchedulerApi`
type; spec code reads as plain function calls.

### 5. Simplify `seedAssignmentFixture`

**File**: `e2e/assignment-helpers.ts`
**Before**: Manually destructured 5 fields from `AAPL_PUT_180` into a fresh object to call
`seedCsp`.
**After**: Passes `AAPL_PUT_180` directly; `seedCsp` extracts only the fields it needs.
**Reason**: Reduces boilerplate; fixture-as-parameter is the natural shape.

## Production Changes Not Reverted (made during Green to make e2e green)

These were already covered by the Green phase but are worth listing alongside the e2e
refactor for traceability:

- `src/main/services/polling-scheduler.ts` — added `JobRegistryEntry`, `getRegistry()`,
  per-state invocation counters, reschedule-error tolerance, and dynamic auto-start of
  jobs registered after `start()`.
- `src/main/ipc/test-scheduler.ts` — new dev-only IPC layer
  (`_test:scheduler-registry`, `-run-now`, `-register`, `-simulate-wake`) plus
  `seedTestJobsFromEnv` (consumes `WHEELBASE_TEST_JOBS`).
- `src/main/index.ts` — wires test-scheduler bootstrap under `NODE_ENV === 'test'`.
- `src/preload/index.ts` — exposes the four `testScheduler*` IPC calls.
- `src/renderer/src/components/AssignmentNotificationBanner.tsx` — fixed the success-state
  unmount bug: confirmed assignments are retained from local state after the pending list
  invalidates, so "Open covered call →" actually renders.

## Test Execution Results

```bash
pnpm test:e2e -- e2e/polling-scheduler.spec.ts e2e/assignment-detection.spec.ts

Test Files  18 passed (18)
Tests       167 passed | 3 todo (170)
Duration    273s
```

All 10 polling-scheduler scenarios + all 9 assignment-detection scenarios pass green
alongside the existing e2e suite.

## Quality Checks

- ✅ `pnpm test:e2e` passed (no regressions across the full suite)
- ✅ `pnpm test` (unit) passed — banner unit tests still green after the success-state fix
- ✅ `pnpm lint` passed
- ✅ `pnpm typecheck` passed

## Files touched (production)

- `src/main/services/polling-scheduler.ts`
- `src/main/ipc/test-scheduler.ts` (new)
- `src/main/index.ts`
- `src/preload/index.ts`
- `src/renderer/src/components/AssignmentNotificationBanner.tsx`

## E2E coverage added or modified

- `e2e/polling-scheduler.spec.ts` — 10 US-46 scenarios
- `e2e/assignment-detection.spec.ts` — 9 US-35 scenarios
- `e2e/assignment-helpers.ts` — shared fixtures and helpers for both specs

## Remaining Tech Debt

- [ ] `PendingAssignmentNotification.positionId` is typed as `number` in
      `src/preload/index.d.ts` but the service returns a UUID string — pre-existing mismatch
      unrelated to Layer 5.
- [ ] System-wake simulation is a no-op (the setTimeout-chain scheduler inherently can't
      accumulate missed ticks, so there's nothing to simulate). If the implementation ever
      switches to absolute fire-at timestamps with catch-up, the IPC stub will need real
      semantics.

## Notes

All refactorings preserved behaviour. The two production-side changes during Green
(scheduler hardening + banner success-state fix) were necessary to make e2e tests
actually exercise the documented ACs, not optional polish.

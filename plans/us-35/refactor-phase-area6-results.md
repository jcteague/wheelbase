# Refactor Phase Results: Area 6 — Wire Scheduler into Main Process Bootstrap

## Automated Simplification

- code-simplifier agent run: passed
- Files processed: `src/main/services/detect-assignments.ts`, `src/main/ipc/assignments.ts`, `src/main/index.ts`, `src/main/index.test.ts`

## Manual Refactorings Performed

None required — code-simplifier addressed all identified issues.

### 1. Extract Constant — Eliminate `'detect-assignments'` magic string

**Files**: `src/main/services/detect-assignments.ts`, `src/main/index.ts`, `src/main/ipc/assignments.ts`
**Before**: The string `'detect-assignments'` was hardcoded in both `index.ts` (job registration) and `ipc/assignments.ts` (`scheduler.runNow` call) with no link between them.
**After**: Exported `DETECT_ASSIGNMENTS_JOB_NAME = 'detect-assignments'` constant from `detect-assignments.ts`; both callsites import and use it.
**Reason**: A typo in either location would silently break the runNow IPC handler; the constant makes the coupling explicit and refactor-safe.

### 2. Consolidate `before-quit` Handlers

**File**: `src/main/index.ts`
**Before**: Two separate `app.on('before-quit', ...)` registrations — one fire-and-forget `void marketDataProvider.disconnect()`, one async `e.preventDefault(); await scheduler.stop(); app.exit(0)`.
**After**: Single handler: `e.preventDefault(); await Promise.all([scheduler.stop(), marketDataProvider.disconnect()]); app.exit(0)`.
**Reason**: The original `disconnect()` was never awaited, so the market data provider could be torn down mid-flight. Consolidating ensures both subsystems shut down cleanly and concurrently before exit.

### 3. Remove Type Cast

**File**: `src/main/index.ts`
**Before**: `const env = (process.env.ALPACA_PAPER === 'true' ? 'paper' : 'live') as 'paper' | 'live'`
**After**: `const env: 'paper' | 'live' = process.env.ALPACA_PAPER === 'true' ? 'paper' : 'live'`
**Reason**: Explicit type annotation is preferable to a cast; expresses intent without overriding inference.

## Test Execution Results

```
Test Files  110 passed (110)
Tests       1215 passed (1215)
```

## Quality Checks

- ✅ `pnpm test` passed (no regressions)
- ✅ `pnpm lint` passed
- ✅ `pnpm typecheck` passed

## Files touched (production)

- `src/main/services/detect-assignments.ts`
- `src/main/ipc/assignments.ts`
- `src/main/index.ts`

## E2E coverage added or modified

None.

## Remaining Tech Debt

None identified.

## Notes

All refactorings performed by the code-simplifier agent in a single pass; tests verified green before and after.

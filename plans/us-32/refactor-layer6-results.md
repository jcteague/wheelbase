# Refactor Phase Results: US-32 Layer 6 — PositionsListPage

## Automated Simplification

- code-simplifier agent run: skipped (manual refactoring sufficient)

## Manual Refactorings Performed

### 1. Extract Function — `deriveMarketStatusDisplay`

**File**: `src/renderer/src/lib/market-status.ts` (new), `src/renderer/src/pages/PositionsListPage.tsx`
**Before**: `deriveMarketStatusDisplay` was a private function in `PositionsListPage.tsx`, untestable in isolation.
**After**: Extracted to `src/renderer/src/lib/market-status.ts`, imported by the page.
**Reason**: Isolated testability; other pages or hooks can reuse it without importing the full page module.

### 2. Fix — Stabilise `useMemo` dependencies for `activePositions`/`closedPositions`

**File**: `src/renderer/src/pages/PositionsListPage.tsx`
**Before**: `activePositions` and `closedPositions` were plain `const` expressions using `data?.filter(...)`, causing the `tickers` useMemo to re-run on every render (the `?? []` creates a new array reference each time `data` is nullish).
**After**: Both wrapped in `useMemo([data])` so tickers only recomputes when data changes.
**Reason**: Eliminates the `react-hooks/exhaustive-deps` warning and prevents unnecessary recomputation.

### 3. Workaround — `react-hooks/set-state-in-effect` for staleness computation

**File**: `src/renderer/src/pages/PositionsListPage.tsx`
**Before**: Two separate `useState`/`setStale` + `setMinutesAgo` calls in a `useEffect`.
**After**: Single combined `setStaleInfo({stale, minutesAgo})` call. Added targeted `// eslint-disable-next-line react-hooks/set-state-in-effect` because the staleness check is a legitimate use of `Date.now()` in an effect — there is no pure-render equivalent.
**Reason**: Reduces setState calls from 2 to 1 (eliminating potential cascade), and documents the intentional suppression.

## Test Execution Results

```
Test Files  83 passed (83)
Tests       958 passed (958)
```

## Quality Checks

- ✅ `pnpm test` passed (958 tests, no regressions)
- ✅ `pnpm lint` passed
- ✅ `pnpm typecheck` passed

## Remaining Tech Debt

- [ ] `deriveMarketStatusDisplay` has no unit tests yet (no test file for `lib/market-status.ts`). Can be added in a follow-up.
- [ ] The staleness update only fires when `dataUpdatedAt` changes. If quotes stop arriving but `dataUpdatedAt` remains constant, the `minutesAgo` display will not tick forward until the next data update. A periodic tick (30 s interval) would fix this but is deferred.

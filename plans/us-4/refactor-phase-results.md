# Refactor Phase Results: US-4 — Close a CSP Early (Buy to Close)

## Automated Simplification

- code-simplifier agent run: skipped (not available) — manual refactoring only

## Manual Refactorings Performed

### 1. Extract Function — `mapIpcErrors()`

**File**: `src/renderer/src/api/positions.ts`
**Before**: Inline `result.errors.map(...)` with `IPC_TO_FORM_FIELD` lookup repeated in both `closePosition` and `createPosition`
**After**: Single `mapIpcErrors(errors)` function called from both sites
**Reason**: Eliminated duplication; also reduced file from 239 lines → under 230

### 2. Extract Function — `handleIpcCall()`

**File**: `src/main/ipc/positions.ts`
**Before**: Identical try/catch blocks in `positions:create` and `positions:close-csp` — check `ValidationError`, log unhandled errors, return standard `{ ok: false, errors: [...] }` shape
**After**: `handleIpcCall(logLabel, fn)` wrapper used by both handlers; `positions:get` kept inline (different shape — null check, not exception-based)
**Reason**: Eliminated ~15 lines of duplicated error-handling logic; consistent error shape enforced in one place

### 3. Extract Function — `computePreview()`

**File**: `src/renderer/src/components/CloseCspForm.tsx`
**Before**: IIFE `(() => { const netPnl = ...; return { netPnl, totalPnl, pct } })()`  inline in render
**After**: Named `computePreview(openPremium, closePrice, contracts): PnlPreview | null` above the component
**Reason**: Named function is self-documenting; easier to test in isolation if needed

## Test Execution Results

```
Test Files  13 passed (13)
Tests       110 passed (110)
Duration    1.53s
```

## Quality Checks

- ✅ `pnpm test` passed (110 tests, no regressions)
- ✅ `pnpm lint` passed (1 pre-existing warning: React Hook Form incompatible-library — not introduced by refactor)
- ✅ `pnpm typecheck` passed

## Remaining Tech Debt

- None identified

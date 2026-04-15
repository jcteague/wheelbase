# Refactor Phase Results: US-7 Open Covered Call

## Automated Simplification

- code-simplifier agent run: failed (hit rate limit) — reverted to manual refactoring

## Manual Refactorings Performed

### 1. Extract Shared Validators — `lifecycle.ts`

**File**: `src/main/core/lifecycle.ts`
**Before**: `openWheel()` and `openCoveredCall()` each contained identical strike and premium validation blocks (4 lines each, duplicated twice)
**After**: Extracted `requirePositiveStrike(strike)` and `requirePositivePremium(premiumPerContract)` as private helper functions; both `openWheel()` and `openCoveredCall()` call them
**Reason**: Eliminated duplication — any change to validation message/code now happens in one place

### 2. Split Oversized Component — `OpenCoveredCallSheet.tsx`

**Before**: 649 lines — far exceeding the 200-line file size limit; contained `SheetHeader`, `CcForm`, `CcSuccess`, `StatBox`, `computeGuardrail`, and `GuardrailResult` all in one file
**After**: Split into 4 files:

- `OpenCoveredCallSheet.tsx` — 104 lines — orchestrator only (state, submit handler, portal render)
- `OpenCcSheetHeader.tsx` — 65 lines — reusable panel header with eyebrow/title/close button
- `OpenCcForm.tsx` — 205 lines — form component (imports from guardrail module)
- `OpenCcSuccess.tsx` — 175 lines — success state with `StatBox` private sub-component
- `openCcGuardrail.ts` — 27 lines — pure `computeGuardrail` function and `GuardrailResult` type (extracted to satisfy `react-refresh/only-export-components` lint rule)

**Reason**: File size limit (hard stop at ~200 lines); separation of concerns (form, success state, header are independently understandable)

## Test Execution Results

```
Test Files  37 passed (37)
      Tests 308 passed (308)
```

## Quality Checks

- ✅ `pnpm test` passed (308 tests, no regressions)
- ✅ `pnpm lint` passed (0 errors)
- ✅ `pnpm typecheck` passed (0 errors)

## Notes from `calculateInitialCspBasis` investigation

`calculateInitialCspBasis()` uses `.toString()` while `calculateCcOpenBasis()` and `calculateAssignmentBasis()` use `.toFixed(4)`. This was investigated and confirmed intentional — the tests for `calculateInitialCspBasis` expect compact output (`'146.5'`, `'350'`) while the downstream functions (assignment, CC) explicitly test for 4dp precision. No change made.

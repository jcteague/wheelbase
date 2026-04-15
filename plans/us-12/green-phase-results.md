# Green Phase Results: US-12 Code Review Fixes

## Feature Context

- **Feature directory**: `plans/us-12/`
- **Red phase results**: `plans/us-12/red-phase-results.md`

## Implementation Files Modified

- `src/main/services/get-position.ts` — SQL query updated to include `ROLL_TO` in active leg subquery (#1)
- `src/main/schemas.ts` — `newExpiration` changed from `z.string()` to `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` (#3)
- `src/renderer/src/components/RollCspSuccess.tsx` — hero card uses gold/amber tokens for debit rolls (#2)
- `src/renderer/src/components/RollCspSheet.tsx` — added `strikeError` state and validation in `validate()` (#6)
- `src/renderer/src/components/RollCspForm.tsx` — added `strikeError` prop, error display on strike field (#6)
- `src/preload/index.d.ts` — `IpcRollCspResult.position.phase` typed as `'CSP_OPEN'` literal (#4)

## Implementation Summary

### #1 + #5 — Active leg query (critical)

Changed the `LEFT JOIN legs` subquery in `get-position.ts` from `leg_role = 'CSP_OPEN'` to `leg_role IN ('CSP_OPEN', 'ROLL_TO')`. Same for `CC_OPEN`. The `ORDER BY fill_date DESC, created_at DESC LIMIT 1` ensures the most recent leg wins.

### #3 — Date validation

Reused the same regex pattern already used by `AssignCspPayloadSchema`: `.regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a valid date (YYYY-MM-DD)')`.

### #2 — Debit color

Extracted `heroColor`, `heroBg`, `heroBorder` variables that switch between green/gold based on `isCredit`. Applied to hero card, header border, and "Roll Complete" label.

### #6 — NaN strike

Added `strikeError` state to `RollCspSheet`, validation check in `validate()` for NaN/empty/non-positive values, and passed error prop through to `RollCspForm` for display.

### #4 — Preload type

Changed `position: { id: string; ticker: string; phase: string; status: string }` to `phase: 'CSP_OPEN'; status: 'ACTIVE'` literal types in `IpcRollCspResult`.

## Quality Checks

- 513 tests pass, 0 failures
- `pnpm lint` — 0 errors
- `pnpm typecheck` — clean

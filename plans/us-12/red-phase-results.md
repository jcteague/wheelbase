# Red Phase Results: US-12 Code Review Fixes

## Context

Six issues identified in code review of the CSP roll feature. Tests written to expose each bug before fixing.

## Test Files Modified

- `src/main/services/get-position.test.ts` — active leg after roll (#1)
- `src/main/services/roll-csp-position.test.ts` — roll-after-roll coverage (#5)
- `src/main/schemas.test.ts` — newExpiration date format validation (#3)
- `src/renderer/src/components/RollCspSheet.test.tsx` — debit color (#2) + NaN strike (#6)

## Issue #4 (preload type)

Type-only fix in `src/preload/index.d.ts` — change `phase: string` to `phase: 'CSP_OPEN'` in `IpcRollCspResult`. No runtime test; verified via `pnpm typecheck` in green phase.

## Failing Tests (8 total, all due to missing fixes)

### #1 — getPosition active leg after roll
- `getPosition > returns ROLL_TO leg as activeLeg after a CSP roll`
  - Fails: `expected 'CSP_OPEN' to be 'ROLL_TO'` — query only matches `leg_role = 'CSP_OPEN'`

### #5 — Roll-after-roll coverage
- `rollCspPosition > second roll uses ROLL_TO strike/expiration from first roll as ROLL_FROM`
  - Fails: `expected '180.0000' to be '175.0000'` — second roll reads stale original leg
- `rollCspPosition > getPosition.activeLeg points to latest ROLL_TO after two rolls`
  - Fails: `expected 'CSP_OPEN' to be 'ROLL_TO'`

### #2 — RollCspSuccess debit color
- `renders success state for net-debit roll with gold/amber hero colors, not green`
  - Fails: hero amount uses `var(--wb-green)` instead of gold

### #3 — newExpiration date validation
- `RollCspPayloadSchema > rejects newExpiration that is not YYYY-MM-DD format`
  - Fails: schema accepts `'May 16, 2026'`
- `RollCspPayloadSchema > rejects newExpiration with slashes instead of dashes`
  - Fails: schema accepts `'2026/05/16'`
- `RollCspPayloadSchema > rejects empty string for newExpiration`
  - Fails: schema accepts `''`

### #6 — NaN on cleared strike
- `shows validation error when strike field is cleared and submitted`
  - Fails: no validation error shown, NaN submitted

## Verification

- 8 new tests fail — all due to missing implementation, not test bugs
- 505 existing tests pass (zero regressions)

## Handoff to Green Phase

Fix order: #1 + #5 → #3 → #2 → #6 → #4

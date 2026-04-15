# Red Phase Results: Extract Shared Active Leg SQL Helper

## Feature Context

- **Feature directory**: `plans/us-12-refactor/`
- **Plan file**: `plans/us-12-refactor/plan.md`
- **Tasks file**: `plans/us-12-refactor/tasks.md`

## Test Files Modified

- `src/main/services/list-positions.test.ts` — added two new failing test cases for rolled CSP positions

## Interfaces Under Test

```typescript
// src/main/services/list-positions.ts
export function listPositions(db: Database.Database): PositionListItem[]
// Bug: LIST_QUERY uses leg_role IN ('CSP_OPEN', 'CC_OPEN'), missing ROLL_TO

// src/main/services/active-leg-sql.ts  (to be created in Green)
export function activeLegSubquery(): string
// Returns phase-aware SQL subquery for the current open leg
```

## Test Coverage Summary

### New Failing Tests

- [x] `returns correct strike and expiration for a rolled CSP position`
  - Creates position, rolls it to strike 185 / expiration isoDate(60)
  - Asserts `listPositions(db)[0].strike === '185.0000'`
  - Asserts `listPositions(db)[0].expiration === newExpiration`
- [x] `returns updated DTE after CSP roll`
  - Same setup
  - Asserts DTE is computed from ROLL_TO expiration (~60), not original CSP_OPEN expiration (~37)

## Test Execution Results

```
FAIL src/main/services/list-positions.test.ts (10 tests | 2 failed)
  ✓ returns empty array when no positions exist
  ✓ returns correct shape for a single CSP_OPEN position
  ✓ computes DTE as days from today to expiration
  ✓ formats decimal values to 4 places
  ✓ sorts by DTE ascending
  ✓ includes all positions
  ✓ returns null strike, expiration, and DTE for a position with no active leg
  × returns correct strike and expiration for a rolled CSP position
    AssertionError: expected '180.0000' to be '185.0000'
  × returns updated DTE after CSP roll
    AssertionError: expected 37 to be 60
  ✓ sorts null-DTE positions last
```

## Verification

- Every test fails because the buggy SQL query (`leg_role IN ('CSP_OPEN', 'CC_OPEN')`) picks up the original CSP_OPEN leg instead of the ROLL_TO leg after a roll — not due to test bugs.
- No syntax errors in test files.
- No fixture or import errors.

## Handoff to Green Phase

Green phase should:

1. Create `src/main/services/active-leg-sql.ts` exporting `activeLegSubquery()` with the phase-aware subquery
2. Modify `src/main/services/list-positions.ts` to use `activeLegSubquery()` in LIST_QUERY
3. Modify `src/main/services/get-position.ts` to use `activeLegSubquery()` in GET_QUERY (replacing the inline version at lines 105–112)

---

# Red Phase Results: Extract Shared Roll Domain Helpers (Area 2)

## Feature Context

- **Feature directory**: `plans/us-12-refactor/`
- **Refactor area**: Area 2 — Extract Shared Roll Domain Helpers
- **Files under test**: `src/renderer/src/lib/rolls.ts` (to be created)

## Test Files Created

- `src/renderer/src/lib/rolls.test.ts` — 7 unit tests for roll helper functions

## Interfaces Under Test

```typescript
// src/renderer/src/lib/rolls.ts

export type RollType = 'Roll Down & Out' | 'Roll Up & Out' | 'Roll Out'

export function getRollTypeLabel(currentStrike: string, newStrike: string): RollType

export type NetCreditDebit = {
  net: number
  isCredit: boolean
  perContract: number
  total: number
}

export function computeNetCreditDebit(
  costToClose: number,
  newPremium: number,
  contracts: number
): NetCreditDebit

export type RollCreditDebitColors = {
  color: string
  bg: string
  border: string
}

export function rollCreditDebitColors(isCredit: boolean): RollCreditDebitColors
```

## Test Coverage Summary

### getRollTypeLabel (3 tests)

- [x] Returns 'Roll Down & Out' when new strike < current strike
- [x] Returns 'Roll Up & Out' when new strike > current strike
- [x] Returns 'Roll Out' when strikes are equal

### computeNetCreditDebit (3 tests)

- [x] Returns isCredit=true and positive net when premium > cost
- [x] Returns isCredit=false when cost > premium
- [x] Computes total as |net| x contracts x 100

### rollCreditDebitColors (1 test)

- [x] Returns green palette CSS vars for credit, gold palette CSS vars for debit

## Test Design Assumptions

- `getRollTypeLabel` takes string arguments (matching form field values) and parses them as floats internally
- `computeNetCreditDebit` takes raw number arguments (costToClose, newPremium, contracts)
- `net` for a debit is negative (newPremium - costToClose when cost > premium)
- `total` is always positive (absolute value of net times contracts times 100)
- Color values use CSS custom properties (vars) containing 'green' or 'gold' in the variable name

## Test Execution Results

```
 FAIL  renderer  src/renderer/src/lib/rolls.test.ts [ src/renderer/src/lib/rolls.test.ts ]
Error: Failed to resolve import "./rolls" from "src/renderer/src/lib/rolls.test.ts". Does the file exist?

 Test Files  1 failed (1)
       Tests  no tests
    Start at  12:23:51
    Duration  499ms
```

## Verification

- Every test fails because `rolls.ts` does not exist — not due to test bugs.
- No syntax errors in test file.
- Failure is a module resolution error (correct RED phase failure type).
- Tests comprehensively cover the 3 exported functions.

## Handoff to Green Phase (Area 2)

Green phase should:

1. Create `src/renderer/src/lib/rolls.ts` with the exact interfaces listed above
2. Modify `src/renderer/src/components/RollCspForm.tsx` to import and use the helpers
3. Modify `src/renderer/src/components/RollCspSuccess.tsx` to import and use the helpers
4. Run `pnpm test src/renderer/src/lib/rolls.test.ts` — all 7 must pass
5. Run `pnpm test src/renderer/src/components/RollCspSheet.test.tsx` — no regressions

# Implementation Plan: US-13 — Roll CSP Down and Out

## Summary

US-13 extends the US-12 roll form to support strike changes (roll down/up), adds 5-way roll type labeling, roll count display with 3+ warning, updated net debit messaging, and ensures the position card reflects the new strike after rolling. The lifecycle engine validation is relaxed to allow same-expiration rolls when the strike changes. When complete, a trader can roll a CSP to any combination of strike and expiration (as long as something changes), see the roll type label, net credit/debit preview, and roll count before confirming.

## Supporting Documents

- **User Story & Acceptance Criteria:** `docs/epics/03-stories/US-13-roll-csp-down-and-out.md`
- **Research & Design Decisions:** `plans/us-13/research.md`
- **Data Model:** `plans/us-13/data-model.md`
- **API Contract:** `plans/us-13/contracts/positions-roll-csp.md`
- **Quickstart & Verification:** `plans/us-13/quickstart.md`
- **Mockup:** `mockups/us-12-13-roll-csp-form.mdx` (states: credit, debit-warning, validation-error, down-and-out, roll-count-warning, success)

## Prerequisites

- US-12 merged to `main` — provides `rollCsp()` lifecycle function, `rollCspPosition()` service, `RollCspPayloadSchema`, `positions:roll-csp` IPC handler, `RollCspSheet` component, `useRollCsp` hook, `NetCreditDebitPreview` component, `getRollTypeLabel` function (3-way), and all supporting infrastructure.
- Existing DB schema already has `roll_chain_id` column and `ROLL_FROM`/`ROLL_TO` leg roles.

## Implementation Areas

### 1. Lifecycle Engine — Allow Same-Expiration Strike Changes

**Files to create or modify:**
- `src/main/core/lifecycle.ts` — modify `RollCspInput` interface and `rollCsp()` validation
- `src/main/core/lifecycle.test.ts` — add tests for new validation rules

**Red — tests to write:**
- `src/main/core/lifecycle.test.ts`: `rollCsp rejects when both strike and expiration are unchanged` — input with `newStrike === currentStrike` and `newExpiration === currentExpiration` should throw `ValidationError` with code `no_change` and message "Roll must change the expiration, strike, or both"
- `src/main/core/lifecycle.test.ts`: `rollCsp allows same expiration when strike changes (roll down)` — input with `newStrike < currentStrike` and `newExpiration === currentExpiration` should return `{ phase: 'CSP_OPEN' }`
- `src/main/core/lifecycle.test.ts`: `rollCsp allows same expiration when strike changes (roll up)` — input with `newStrike > currentStrike` and `newExpiration === currentExpiration` should return `{ phase: 'CSP_OPEN' }`
- `src/main/core/lifecycle.test.ts`: `rollCsp rejects earlier expiration` — input with `newExpiration < currentExpiration` should throw `ValidationError` with field `newExpiration` and message "New expiration must be after the current expiration"
- `src/main/core/lifecycle.test.ts`: `rollCsp allows later expiration with same strike (roll out, existing behavior)` — existing test should still pass
- `src/main/core/lifecycle.test.ts`: `rollCsp allows later expiration with different strike (roll down and out)` — should return `{ phase: 'CSP_OPEN' }`
- `src/main/core/lifecycle.test.ts`: `rollCsp requires newStrike to be positive` — `newStrike: '0'` should throw `ValidationError`

**Green — implementation:**
- Extend `RollCspInput` in `src/main/core/lifecycle.ts` to add `currentStrike: string` and `newStrike: string` fields
- Modify `rollCsp()` validation:
  1. Check phase is CSP_OPEN (unchanged)
  2. `requirePositiveDecimal(input.newStrike, 'newStrike', 'New strike')`
  3. If `newStrike === currentStrike AND newExpiration === currentExpiration` → throw `ValidationError('__root__', 'no_change', 'Roll must change the expiration, strike, or both')`
  4. If `newExpiration < currentExpiration` → throw existing expiration error (change `<=` to `<`)
  5. Positive decimal checks for cost/premium (unchanged)

**Refactor — cleanup to consider:**
- Check for duplication between the old `newExpiration <= currentExpiration` check and the new two-part validation.

**Acceptance criteria covered:**
- "Roll to same strike and same expiration is rejected"
- "New expiration must not be earlier than current expiration"

---

### 2. Service Layer — Pass Strike to Lifecycle, Roll Count Query

**Files to create or modify:**
- `src/main/services/roll-csp-position.ts` — pass `currentStrike` and `newStrike` to `rollCsp()`
- `src/main/services/roll-csp-position.test.ts` — add tests for strike-change rolls and validation
- `src/main/services/get-position.ts` — add `rollCount` to response

**Red — tests to write:**
- `src/main/services/roll-csp-position.test.ts`: `roll down and out: ROLL_TO leg has new lower strike, ROLL_FROM leg has original strike` — create CSP at $180, roll with `newStrike: 175`, verify `rollToLeg.strike === '175.0000'` and `rollFromLeg.strike === '180.0000'`
- `src/main/services/roll-csp-position.test.ts`: `roll down with same expiration creates valid linked pair` — create CSP at $180 exp 2026-04-18, roll with `newStrike: 175, newExpiration: '2026-04-18'`, verify both legs created and cost basis updated
- `src/main/services/roll-csp-position.test.ts`: `rejects when both strike and expiration unchanged` — payload with same strike (omitted) and same expiration should throw `ValidationError` with code `no_change`
- `src/main/services/roll-csp-position.test.ts`: `rejects when expiration is earlier than current` — should throw `ValidationError`
- `src/main/services/get-position.test.ts`: `response includes rollCount of 0 for position with no rolls` — verify `result.rollCount === 0`
- `src/main/services/get-position.test.ts`: `response includes rollCount of 2 after two rolls` — create position, roll twice, verify `result.rollCount === 2`

**Green — implementation:**
- In `rollCspPosition()` in `src/main/services/roll-csp-position.ts`: pass `currentStrike: activeLeg.strike` and `newStrike: formattedNewStrike` to the `rollCsp()` lifecycle call
- In `src/main/services/get-position.ts`: after fetching legs, count legs where `legRole === 'ROLL_TO'` and add `rollCount` to the return object
- Update `GetPositionResult` type in `src/main/schemas.ts` to include `rollCount: number`

**Refactor — cleanup to consider:**
- Check for duplication and naming consistency in the service.

**Acceptance criteria covered:**
- "Successful roll down and out creates linked pair with new strike" (service-level verification)
- "Roll count warning at 3+ rolls" (data source for roll count)

---

### 3. Active Leg Query — Include ROLL_TO in Position Queries

**Files to create or modify:**
- `src/main/services/list-positions.ts` — add `'ROLL_TO'` to active-leg SQL filter
- `src/main/services/get-position.ts` — add `'ROLL_TO'` to active-leg SQL filter for CSP_OPEN phase
- `src/main/services/list-positions.test.ts` — test that rolled position shows new strike
- `src/main/services/get-position.test.ts` — test that detail page shows new strike after roll

**Red — tests to write:**
- `src/main/services/list-positions.test.ts`: `position list shows ROLL_TO strike after roll with strike change` — create position at $180, roll to $175, call listPositions, verify returned strike is `'175.0000'`
- `src/main/services/get-position.test.ts`: `position detail shows ROLL_TO as active leg after roll` — create position at $180, roll to $175 with new expiration, verify `activeLeg.strike === '175.0000'` and `activeLeg.expiration` is the new expiration

**Green — implementation:**
- `src/main/services/list-positions.ts` line 37: change `leg_role IN ('CSP_OPEN', 'CC_OPEN')` to `leg_role IN ('CSP_OPEN', 'CC_OPEN', 'ROLL_TO')`
- `src/main/services/get-position.ts` line 108: change `leg_role = 'CSP_OPEN'` to `leg_role IN ('CSP_OPEN', 'ROLL_TO')` within the `p.phase = 'CSP_OPEN'` branch

**Refactor — cleanup to consider:**
- Verify that ROLL_TO legs for CC rolls (US-14, future) won't accidentally be picked up. The filter is scoped by `p.phase = 'CSP_OPEN'` so this is safe — CC ROLL_TO legs will only exist when `p.phase = 'CC_OPEN'`.

**Acceptance criteria covered:**
- "The position card displays $175.00 as the active strike"

---

### 4. Roll Type Label — 5-Way Pure Function

**Files to create or modify:**
- `src/renderer/src/lib/rollType.ts` — new file for `getRollTypeLabel()` pure function
- `src/renderer/src/lib/rollType.test.ts` — unit tests for all 5 roll types

**Red — tests to write:**
- `src/renderer/src/lib/rollType.test.ts`: `returns "Roll Out" when strike unchanged and expiration later` — `getRollTypeLabel('180.00', '180.00', '2026-04-18', '2026-05-16')` returns `'Roll Out'`
- `src/renderer/src/lib/rollType.test.ts`: `returns "Roll Down & Out" when strike lower and expiration later` — `getRollTypeLabel('180.00', '175.00', '2026-04-18', '2026-05-16')` returns `'Roll Down & Out'`
- `src/renderer/src/lib/rollType.test.ts`: `returns "Roll Up & Out" when strike higher and expiration later` — `getRollTypeLabel('180.00', '185.00', '2026-04-18', '2026-05-16')` returns `'Roll Up & Out'`
- `src/renderer/src/lib/rollType.test.ts`: `returns "Roll Down" when strike lower and expiration same` — `getRollTypeLabel('180.00', '175.00', '2026-04-18', '2026-04-18')` returns `'Roll Down'`
- `src/renderer/src/lib/rollType.test.ts`: `returns "Roll Up" when strike higher and expiration same` — `getRollTypeLabel('180.00', '185.00', '2026-04-18', '2026-04-18')` returns `'Roll Up'`

**Green — implementation:**
- Create `src/renderer/src/lib/rollType.ts` with exported function:
  ```typescript
  export function getRollTypeLabel(
    currentStrike: string,
    newStrike: string,
    currentExpiration: string,
    newExpiration: string
  ): string
  ```
- Compare `parseFloat(newStrike)` vs `parseFloat(currentStrike)` for direction, and `newExpiration === currentExpiration` for same-exp. Return one of 5 labels per `plans/us-13/data-model.md` table.

**Refactor — cleanup to consider:**
- Remove the old 3-way `getRollTypeLabel` from `RollCspSheet.tsx` and import from the new shared module.

**Acceptance criteria covered:**
- "Roll type label reflects strike and expiration changes" (all 5 rows in Scenario Outline)

---

### 5. RollCspSheet — Roll Count, Net Debit Text, 5-Way Labels, Success State

**Files to create or modify:**
- `src/renderer/src/components/RollCspSheet.tsx` — update `getRollTypeLabel` usage, add roll count display, update net debit warning text, enhance success state
- `src/renderer/src/components/RollCspSheet.test.tsx` — add tests for new UI elements

**Red — tests to write:**
- `src/renderer/src/components/RollCspSheet.test.tsx`: `displays roll count badge` — render with `rollCount: 2`, verify "Roll #2" text is displayed
- `src/renderer/src/components/RollCspSheet.test.tsx`: `displays roll count warning at 3+ rolls` — render with `rollCount: 3`, verify warning text "This position has been rolled multiple times" is displayed
- `src/renderer/src/components/RollCspSheet.test.tsx`: `does not display roll count warning below 3 rolls` — render with `rollCount: 1`, verify warning text is NOT present
- `src/renderer/src/components/RollCspSheet.test.tsx`: `net debit warning says "increases your cost basis"` — enter cost $5.20 and premium $4.80, verify text "This roll produces a net debit, which increases your cost basis"
- `src/renderer/src/components/RollCspSheet.test.tsx`: `roll type label updates to "Roll Down & Out" when strike lowered` — enter strike $175 with current $180 and later expiration, verify "Roll Down & Out" appears in the header Caption
- `src/renderer/src/components/RollCspSheet.test.tsx`: `success state shows active strike change` — after successful roll response with different from/to strikes, verify text showing strike transition (e.g. "$180.00 → $175.00")

**Green — implementation:**
- Add `rollCount: number` prop to `RollCspSheetProps` (in `src/renderer/src/components/RollCspSheet.tsx`)
- Replace inline `getRollTypeLabel(currentStrike, newStrike)` with imported 4-arg `getRollTypeLabel(currentStrike, newStrike, currentExpiration, newExpiration)` from `src/renderer/src/lib/rollType.ts`
- Add roll count Badge below the roll type indicator row (per mockup: `<Badge color={rollCount >= 3 ? '#f85149' : '#8899aa'}>Roll #{rollCount}</Badge>`)
- Add AlertBox warning when `rollCount >= 3`: "This position has been rolled multiple times — consider whether the capital is better deployed elsewhere."
- Update `NetCreditDebitPreview` debit warning text from "This roll costs more to close than the new premium provides" to "This roll produces a net debit, which increases your cost basis"
- In `RollCspSuccess`: add an "Active strike" summary row when `rollFromLeg.strike !== rollToLeg.strike`, showing the strike transition. Update the info AlertBox to mention assignment at the new strike (per mockup).
- Pass `props.expiration` to `getRollTypeLabel` so the header Caption shows the correct 5-way label

**Mockup references:**
- **Form state (down-and-out):** Roll type badge in blue (`#58a6ff`), roll count badge in gray/red, strike description "$180 → $175 strike, Apr → May exp"
- **Form state (roll-count-warning):** Roll #3 badge in red (`#f85149`) + amber AlertBox warning
- **Form state (debit-warning):** Net debit preview in amber/gold with updated warning text
- **Success state:** "Roll Down & Out" badge in blue, "Active strike: $180.00 → $175.00" row in gold, info box mentioning assignment at new strike

**Refactor — cleanup to consider:**
- Extract roll count display into a small helper component if it makes the sheet cleaner.
- Delete the old inline `getRollTypeLabel` function.

**Acceptance criteria covered:**
- "Roll form allows strike change and shows roll count"
- "Net credit preview for roll down and out" (label portion)
- "Net debit preview with warning for expensive roll down" (warning text)
- "Roll count warning at 3+ rolls"
- "Roll to a higher strike is allowed (roll up and out)" (label)

---

### 6. Wire Roll Count to Sheet — Position Detail Integration

**Files to create or modify:**
- `src/renderer/src/pages/PositionDetailContent.tsx` (or the sheet-opening hook) — pass `rollCount` from position detail data to `RollCspSheet`
- `src/renderer/src/api/positions.ts` — update `GetPositionResponse` type to include `rollCount`

**Red — tests to write:**
- `src/renderer/src/pages/PositionDetailContent.test.tsx` (or integration test): `RollCspSheet receives rollCount from position detail` — mock position data with rollCount: 2, open roll sheet, verify the roll count prop is passed correctly

**Green — implementation:**
- In `src/renderer/src/api/positions.ts`: add `rollCount: number` to the `GetPositionResponse` type (matching the backend change in Area 2)
- In the component that renders `RollCspSheet` (likely `PositionDetailContent.tsx` or `usePositionDetailSheets.ts`): pass `rollCount={positionData.rollCount}` to the `RollCspSheet` component

**Refactor — cleanup to consider:**
- Check for naming consistency between backend `rollCount` and frontend prop.

**Acceptance criteria covered:**
- "Roll form allows strike change and shows roll count" (wiring)
- "Roll count warning at 3+ rolls" (wiring)

---

### 7. Validation in Form — Same-Strike-Same-Expiration and Earlier-Expiration

**Files to create or modify:**
- `src/renderer/src/components/RollCspSheet.tsx` — add client-side validation for same-strike-same-expiration and allow same-expiration when strike changes

**Red — tests to write:**
- `src/renderer/src/components/RollCspSheet.test.tsx`: `validation error when strike and expiration both unchanged` — set strike to current ($180) and expiration to current (2026-04-18), click confirm, verify error "Roll must change the expiration, strike, or both"
- `src/renderer/src/components/RollCspSheet.test.tsx`: `allows submission when only strike changes (same expiration)` — set strike to $175 and expiration to current (2026-04-18), click confirm, verify no validation error and mutate is called
- `src/renderer/src/components/RollCspSheet.test.tsx`: `validation error when expiration is earlier than current` — set expiration to 2026-04-11 (before 2026-04-18), click confirm, verify error "New expiration must be after the current expiration"

**Green — implementation:**
- In `RollCspSheet.tsx` `validate()` function:
  1. Replace `if (!newExpiration || newExpiration <= props.expiration)` with:
     - If `newExpiration < props.expiration` → set expiration error
     - If `newExpiration === props.expiration AND parseFloat(newStrike) === parseFloat(props.strike)` → set a root-level error "Roll must change the expiration, strike, or both"
  2. Allow `newExpiration === props.expiration` when `newStrike !== props.strike`
- Add a `rootError` state variable for the "both unchanged" case, displayed as an AlertBox above the submit button

**Refactor — cleanup to consider:**
- Check that the validation logic in the form mirrors the lifecycle engine validation.

**Acceptance criteria covered:**
- "Roll to same strike and same expiration is rejected"
- "New expiration must not be earlier than current expiration"

---

### 8. E2E Tests

**Files to create or modify:**
- `e2e/roll-csp-down-and-out.spec.ts` — new E2E test file

**Red — tests to write (one per AC):**

1. `e2e/roll-csp-down-and-out.spec.ts`: `Roll form allows strike change and shows roll count` — create a CSP position, open roll form, verify strike field is editable and pre-filled with current strike, verify roll count is displayed

2. `e2e/roll-csp-down-and-out.spec.ts`: `Net credit preview for roll down and out` — enter strike $175, expiration 2026-05-16, cost $2.80, premium $3.20, verify "Net Credit: +$0.40/contract ($40.00 total)" in green, verify label "Roll Down & Out"

3. `e2e/roll-csp-down-and-out.spec.ts`: `Net debit preview with warning for expensive roll down` — enter strike $170, expiration 2026-05-16, cost $5.20, premium $4.80, verify "Net Debit" in amber with warning "increases your cost basis"

4. `e2e/roll-csp-down-and-out.spec.ts`: `Successful roll down and out creates linked pair with new strike` — enter strike $175, expiration 2026-05-16, cost $2.80, premium $3.20, fill date, confirm roll, verify success state shows ROLL_FROM at $180 and ROLL_TO at $175, verify position card shows $175 strike

5. `e2e/roll-csp-down-and-out.spec.ts`: `Roll to a higher strike is allowed (roll up and out)` — enter strike $185, expiration 2026-05-16, confirm roll, verify success state shows "Roll Up & Out" label

6. `e2e/roll-csp-down-and-out.spec.ts`: `Roll to same strike and same expiration is rejected` — enter same strike and same expiration, attempt confirm, verify validation error "Roll must change the expiration, strike, or both"

7. `e2e/roll-csp-down-and-out.spec.ts`: `New expiration must not be earlier than current expiration` — enter earlier expiration, attempt confirm, verify validation error

8. `e2e/roll-csp-down-and-out.spec.ts`: `Roll count warning at 3+ rolls` — create position, roll twice, open roll form for third time, verify "Roll #3" badge and warning message displayed

9. `e2e/roll-csp-down-and-out.spec.ts`: `Roll type label reflects strike and expiration changes` — verify label changes dynamically as strike/expiration inputs change: Roll Out (same strike, later exp), Roll Down & Out (lower strike, later exp), Roll Up & Out (higher strike, later exp)

**Green — implementation:**
- Create `e2e/roll-csp-down-and-out.spec.ts` using Playwright `_electron` pattern from existing e2e tests
- Each test creates the necessary position state, navigates to position detail, opens the roll form, and verifies the AC
- Test 4 must also navigate back to position list/detail to verify the active strike updated
- Test 8 requires creating a position and rolling it twice before opening the form a third time

**Refactor — cleanup to consider:**
- Extract shared setup (create position, navigate to detail, open roll form) into a `beforeEach` or helper function.

**Acceptance criteria covered:**
- AC 1: "Roll form allows strike change and shows roll count"
- AC 2: "Net credit preview for roll down and out"
- AC 3: "Net debit preview with warning for expensive roll down"
- AC 4: "Successful roll down and out creates linked pair with new strike"
- AC 5: "Roll to a higher strike is allowed (roll up and out)"
- AC 6: "Roll to same strike and same expiration is rejected"
- AC 7: "New expiration must not be earlier than current expiration"
- AC 8: "Roll count warning at 3+ rolls"
- AC 9: "Roll type label reflects strike and expiration changes"

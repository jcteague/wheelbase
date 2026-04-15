# Implementation Plan: US-12 Refactor — Active Leg, Roll Helpers, RHF Migration

## Summary

Refactor the roll CSP feature across three areas: (1) fix the active leg resolution bug in `list-positions.ts` by extracting the phase-aware SQL subquery from `get-position.ts` into a shared helper, (2) extract duplicated roll domain helpers (`getRollTypeLabel`, net credit/debit logic) into `src/renderer/src/lib/rolls.ts`, and (3) convert `RollCspSheet` from hand-managed `useState` to react-hook-form + Zod, matching the established pattern in `CloseCspForm`. Done state: all existing tests pass, rolled CSPs show correct strike/expiration in list view, no duplicated roll logic across components, and RollCspSheet uses RHF+Zod.

## Supporting Documents

- **Research & Design Decisions:** `plans/us-12-refactor/research.md`
- **Data Model & Selection Logic:** `plans/us-12-refactor/data-model.md`
- **Quickstart & Verification:** `plans/us-12-refactor/quickstart.md`

## Prerequisites

- US-12 roll CSP feature is fully implemented and all tests pass
- The `get-position.ts` query already has the correct phase-aware active leg logic
- `CloseCspForm.tsx` provides the reference pattern for RHF+Zod form implementation

## Implementation Areas

### 1. Extract Shared Active Leg SQL Helper

**Files to create or modify:**

- `src/main/services/active-leg-sql.ts` — new file with shared SQL subquery fragment
- `src/main/services/list-positions.ts` — replace hardcoded `CSP_OPEN`/`CC_OPEN` leg join with shared helper
- `src/main/services/get-position.ts` — replace inline active leg subquery with shared helper

**Red — tests to write:**

- `src/main/services/list-positions.test.ts`: "returns correct strike and expiration for a rolled CSP position" — create a position, roll it via `rollCspPosition()`, call `listPositions()`, assert the returned `strike` and `expiration` match the ROLL_TO leg (not the original CSP_OPEN leg, and not null)
- `src/main/services/list-positions.test.ts`: "returns updated DTE after CSP roll" — same setup as above, assert `dte` is computed from the ROLL_TO leg's expiration
- `src/main/services/get-position.test.ts`: "active leg resolution still works after extracting shared SQL" — verify existing test coverage passes (this is a regression check, may not need a new test if coverage is already sufficient)

**Green — implementation:**

- Create `src/main/services/active-leg-sql.ts` exporting a function `activeLegSubquery()` that returns the SQL subquery string: `SELECT id FROM legs WHERE position_id = p.id AND ((p.phase = 'CSP_OPEN' AND leg_role IN ('CSP_OPEN', 'ROLL_TO')) OR (p.phase = 'CC_OPEN' AND leg_role IN ('CC_OPEN', 'ROLL_TO'))) ORDER BY fill_date DESC, created_at DESC LIMIT 1`
- Update `LIST_QUERY` in `src/main/services/list-positions.ts` to use the shared subquery in its `LEFT JOIN legs` clause
- Update `GET_QUERY` in `src/main/services/get-position.ts` to use the same shared subquery

**Refactor — cleanup to consider:**

- Verify the shared function is used consistently in both files with no inline SQL duplication remaining
- Check naming consistency: the function name should clearly express that it finds the "current open leg" for a position

**Acceptance criteria covered:**

- Rolled CSP positions show correct strike, expiration, and DTE in the position list (bug fix)
- Active leg resolution logic is centralized in one place

---

### 2. Extract Shared Roll Domain Helpers

**Files to create or modify:**

- `src/renderer/src/lib/rolls.ts` — new file with `getRollTypeLabel()`, `computeNetCreditDebit()`, `rollCreditDebitColors()`
- `src/renderer/src/components/RollCspForm.tsx` — import helpers from `rolls.ts`, remove local `getRollTypeLabel` and `NetCreditDebitPreview` data logic
- `src/renderer/src/components/RollCspSuccess.tsx` — import helpers from `rolls.ts`, remove local `getRollTypeLabel` and inline credit/debit color logic

**Red — tests to write:**

- `src/renderer/src/lib/rolls.test.ts`: "getRollTypeLabel returns 'Roll Down & Out' when new strike < current strike"
- `src/renderer/src/lib/rolls.test.ts`: "getRollTypeLabel returns 'Roll Up & Out' when new strike > current strike"
- `src/renderer/src/lib/rolls.test.ts`: "getRollTypeLabel returns 'Roll Out' when strikes are equal"
- `src/renderer/src/lib/rolls.test.ts`: "computeNetCreditDebit returns isCredit=true and positive net when premium > cost"
- `src/renderer/src/lib/rolls.test.ts`: "computeNetCreditDebit returns isCredit=false and negative net when cost > premium"
- `src/renderer/src/lib/rolls.test.ts`: "computeNetCreditDebit computes total as |net| × contracts × 100"
- `src/renderer/src/lib/rolls.test.ts`: "rollCreditDebitColors returns green palette for credit, gold for debit"

**Green — implementation:**

- `getRollTypeLabel(currentStrike: string, newStrike: string): RollType` — pure function, same logic as existing but extracted
- `computeNetCreditDebit(costToClose: number, newPremium: number, contracts: number): NetCreditDebit` — returns `{ net, isCredit, perContract, total }`
- `rollCreditDebitColors(isCredit: boolean): RollCreditDebitColors` — returns `{ color, bg, border }` using `var(--wb-green-*)` or `var(--wb-gold-*)` tokens
- Update `RollCspForm.tsx`: import `getRollTypeLabel` and `computeNetCreditDebit` + `rollCreditDebitColors` from `rolls.ts`. Remove local `getRollTypeLabel`. Simplify `NetCreditDebitPreview` to use the helpers for data computation.
- Update `RollCspSuccess.tsx`: import `getRollTypeLabel` and `rollCreditDebitColors` from `rolls.ts`. Remove local `getRollTypeLabel`. Replace inline color variable selection with `rollCreditDebitColors(isCredit)`.

**Refactor — cleanup to consider:**

- `SummaryRow` component is also duplicated between `RollCspForm.tsx` and `RollCspSuccess.tsx` — consider extracting to a shared component if the implementations are identical
- Verify no dead imports remain in the modified components

**Acceptance criteria covered:**

- Roll type label logic exists in exactly one place
- Net credit/debit computation and color selection are shared across form and success views

---

### 3. Convert RollCspSheet to React Hook Form + Zod

**Files to create or modify:**

- `src/renderer/src/components/RollCspSheet.tsx` — replace 10 `useState` calls with `useForm` + `zodResolver`, follow `CloseCspForm.tsx` pattern
- `src/renderer/src/components/RollCspForm.tsx` — update props to receive RHF `register`, `errors`, `control` instead of individual value/onChange/error props
- `src/renderer/src/components/RollCspSheet.test.tsx` — update tests to work with the new form structure (same assertions, potentially different interaction patterns)

**Red — tests to write:**

- Existing tests in `RollCspSheet.test.tsx` already cover all validation scenarios and form interactions. The Red phase here is verifying that the existing test suite fails after removing `useState` wiring (before adding RHF wiring). No new test cases are needed — the existing suite is the specification.

**Green — implementation:**

- Create a `makeRollCspSchema(currentExpiration: string)` factory function (in `RollCspSheet.tsx` or a co-located file) that returns a Zod schema with:
  - `cost_to_close: z.string().refine(v => parseFloat(v) > 0, 'Cost to close must be greater than zero')`
  - `new_premium: z.string().refine(v => parseFloat(v) > 0, 'New premium must be greater than zero')`
  - `new_expiration: z.string().min(1).refine(v => v > currentExpiration, 'New expiration must be after the current expiration')`
  - `new_strike: z.string().refine(v => parseFloat(v) > 0, 'Strike must be greater than zero')`
  - `fill_date: z.string().optional()`
- Replace `useState` calls with `useForm<RollCspFormValues>({ resolver: zodResolver(makeRollCspSchema(props.expiration)), defaultValues: { new_strike: parseFloat(props.strike).toFixed(2), ... } })`
- Replace `validate()` + `handleSubmit()` with RHF's `handleSubmit(onSubmit)` pattern
- Update `RollCspForm` props: replace individual `value`/`onChange`/`error` props with RHF's `register` function and `errors` object. Use `useWatch` for the net credit/debit preview (needs reactive cost/premium values).
- Wire mutation `onSubmit` to parse string form values to numbers before calling `mutate()`, matching `CloseCspForm`'s pattern

**Refactor — cleanup to consider:**

- Remove any unused imports (`useState` if no longer needed)
- Verify `RollCspForm` remains a pure presentational component — it should receive RHF props but not own the form instance
- Ensure error messages exactly match the existing strings (tests assert on them)
- Verify the new strike field's `defaultValues` correctly pre-fills with the formatted strike value

**Acceptance criteria covered:**

- RollCspSheet uses react-hook-form + Zod, consistent with `CloseCspForm` and project standards
- All existing validation error messages are preserved
- Net credit/debit preview updates reactively as fields change
- Form submission parses string values to numbers for the IPC payload

---

### 4. Regression Tests

This is not a separate implementation step — it is a verification gate. After all three areas are complete:

**Verification checklist:**

- `pnpm test` — all unit and integration tests pass
- `pnpm lint` — no lint errors
- `pnpm typecheck` — no TypeScript errors
- Manually verify (or check via existing E2E `e2e/csp-roll.spec.ts`) that the roll CSP flow still works end-to-end

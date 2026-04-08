# US-12 Refactor — Active Leg, Roll Helpers, RHF Migration — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off

---

## Layer 1 — Foundation (no dependencies)

> Both areas can be started immediately and run in parallel.

### Area 1: Extract Shared Active Leg SQL Helper

- [x] **[Red]** Write failing tests — `src/main/services/list-positions.test.ts`
  - Test case: "returns correct strike and expiration for a rolled CSP position" — create a position, roll it via `rollCspPosition()`, call `listPositions()`, assert `strike` and `expiration` match the ROLL_TO leg (not the original CSP_OPEN leg, and not null)
  - Test case: "returns updated DTE after CSP roll" — same setup, assert `dte` is computed from the ROLL_TO leg's expiration
  - Run `pnpm test src/main/services/list-positions.test.ts` — new tests must fail (current query misses ROLL_TO)

- [x] **[Green]** Implement — `src/main/services/active-leg-sql.ts`, `src/main/services/list-positions.ts`, `src/main/services/get-position.ts` *(depends on: Area 1 Red ✓)*
  - Create `src/main/services/active-leg-sql.ts` exporting `activeLegSubquery(): string` — returns the SQL subquery: `SELECT id FROM legs WHERE position_id = p.id AND ((p.phase = 'CSP_OPEN' AND leg_role IN ('CSP_OPEN', 'ROLL_TO')) OR (p.phase = 'CC_OPEN' AND leg_role IN ('CC_OPEN', 'ROLL_TO'))) ORDER BY fill_date DESC, created_at DESC LIMIT 1`
  - Update `LIST_QUERY` in `list-positions.ts`: replace `AND leg_role IN ('CSP_OPEN', 'CC_OPEN')` subquery with `activeLegSubquery()`
  - Update `GET_QUERY` in `get-position.ts`: replace the inline phase-aware subquery with `activeLegSubquery()`
  - Run `pnpm test src/main/services/list-positions.test.ts` — all tests must pass

- [x] **[Refactor]** `/refactor` — `src/main/services/active-leg-sql.ts`, `src/main/services/list-positions.ts`, `src/main/services/get-position.ts` *(depends on: Area 1 Green ✓)*
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Check naming: function name should clearly express "current open leg for a position"
  - Verify no inline SQL duplication remains in either consumer file
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 2: Extract Shared Roll Domain Helpers

- [x] **[Red]** Write failing tests — `src/renderer/src/lib/rolls.test.ts`
  - Test case: "getRollTypeLabel returns 'Roll Down & Out' when new strike < current strike"
  - Test case: "getRollTypeLabel returns 'Roll Up & Out' when new strike > current strike"
  - Test case: "getRollTypeLabel returns 'Roll Out' when strikes are equal"
  - Test case: "computeNetCreditDebit returns isCredit=true and positive net when premium > cost"
  - Test case: "computeNetCreditDebit returns isCredit=false and negative net when cost > premium"
  - Test case: "computeNetCreditDebit computes total as |net| × contracts × 100"
  - Test case: "rollCreditDebitColors returns green palette vars for credit, gold palette vars for debit"
  - Run `pnpm test src/renderer/src/lib/rolls.test.ts` — all new tests must fail (file does not exist yet)

- [x] **[Green]** Implement — `src/renderer/src/lib/rolls.ts`, `src/renderer/src/components/RollCspForm.tsx`, `src/renderer/src/components/RollCspSuccess.tsx` *(depends on: Area 2 Red ✓)*
  - Create `src/renderer/src/lib/rolls.ts`:
    - `getRollTypeLabel(currentStrike: string, newStrike: string): 'Roll Down & Out' | 'Roll Up & Out' | 'Roll Out'`
    - `computeNetCreditDebit(costToClose: number, newPremium: number, contracts: number): { net: number; isCredit: boolean; perContract: number; total: number }`
    - `rollCreditDebitColors(isCredit: boolean): { color: string; bg: string; border: string }` — returns `var(--wb-green-*)` or `var(--wb-gold-*)` CSS token strings
  - Update `RollCspForm.tsx`: import helpers from `rolls.ts`, remove local `getRollTypeLabel`, use `computeNetCreditDebit` + `rollCreditDebitColors` inside `NetCreditDebitPreview`
  - Update `RollCspSuccess.tsx`: import helpers from `rolls.ts`, remove local `getRollTypeLabel`, replace inline `heroColor`/`heroBg`/`heroBorder` variable selection with `rollCreditDebitColors(isCredit)`
  - Run `pnpm test src/renderer/src/lib/rolls.test.ts` — all tests must pass

- [x] **[Refactor]** `/refactor` — `src/renderer/src/lib/rolls.ts`, `src/renderer/src/components/RollCspForm.tsx`, `src/renderer/src/components/RollCspSuccess.tsx` *(depends on: Area 2 Green ✓)*
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider extracting `SummaryRow` component (duplicated between Form and Success) if implementations are identical
  - Verify no dead imports remain in either component
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — RHF Migration (depends on Area 2 Green ✓)

> Start only after Area 2 Green is checked off.

### Area 3: Convert RollCspSheet to React Hook Form + Zod

**Requires:** Area 2 Green ✓

- [x] **[Red]** Verify existing tests specify behavior — `src/renderer/src/components/RollCspSheet.test.tsx` *(depends on: Area 2 Green ✓)*
  - No new test cases needed — existing suite is the specification
  - Confirm all existing tests currently pass: `pnpm test src/renderer/src/components/RollCspSheet.test.tsx`
  - Remove the `useState`-based wiring in `RollCspSheet.tsx` to confirm tests fail (implementation guard)
  - Run `pnpm test src/renderer/src/components/RollCspSheet.test.tsx` — tests must fail after wiring is removed

- [x] **[Green]** Implement — `src/renderer/src/components/RollCspSheet.tsx`, `src/renderer/src/components/RollCspForm.tsx` *(depends on: Area 3 Red ✓)*
  - In `RollCspSheet.tsx`:
    - Create `makeRollCspSchema(currentExpiration: string)` Zod factory: `cost_to_close`, `new_premium`, `new_expiration` (with `> currentExpiration` refine), `new_strike`, optional `fill_date` — all string fields, same error messages as current
    - Replace 10 `useState` calls + `validate()` with `useForm<RollCspFormValues>({ resolver: zodResolver(makeRollCspSchema(props.expiration)), defaultValues: { new_strike: parseFloat(props.strike).toFixed(2) } })`
    - Replace `handleSubmit()` with RHF `handleSubmit(onSubmit)` — parse strings to numbers on submit before calling `mutate()`
    - Use `useWatch` for reactive cost/premium values powering the net credit/debit preview
  - In `RollCspForm.tsx`:
    - Replace individual `value`/`onChange`/`error` props with RHF `register`, `errors`, and `control` props
    - Keep it purely presentational — it must not own the form instance
  - Run `pnpm test src/renderer/src/components/RollCspSheet.test.tsx` — all tests must pass

- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/RollCspSheet.tsx`, `src/renderer/src/components/RollCspForm.tsx` *(depends on: Area 3 Green ✓)*
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Remove unused imports (`useState` if no longer needed)
  - Verify error messages exactly match existing test assertions
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for right reason)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] `pnpm test && pnpm lint && pnpm typecheck` — all clean

---
plan: us-12-refactor
source: plans/us-12-refactor/
extracted_at: 2026-05-30
status: complete
---

# Extract: us-12-refactor

## Summary

Refactor the roll CSP feature across three areas: (1) fix the active leg resolution bug in `list-positions.ts` by extracting the phase-aware SQL subquery from `get-position.ts` into a shared helper, (2) extract duplicated roll domain helpers (`getRollTypeLabel`, net credit/debit logic) into `src/renderer/src/lib/rolls.ts`, and (3) convert `RollCspSheet` from hand-managed `useState` to react-hook-form + Zod, matching the established pattern in `CloseCspForm`. Done state: all existing tests pass, rolled CSPs show correct strike/expiration in list view, no duplicated roll logic across components, and RollCspSheet uses RHF+Zod.

## Architecture Decisions

### ADR: Active Leg SQL Centralization

- **Decision:** Extract a reusable SQL subquery function that resolves the "current active leg" for a position based on its phase. Use it in both `list-positions.ts` and `get-position.ts`.
- **Why:** `list-positions.ts` currently queries for `CSP_OPEN` and `CC_OPEN` leg roles only, missing `ROLL_TO` legs entirely. After a roll, the position list shows null strike/expiration. The correct logic already exists in `get-position.ts` (phase-aware: `CSP_OPEN → CSP_OPEN|ROLL_TO`, `CC_OPEN → CC_OPEN|ROLL_TO`). Extracting this into a shared SQL fragment eliminates the inconsistency and prevents future callers from getting it wrong.
- **Alternatives considered:**
  - Persisting an `is_active` or `superseded_at` column on legs — rejected as over-engineering for now; would require a migration and schema change for what is essentially a query-level concern.
  - A TypeScript function that post-filters legs — rejected because the SQL subquery approach is more efficient and keeps the join logic in one place.
- **Source:** `plans/us-12-refactor/research.md`

### ADR: Shared Roll Domain Helpers

- **Decision:** Create `src/renderer/src/lib/rolls.ts` with `getRollTypeLabel()`, `computeNetCreditDebit()`, and `rollCreditDebitColors()` functions.
- **Why:** `getRollTypeLabel` is copy-pasted identically in `RollCspForm.tsx` and `RollCspSuccess.tsx`. Net credit/debit color selection (`isCredit ? green : gold`) is duplicated with slight variations. These are pure functions with no component dependencies — ideal for extraction.
- **Alternatives considered:**
  - Putting helpers in `src/renderer/src/lib/format.ts` — rejected because roll-specific logic is a separate concern from generic formatting.
  - A shared component for net credit display — rejected because the Form and Success screens use different visual treatments (inline preview vs. hero card), so extracting the _data_ is the right level of abstraction.
- **Source:** `plans/us-12-refactor/research.md`

### ADR: RHF + Zod Migration for RollCspSheet

- **Decision:** Replace the 10 `useState` calls and imperative `validate()` function in `RollCspSheet.tsx` with `useForm` + `zodResolver`, following the same pattern used in `CloseCspForm.tsx`.
- **Why:** Every other form in the app uses RHF+Zod. The current hand-managed state has NaN edge cases (e.g., clearing a numeric field) and duplicates validation logic that the server-side `RollCspPayloadSchema` already defines. The Zod schema can also validate date ordering (new expiration > current expiration) using `.refine()`, matching the `CloseCspForm` pattern.
- **Alternatives considered:**
  - Keeping hand-managed state but adding Zod validation only — rejected because it doesn't reduce the useState boilerplate and loses RHF's error-clearing-on-change behavior.
  - Using the server-side `RollCspPayloadSchema` directly — rejected because the renderer needs string-based fields (form inputs are strings) while the server schema expects numbers. A renderer-side Zod schema with string inputs + parse-on-submit is the established pattern (see `CloseCspForm`).
- **Source:** `plans/us-12-refactor/research.md`

## Contracts

### activeLegSubquery

- **Type:** other (SQL subquery helper)
- **Shape:**

```typescript
// src/main/services/active-leg-sql.ts
export function activeLegSubquery(): string
// Returns the phase-aware SQL subquery for the current open leg:
//   CSP_OPEN phase → CSP_OPEN or ROLL_TO legs
//   CC_OPEN phase  → CC_OPEN  or ROLL_TO legs
//   Other phases   → no match (returns null via LEFT JOIN)
```

SQL subquery body:

```sql
SELECT id FROM legs WHERE position_id = p.id AND ((p.phase = 'CSP_OPEN' AND leg_role IN ('CSP_OPEN', 'ROLL_TO')) OR (p.phase = 'CC_OPEN' AND leg_role IN ('CC_OPEN', 'ROLL_TO'))) ORDER BY fill_date DESC, created_at DESC LIMIT 1
```

- **Source:** `plans/us-12-refactor/plan.md`, `plans/us-12-refactor/green-phase-results-area1.md` (note: this plan has no `contracts/` dir)
- **Implementation:** `src/main/services/active-leg-sql.ts`

### getRollTypeLabel

- **Type:** other (renderer pure helper)
- **Shape:**

```typescript
export type RollType = 'Roll Down & Out' | 'Roll Up & Out' | 'Roll Out'

export function getRollTypeLabel(currentStrike: string, newStrike: string): RollType
```

- **Source:** `plans/us-12-refactor/data-model.md`, `plans/us-12-refactor/red-phase-results.md`
- **Implementation:** `src/renderer/src/lib/rolls.ts`

### computeNetCreditDebit

- **Type:** other (renderer pure helper)
- **Shape:**

```typescript
export type NetCreditDebit = {
  net: number // positive = credit, negative = debit
  isCredit: boolean
  perContract: number // absolute value
  total: number // absolute value × contracts × 100
}

export function computeNetCreditDebit(
  costToClose: number,
  newPremium: number,
  contracts: number
): NetCreditDebit
```

- **Source:** `plans/us-12-refactor/data-model.md`, `plans/us-12-refactor/red-phase-results.md`
- **Implementation:** `src/renderer/src/lib/rolls.ts`

### rollCreditDebitColors

- **Type:** other (renderer pure helper)
- **Shape:**

```typescript
export type RollCreditDebitColors = {
  color: string // var(--wb-green) or var(--wb-gold)
  bg: string
  border: string
}

export function rollCreditDebitColors(isCredit: boolean): RollCreditDebitColors
```

- **Source:** `plans/us-12-refactor/data-model.md`, `plans/us-12-refactor/red-phase-results.md`
- **Implementation:** `src/renderer/src/lib/rolls.ts`

### RollCspFormSchema (makeRollCspSchema factory)

- **Type:** Zod schema
- **Shape:**

```typescript
// Zod schema for form validation (string inputs, parsed on submit)
const RollCspFormSchema = z.object({
  cost_to_close: z
    .string()
    .refine((v) => parseFloat(v) > 0, 'Cost to close must be greater than zero'),
  new_premium: z.string().refine((v) => parseFloat(v) > 0, 'New premium must be greater than zero'),
  new_expiration: z.string().min(1, 'New expiration is required'),
  new_strike: z.string().refine((v) => parseFloat(v) > 0, 'Strike must be greater than zero'),
  fill_date: z.string().optional()
})
```

The `new_expiration > current_expiration` constraint requires a dynamic schema factory (like `CloseCspForm`'s `makeCloseCspSchema`).

Additional refine documented in plan: `new_expiration: z.string().min(1).refine(v => v > currentExpiration, 'New expiration must be after the current expiration')`.

- **Source:** `plans/us-12-refactor/data-model.md`, `plans/us-12-refactor/plan.md`
- **Implementation:** `src/renderer/src/components/RollCspSheet.tsx`

## Schema Changes

No new entities, migrations, or schema changes. This refactor operates on existing data structures.

**Source:** `plans/us-12-refactor/data-model.md`

### Active Leg Resolution Logic (extracted, not a schema change)

- **Change:** logic centralization (no DB change)
- **Columns / fields:** none — uses existing `legs.position_id`, `legs.leg_role`, `legs.fill_date`, `legs.created_at`, `positions.phase`
- **Source:** `plans/us-12-refactor/data-model.md`

The "active leg" for a position is the most recent leg matching these phase-to-role rules:

| Position Phase   | Eligible Leg Roles           |
| ---------------- | ---------------------------- |
| `CSP_OPEN`       | `CSP_OPEN`, `ROLL_TO`        |
| `CC_OPEN`        | `CC_OPEN`, `ROLL_TO`         |
| All other phases | No active leg (returns null) |

Tie-breaking: `ORDER BY fill_date DESC, created_at DESC LIMIT 1`

- **Migration file:** None

## Acceptance Criteria

From `plans/us-12-refactor/plan.md`:

- Rolled CSP positions show correct strike, expiration, and DTE in the position list (bug fix)
- Active leg resolution logic is centralized in one place
- Roll type label logic exists in exactly one place
- Net credit/debit computation and color selection are shared across form and success views
- RollCspSheet uses react-hook-form + Zod, consistent with `CloseCspForm` and project standards
- All existing validation error messages are preserved
- Net credit/debit preview updates reactively as fields change
- Form submission parses string values to numbers for the IPC payload

From `plans/us-12-refactor/quickstart.md` (passing criteria):

- All existing tests continue to pass (no regressions)
- New tests pass for:
  - Active leg resolution returns `ROLL_TO` leg for rolled positions in list view
  - `getRollTypeLabel` returns correct labels for up/down/out rolls
  - `computeNetCreditDebit` returns correct credit/debit calculations
  - RollCspSheet form validation via Zod schema matches existing behavior
- `pnpm lint` and `pnpm typecheck` clean

## Decisions & Tradeoffs

- **Subquery is a pure string with no parameters:** "Simple pure function returning a string — no parameters needed since the subquery references `p.id` and `p.phase` from the outer query context" (`green-phase-results-area1.md`).
- **Helper placement:** "Placed in `src/main/services/` (not `core/`) since it's SQL, not pure domain logic" (`green-phase-results-area1.md`).
- **Renderer-side Zod with string fields:** "A renderer-side Zod schema with string inputs + parse-on-submit is the established pattern (see `CloseCspForm`)" (`research.md`).
- **`getRollTypeLabel` accepts strings:** "takes string arguments (matching form field values) and parses them as floats internally" (`red-phase-results.md`).
- **`net` sign convention:** "`net` for a debit is negative (newPremium - costToClose when cost > premium)"; "`total` is always positive (absolute value of net times contracts times 100)" (`red-phase-results.md`).
- **Color tokens:** "Color values use CSS custom properties (vars) containing 'green' or 'gold' in the variable name" (`red-phase-results.md`).
- **`RollCspForm` stays presentational:** "Keep it purely presentational — it must not own the form instance" (`tasks.md`).
- **`heroBg` retained as gradient by design:** "`heroBg` in `RollCspSuccess.tsx` is a local gradient (`linear-gradient(135deg, ...)`) rather than using `rollCreditDebitColors.bg` (which returns a flat dim color). The success hero card intentionally uses a richer gradient treatment. This is by design, not debt." (`refactor-phase-results.md`).
- **Explicit return type required:** "Project ESLint rule `@typescript-eslint/explicit-function-return-type` requires explicit return types on all functions" — manual fix after code-simplifier removed the annotation from `makeRollCspSchema` (`refactor-phase-results.md`).

## Source Code References

Files introduced or modified by this plan (verified via Glob):

- `src/main/services/active-leg-sql.ts` (new)
- `src/main/services/list-positions.ts` (modified)
- `src/main/services/get-position.ts` (modified)
- `src/main/services/list-positions.test.ts` (modified — added two failing tests)
- `src/main/services/get-position.test.ts` (regression coverage)
- `src/renderer/src/lib/rolls.ts` (new)
- `src/renderer/src/lib/rolls.test.ts` (new)
- `src/renderer/src/components/RollCspForm.tsx` (modified)
- `src/renderer/src/components/RollCspSuccess.tsx` (modified)
- `src/renderer/src/components/RollCspSheet.tsx` (modified)
- `src/renderer/src/components/RollCspSheet.test.tsx` (referenced regression suite)

## Open Questions

From `plans/us-12-refactor/refactor-phase-results.md` (remaining tech debt):

- `SummaryRow` component is duplicated between `RollCspForm.tsx` and `RollCspSuccess.tsx`. The implementations are identical. Extracting to a shared component was considered but deferred — it would require a new file in `ui/` and the duplication is small (12 lines). Track as future cleanup if a third consumer appears.

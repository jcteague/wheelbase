# Refactor Phase Results: US-50 Layer 1 (Foundation)

Scope: the three Layer 1 areas — DTE helper (Area 1), `alerts` migration (Area 2),
and the pure alert engine (Area 4).

## Automated Simplification

- code-simplifier agent run: **not run** — scope is three small, focused files;
  manual refactoring was sufficient and kept tighter control over the TDD loop.
- Files reviewed: `src/main/core/dte.ts`, `src/main/core/alerts.ts`,
  `migrations/009_create_alerts.sql`, `src/main/services/list-positions.ts`.

## Manual Refactorings Performed

### 1. Open/Closed — rule registry in the alert engine

**File**: `src/main/core/alerts.ts`
**Before**: `evaluatePosition` was a chain of `if (dte === null) … if (dte <= 5) …
if (dte <= managementWindowDte) …` early returns. Adding a future rule
(PROFIT_TARGET, STRIKE_PROXIMITY, etc.) would mean editing the control flow and
re-reasoning about precedence.
**After**: rules are an ordered `RULES: RuleDefinition[]` list, each with `code`,
`urgency`, `requiresDte`, a pure `test` predicate, and a named `summary` builder.
`evaluatePosition` is now a generic two-filter pass: skipped rules (missing data)
and matched rules. Future rules append to the array without touching the loop.
**Reason**: open/closed — later stories (US-54/55/56/62) extend the engine without
modifying its evaluation logic. EXPIRATION_IMMINENT precedence over
MANAGEMENT_WINDOW is now expressed by mutually-exclusive DTE ranges
(`<= 5` vs `> 5 && <= mw`) rather than ordering-dependent early returns.

### 2. Extract Function — named summary builders

**File**: `src/main/core/alerts.ts`
**Before**: summary strings were inline template literals inside the branches.
**After**: `expirationImminentSummary` and `managementWindowSummary` are named pure
helpers; `formatStrike` remains the shared strike formatter.
**Reason**: each rule's human-readable text is now independently testable and
self-documenting.

### 3. Extract Constant — magic values

**File**: `src/main/core/alerts.ts`
**Before**: `5` and `'missing_dte'` and `'Review position'` were inline literals.
**After**: `EXPIRATION_IMMINENT_MAX_DTE`, `MISSING_DTE`, and `QUICK_ACTION_REVIEW`
named constants; `DEFAULT_MANAGEMENT_WINDOW_DTE` already exported.
**Reason**: removes magic numbers/strings and documents the management-window
lower bound as "one past the imminent threshold".

### 4. Remove Duplication — shared DTE helper

**File**: `src/main/services/list-positions.ts` (+ new `src/main/core/dte.ts`)
**Before**: `list-positions.ts` carried a private `computeDte` using manual
`Date.UTC` math.
**After**: the single pure `computeDte` lives in `src/main/core/dte.ts` (date-fns
`differenceInCalendarDays`), imported by `list-positions.ts`.
**Reason**: one timezone-stable DTE calculation shared by the list query and the
alert engine. Verified no other main-process file re-implements DTE (only the
renderer keeps its own `lib/format.ts` copy, which cannot import from
`src/main/core/`).

### 5. Migration style alignment

**File**: `migrations/009_create_alerts.sql`
**Before/After**: authored to match the column-aligned `CREATE TABLE` + `CREATE
INDEX` formatting of `007_create_ivr_snapshot.sql`, with comments above each index
explaining the partial-unique and read-path indexes.
**Reason**: consistency with existing migration conventions.

## Test Execution Results

Affected files (all green):

```
✓ src/main/core/dte.test.ts (5 tests)
✓ src/main/core/alerts.test.ts (11 tests)
✓ src/main/services/alerts.test.ts (3 tests)
✓ src/main/services/list-positions.test.ts (17 tests)
✓ src/main/db/migrate.test.ts (12 tests)

48 passed (48)
```

## Quality Checks

- ✅ `pnpm test` (affected files) passed
- ✅ `pnpm lint` passed (0 errors, 0 warnings)
- ✅ `pnpm typecheck` passed (node + web)

## Files touched (production)

- `src/main/core/dte.ts` (new)
- `src/main/core/alerts.ts` (new)
- `migrations/009_create_alerts.sql` (new)
- `src/main/services/list-positions.ts` (adopt shared `computeDte`)

## E2E coverage added or modified

None (Layer 1 is pure-unit / migration scope; AC e2e tests are Layer 5).

## Remaining Tech Debt

- [ ] **Pre-existing, out of scope:** `src/main/ipc/market-data.test.ts` has 3
  failing tests (`market-data:option-snapshots …`) that also fail on the baseline
  with these changes stashed. Not introduced by US-50 Layer 1.

## Notes

`migrate.test.ts`'s applied-migrations inventory was updated to include
`009_create_alerts.sql` — required because the migration list is an exact-match
assertion, not a behavioural change to the feature.

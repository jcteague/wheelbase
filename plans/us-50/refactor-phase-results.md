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

---

# Refactor Phase Results: US-50 Layer 2 (Area 3 — persistence service)

Scope: `src/main/services/alerts.ts` (new) + the `AlertRecord` /
`EvaluateAlertsResult` / `AlertUrgency` / `AlertStatus` additions in
`src/main/schemas.ts`.

## Automated Simplification

- code-simplifier agent run: **not run** — single small, focused service file;
  manual review kept the TDD loop tight.

## Manual Refactorings Performed

The Green implementation already landed in the target shape, so this pass was
mostly verification of the two guidance points:

### 1. Centralized alert-identity key builder — confirmed

**File**: `src/main/services/alerts.ts`
**Decision**: `alertKey(positionId, ruleCode)` is exported from the persistence
service (not duplicated inline). The persistence service owns the "one open alert
per (position, rule)" identity concept, so it is the correct home; the Area 5
orchestrator will import `alertKey` rather than re-deriving `${positionId}::${ruleCode}`.
Verified no other inline key building exists in the codebase yet.

### 2. Column mapping — left as a local mapper (no over-abstraction)

**File**: `src/main/services/alerts.ts`
**Decision**: `mapAlertRow` (snake_case → camelCase) matches the existing
per-service mapping convention (`list-positions.ts`, `get-position.ts` map their
own rows inline). No shared snake→camel mapper utility exists, and building one
generically is the tracked LegData snake_case tech debt — intentionally **not**
expanded here.

### 3. Type reuse for alert unions

**File**: `src/main/schemas.ts`
**Before/After**: `AlertUrgency` / `AlertStatus` are imported from
`./core/alerts` and re-exported from `schemas.ts` rather than re-declared, so the
union definitions live in exactly one place (the pure engine) while remaining
available from the schemas module the services consume.

## Test Execution Results

```
✓ src/main/services/alerts.test.ts (7 tests)
✓ src/main/schemas.test.ts (37 tests)

44 passed (44)
```

## Quality Checks

- ✅ `pnpm test` (affected files) passed
- ✅ `pnpm lint` passed (0 errors, 0 warnings)
- ✅ `pnpm typecheck` passed (node + web)

## Files touched (production)

- `src/main/services/alerts.ts` (new)
- `src/main/schemas.ts` (alert record + result types)

## E2E coverage added or modified

None (AC e2e tests are Layer 5).

## Remaining Tech Debt

- [ ] The duplicated raw-INSERT pattern across services (now including
      `services/alerts.ts`) is captured as a standalone story —
      `docs/epics/07-stories/US-63-centralize-insert-statements.md`.

---

# Refactor Phase Results: US-50 Layer 4 (Area 6 — scheduler registration)

Scope: registering the `alert-evaluation` job in `src/main/index.ts`.

## Automated Simplification

- code-simplifier agent run: **not run** — the change is a single ~13-line
  `scheduler.register` block; nothing to simplify.

## Manual Refactorings Performed

None. The `alert-evaluation` registration block was authored to match the
adjacent `detect-assignments` and `ivr-collect` blocks — same comment style,
same inline `cadence` shape, same `handler: async () => ...` form — so it already
meets the Area 6 refactor goal ("keep registration adjacent to the other
scheduler.register blocks; match comment style").

### Considered and rejected

- **Extract the shared interval cadence (`marketOpenMs: 60_000, extendedHoursMs:
300_000, marketClosedMs: null`) into a constant.** `detect-assignments` inlines
  the identical cadence. Extracting it would touch out-of-scope code and diverge
  from the file's established convention. Left inlined for consistency.

## Test Execution Results

```
Test Files  131 passed (131)
     Tests  1423 passed (1423)
```

## Quality Checks

- ✅ `pnpm test` passed (full suite, no regressions)
- ✅ `pnpm lint` passed
- ✅ `pnpm typecheck` passed (node + web)

## Files touched (production)

- `src/main/index.ts` — register the `alert-evaluation` interval job before
  `scheduler.start()`.

## E2E coverage added or modified

None. Registration is covered by two new `src/main/index.test.ts` cases; job
behavior is covered by `evaluate-alerts.test.ts` (Layer 3) and the Layer 5 AC
tests.

## Remaining Tech Debt

- [ ] None for this layer. (The Layer 1 note about failing
      `market-data.test.ts` no longer reproduces — the full suite is green.)

---

# Refactor Phase Results: US-50 Layer 5 (Area 7 — AC-driven tests)

Scope: `src/main/services/evaluate-alerts.e2e.test.ts` (new) — the five AC
acceptance tests.

## Automated Simplification

- code-simplifier agent run: **not run** — single, focused test file; manual
  review kept the TDD loop tight.

## Manual Refactorings Performed

### 1. Single `seedActiveLegAtDte` helper across all AC tests — done

**File**: `src/main/services/evaluate-alerts.e2e.test.ts`
**Before/After**: every AC test seeds positions through one
`seedActiveLegAtDte(db, { id, ticker, phase, strike, dte, now? })` helper that
maps a `dte` (or `null`, for the missing-data path) to a concrete leg expiration
relative to the injected `NOW`. No per-test raw INSERT duplication remains.
**Reason**: the Area 7 refactor goal — remove seeding duplication across the AC
tests behind one DTE-relative helper.

## Considered and rejected

- **Extract a shared cross-file test-helper module** (e.g.
  `alert-test-helpers.ts`) consumed by both `evaluate-alerts.e2e.test.ts` and
  `evaluate-alerts.test.ts`. Rejected: the codebase has **no** shared
  service-test-helper convention — every service test (including the sibling
  `evaluate-alerts.test.ts`) inlines its own seed helpers, and the two files use
  intentionally different signatures (`seedEvaluablePosition(expiration)` vs
  `seedActiveLegAtDte(dte)`). Introducing the first such module under a
  layer-scoped AC-test refactor is scope creep (CLAUDE.md "match existing style",
  "nothing speculative"). Left as optional tech debt below.

## Test Execution Results

```
Test Files  132 passed (132)
     Tests  1428 passed (1428)
```

(`evaluate-alerts.e2e.test.ts` contributes 5 AC tests, all green. As an
AC-verification layer over already-shipped Layers 1–4, these tests passed on
first run — no production code was required.)

## Quality Checks

- ✅ `pnpm test` passed (full suite, no regressions)
- ✅ `pnpm lint` passed
- ✅ `pnpm typecheck` passed (node + web)

## Files touched (production)

None. Layer 5 is test-only; the five ACs are verified against the existing
Layers 1–4 implementation.

## E2E coverage added or modified

- `src/main/services/evaluate-alerts.e2e.test.ts` — 5 AC scenarios (one per
  US-50 acceptance criterion).

## Remaining Tech Debt

- [ ] **Optional:** if a third alert-related service test appears, promote the
      duplicated `seedPosition` / `seedActiveLegAtDte` / `readAlertRows` helpers
      (shared between `evaluate-alerts.test.ts` and `evaluate-alerts.e2e.test.ts`)
      into a shared module. Deferred to avoid creating a new test-helper pattern
      for only two files.

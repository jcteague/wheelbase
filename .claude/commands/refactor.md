---
description: 'Refactor code to improve quality while keeping tests green (TDD refactor phase)'
---

# Refactor Phase: Improve Code Quality

## User Input

```
$ARGUMENTS
```

## Beads Status

If a beads task ID was provided in the arguments (e.g. `wheelbase-ink.N.M`), mark it in progress before starting:
```bash
bd update <id> --status=in_progress
```
If no task ID was given, proceed without beads tracking — `/implement-plan` manages status when driving this skill.

At the end, after tests, lint, and typecheck all pass, close the task:
```bash
bd close <id>
```

---

## Outline

You are implementing the **REFACTOR phase** of Test-Driven Development for Wheelbase (Option Wheel Manager). Your goal is to improve code quality, eliminate duplication, and enhance maintainability while keeping all tests passing.

### Phase 1: Setup and Prerequisites

1. **Locate Feature Artifacts**
   - Find the feature plan under `plans/<feature-dir>/`
   - If `plans/<feature-dir>/green-phase-results.md` exists, read it and use "Known Limitations / Tech Debt" as the starting refactoring candidates
   - If it doesn't exist, identify the implementation files directly from the plan or from context (e.g. files the user just mentioned), then proceed

2. **Verify Tests Pass Before Starting**
   - Run full test suite: `pnpm test`
   - **CRITICAL**: All tests MUST be green before any refactoring begins
   - If any tests fail, return to the green phase and fix them first
   - Establish the passing baseline — you will return to it after every change

3. **Review Implementation**
   - Read all files listed in `green-phase-results.md`
   - Note code smells, duplication, poor names, `Any` types, magic values

### Phase 2: Identify Refactoring Opportunities

4. **Code Quality Analysis**
   - Look for common code smells:
     - **Duplication**: Repeated logic blocks
     - **Long functions**: Functions > 20 lines
     - **Large files**: Files > 300 lines
     - **Deep nesting**: Nesting > 3 levels
     - **Magic numbers/strings**: Hardcoded monetary values, phase names, status strings
     - **Poor naming**: Unclear variable or function names
     - **`Any` types**: Replace with specific Python or TypeScript types

5. **Architecture Review**
   - Verify adherence to project principles:
     - **Pure engines**: `lifecycle.ts`, `costbasis.ts`, `alerts.ts` contain zero db/broker imports
     - **Alpaca isolation**: Nothing outside `src/main/integrations/alpaca.ts` imports the Alpaca SDK
     - **Roll integrity**: No leg is mutated in place; rolls are always stored as linked pairs
     - **Decimal discipline**: All monetary values use `Decimal`/`decimal.js`, not `float`/`number`

6. **Single Responsibility Check**
   - Each file should have exactly one reason to change
   - `core/` — pure logic only; if it touches a DB handle or IPC event, it's in the wrong place
   - `services/` — DB + core composition; if it contains IPC/routing logic, extract it
   - `ipc/` handlers — if they contain more than ~10 lines of logic, extract to a service
   - Components — if they contain fetch logic, move to a hook
   - **File size gate**: any file over ~200 lines must be split before refactor is considered complete

7. **Open/Closed Check**
   - Would adding a new leg role, phase, or alert type require editing a core engine file?
   - If yes, refactor the engine to be extensible without modification (e.g., dispatch table, strategy pattern with plain functions)

8. **Dead Code Removal**
   - After any refactoring, scan for functions, types, or modules that are no longer referenced
   - Delete them — do not leave them with a comment explaining they were removed
   - No backwards-compatibility wrappers unless explicitly required
   - `make typecheck` / `tsc --noEmit` will surface unused exports; treat them as errors

6. **Prioritise Refactorings**
   - High priority: duplication, type safety (`Any`/`any`), architectural violations
   - Medium priority: long functions, poor naming, deep nesting
   - Low priority: minor style, comment cleanup

### Phase 3: Automated Simplification Pass

7. **Delegate to the `code-simplifier` Agent**
   - Collect the list of files modified during the green phase (from `green-phase-results.md`)
   - Delegate to the `code-simplifier` agent using the Task tool:
     - `subagent_type`: `"code-simplifier:code-simplifier"`
     - Prompt: provide the list of modified files and instruct it to apply clarity, consistency, and maintainability improvements while preserving all functionality and keeping all tests green
   - After the agent completes, run `pnpm test` to confirm nothing regressed
   - If tests fail after the agent's changes, revert those changes and proceed with manual refactoring only

### Phase 4: Manual Refactoring

8. **One Change at a Time (for anything code-simplifier did not address)**
   - **CRITICAL**: Make ONE small refactoring at a time
   - Run `pnpm test` after EACH change
   - If tests fail: REVERT the change immediately — do not accumulate failures
   - Only proceed to the next refactoring after tests are green

9. **Common Refactoring Patterns**

   **Extract Function**
   - Break long functions into smaller, focused functions
   - Each function should do one thing well
   - Use descriptive names that explain purpose

   **Extract Constant**
   - Replace magic strings/numbers with named constants
   - Group related constants (e.g., `PhaseTransition`, `WheelPhase` enum values)
   - TypeScript: `const` objects or string literal union types or enums

   **Rename**
   - Use domain language from CLAUDE.md: `wheel`, `leg`, `roll`, `cost_basis`, `phase`
   - Be consistent across layers (Python model name = TypeScript type name = API field name)

   **Simplify Conditionals**
   - Extract complex conditions into named predicate functions
   - Use early returns / guard clauses to reduce nesting
   - Replace repeated `if phase == X` chains with dispatch tables or match statements

   **Remove Duplication**
   - Extract shared logic into `src/main/core/` utilities (if pure) or `src/main/services/` helpers
   - Renderer: extract repeated JSX patterns into sub-components under `src/renderer/src/components/`

   **Improve Types**
   - TypeScript: replace `any` with specific types; use union/literal types for constrained values; prefer enums or const objects for phases and statuses

10. **Wheelbase-Specific Refactorings**

    **Core Engine Layer**
    - Keep engine functions thin; extract business sub-rules to named helper functions
    - Consolidate status/phase derivation into single, independently testable functions
    - Ensure `costbasis.ts` has one clear entry point with a documented formula

    **DB / Service Layer**
    - Ensure monetary TEXT columns convert cleanly to `Decimal` via `decimal.js` with no implicit coercion
    - Confirm `roll_from_id` / `roll_to_id` FK constraints are symmetric and enforced in migrations
    - Keep service functions focused — no business logic beyond DB access and core engine calls

    **IPC Layer**
    - Keep IPC handlers thin: validate input with Zod, call a service, return result
    - Extract repeated response-shaping logic into shared typed result types
    - Ensure all error cases return consistent `{ ok: false, errors: string[] }` shapes

    **Renderer Layer**
    - Keep components presentational; push data logic into hooks
    - Ensure `useEffect` cleanups are explicit (cancel queries, remove IPC listeners)
    - Replace inline styles or magic pixel values with Tailwind classes or shadcn/ui tokens

    **Test Utilities**
    - Extract shared test data factories (e.g., `makeLeg()`, `makeWheel()`) to a shared test helper file
    - Reduce setup duplication with shared `beforeEach` helpers or Vitest fixtures
    - Ensure all `vi.mock()` mocks are reset between tests with `vi.clearAllMocks()` or `vi.restoreAllMocks()`

### Phase 5: Continuous Verification

11. **Run Quality Checks After Each Refactoring**
    - `pnpm test` — must stay green throughout
    - `pnpm lint` — fix any new lint errors before continuing
    - `pnpm typecheck` — fix any new type errors before continuing

### Phase 6: Documentation and Handoff

12. **Document Results**
    - Create `plans/<feature-dir>/refactor-phase-results.md` with:
      - Each refactoring performed (before/after summary)
      - Final test execution output (all passing)
      - Quality check results
      - Any remaining tech debt

13. **Feature Complete**
    - Run final quality check: `pnpm test && pnpm lint && pnpm typecheck`
    - Feature is complete and ready for review

## Guidelines

### Refactoring Principles

1. **Keep Tests Green**
   - Tests must pass before starting
   - Tests must pass after each individual change
   - If tests fail after a change, revert immediately — do not debug forward
   - Never break existing functionality

2. **Small, Safe Steps**
   - One refactoring at a time
   - Run tests after every change
   - Prefer many small steps over one large restructuring

3. **Improve Without Changing Behaviour**
   - Refactoring changes HOW code does something, never WHAT it does
   - Don't add features during refactoring
   - Don't fix bugs during refactoring — log them and do separately

4. **Follow Project Conventions**
   - TypeScript: ESLint-clean, `tsc --strict`-clean, no `any`, `decimal.js` for money

## Error Conditions

- **ERROR**: Tests fail before refactoring begins → fix in green phase first
- **ERROR**: Tests fail after the `code-simplifier` agent → revert agent changes, proceed with manual refactoring only
- **ERROR**: Tests fail after a manual refactoring → REVERT immediately, do not continue (`pnpm test` to confirm)
- **ERROR**: Refactoring changes observable behaviour → that is not a refactoring; revert and reconsider
- **ERROR**: Unsure whether a change is safe → skip it, document as remaining tech debt

## Success Criteria

- ✅ All tests remain passing throughout every step of refactoring
- ✅ Code quality improved: reduced duplication, better names, stronger types, no magic values
- ✅ Architecture rules verified: pure engines, isolated Alpaca, linked roll pairs, Decimal money
- ✅ `pnpm lint` passes with no errors
- ✅ `pnpm typecheck` passes with no errors
- ✅ Results documented in `plans/<feature-dir>/refactor-phase-results.md`
- ✅ Feature complete and ready for review

## Output

After completing the refactor phase, create `plans/<feature-dir>/refactor-phase-results.md`:

````markdown
# Refactor Phase Results: [Feature Name]

## Automated Simplification

- code-simplifier agent run: [passed / failed — reverted]
- Files processed: [list]

## Manual Refactorings Performed

### 1. Extract Function — `derive_cost_basis()`

**File**: `src/main/core/costbasis.ts`
**Before**: Inline arithmetic repeated across three call sites
**After**: Single pure function `deriveCostBasis(legs: Leg[]): Decimal`
**Reason**: Eliminated duplication; formula is now tested and documented in one place

### 2. Extract Constant — `WheelPhase` enum

**File**: `src/main/core/lifecycle.ts`
**Before**: Magic strings `"CSP_OPEN"`, `"HOLDING_SHARES"` scattered throughout
**After**: `export enum WheelPhase` with named members
**Reason**: Compile-time safety; TypeScript catches invalid phase comparisons

[Continue for all refactorings...]

## Test Execution Results

```bash
pnpm test

PASS src/main/core/costbasis.test.ts (4 tests)
PASS src/main/core/lifecycle.test.ts (6 tests)
PASS src/main/ipc/positions.test.ts (3 tests)

13 passed, 0 failed
```

## Quality Checks

- ✅ `pnpm test` passed (no regressions)
- ✅ `pnpm lint` passed
- ✅ `pnpm typecheck` passed

## Remaining Tech Debt

- [ ] [Description of any known issues deferred for later]

## Notes

All refactorings performed incrementally with tests passing after each change.
````

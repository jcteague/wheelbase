---
description: 'Refactor code to improve quality while keeping tests green (TDD refactor phase)'
---

# Refactor Phase: Improve Code Quality

## User Input

```
$ARGUMENTS
```

## Outline

You are implementing the **REFACTOR phase** of Test-Driven Development for Wheelbase (Option Wheel Manager). Your goal is to improve code quality, eliminate duplication, and enhance maintainability while keeping all tests passing.

### Phase 1: Setup and Prerequisites

1. **Locate Feature Artifacts**
   - Find the feature plan under `plans/<feature-dir>/`
   - Required: `plans/<feature-dir>/green-phase-results.md` — if missing, run `/green` first
   - Review "Known Limitations / Tech Debt" in `green-phase-results.md` for refactoring candidates

2. **Verify Tests Pass Before Starting**
   - Run full test suite: `make test`
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
     - **Pure engines**: `lifecycle.py`, `costbasis.py`, `alerts.py` contain zero db/broker imports
     - **Alpaca isolation**: Nothing outside `integrations/alpaca.py` imports `alpaca-py`
     - **Roll integrity**: No leg is mutated in place; rolls are always stored as linked pairs
     - **Decimal discipline**: All monetary values use `Decimal`, not `float`

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
   - After the agent completes, run `make test` to confirm nothing regressed
   - If tests fail after the agent's changes, revert those changes and proceed with manual refactoring only

### Phase 4: Manual Refactoring

8. **One Change at a Time (for anything code-simplifier did not address)**
   - **CRITICAL**: Make ONE small refactoring at a time
   - Run `make test` after EACH change
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
   - Python: module-level `SCREAMING_SNAKE_CASE`; TypeScript: `const` objects or enums

   **Rename**
   - Use domain language from CLAUDE.md: `wheel`, `leg`, `roll`, `cost_basis`, `phase`
   - Be consistent across layers (Python model name = TypeScript type name = API field name)

   **Simplify Conditionals**
   - Extract complex conditions into named predicate functions
   - Use early returns / guard clauses to reduce nesting
   - Replace repeated `if phase == X` chains with dispatch tables or match statements

   **Remove Duplication**
   - Extract shared logic into `backend/app/core/` utilities (if pure) or `backend/app/db/` helpers
   - Frontend: extract repeated JSX patterns into sub-components under `frontend/src/components/`

   **Improve Types**
   - Python: replace `Any` with specific types; use `TypeAlias` for complex types; prefer `Enum` for phases and statuses
   - TypeScript: replace `any` with specific types; use union/literal types for constrained values

10. **Wheelbase-Specific Refactorings**

    **Core Engine Layer**
    - Keep engine functions thin; extract business sub-rules to named helper functions
    - Consolidate status/phase derivation into single, independently testable functions
    - Ensure `costbasis.py` has one clear entry point with a documented formula

    **Model Layer**
    - Ensure monetary `Numeric` columns map cleanly to `Decimal` with no implicit conversion
    - Confirm `roll_from_id` / `roll_to_id` FK constraints are symmetric and enforced
    - Keep model definitions focused — no business logic in ORM models

    **API Layer**
    - Keep route handlers thin: validate input, call a service/engine, return a response model
    - Extract repeated response-shaping logic into shared Pydantic response models
    - Ensure all error cases return consistent `{"detail": "..."}` shapes

    **Frontend Layer**
    - Keep components presentational; push data logic into hooks
    - Ensure `useEffect` cleanups are explicit (cancel queries, close connections)
    - Replace inline styles or magic pixel values with named tokens

    **Test Utilities**
    - Extract shared test data factories (e.g., `make_leg()`, `make_wheel()`) to `backend/tests/factories.py`
    - Reduce fixture duplication with shared `conftest.py` fixtures
    - Ensure all mocks are reset between tests

### Phase 5: Continuous Verification

11. **Run Quality Checks After Each Refactoring**
    - `make test` — must stay green throughout
    - `make lint` — fix any new lint errors before continuing
    - `make typecheck` — fix any new type errors before continuing

### Phase 6: Documentation and Handoff

12. **Document Results**
    - Create `plans/<feature-dir>/refactor-phase-results.md` with:
      - Each refactoring performed (before/after summary)
      - Final test execution output (all passing)
      - Quality check results
      - Any remaining tech debt

13. **Feature Complete**
    - Run final quality check: `make test && make lint && make typecheck`
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
   - Python: `ruff`-clean, `mypy --strict`-clean, `Decimal` for money
   - TypeScript: ESLint-clean, `tsc --strict`-clean, no `any`

## Error Conditions

- **ERROR**: `green-phase-results.md` doesn't exist → run `/green` first
- **ERROR**: Tests fail before refactoring begins → fix in green phase first
- **ERROR**: Tests fail after the `code-simplifier` agent → revert agent changes, proceed with manual refactoring only
- **ERROR**: Tests fail after a manual refactoring → REVERT immediately, do not continue
- **ERROR**: Refactoring changes observable behaviour → that is not a refactoring; revert and reconsider
- **ERROR**: Unsure whether a change is safe → skip it, document as remaining tech debt

## Success Criteria

- ✅ All tests remain passing throughout every step of refactoring
- ✅ Code quality improved: reduced duplication, better names, stronger types, no magic values
- ✅ Architecture rules verified: pure engines, isolated Alpaca, linked roll pairs, Decimal money
- ✅ `make lint` passes with no errors
- ✅ `make typecheck` passes with no errors
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

**File**: `backend/app/core/costbasis.py`
**Before**: Inline arithmetic repeated across three call sites
**After**: Single pure function `derive_cost_basis(legs: list[Leg]) -> Decimal`
**Reason**: Eliminated duplication; formula is now tested and documented in one place

### 2. Extract Constant — `WheelPhase` enum

**File**: `backend/app/core/lifecycle.py`
**Before**: Magic strings `"CSP_OPEN"`, `"HOLDING_SHARES"` scattered throughout
**After**: `class WheelPhase(str, Enum)` with named members
**Reason**: Compile-time safety; mypy catches invalid phase comparisons

[Continue for all refactorings...]

## Test Execution Results

```bash
make test

PASSED backend/tests/core/test_costbasis.py (4 tests)
PASSED backend/tests/core/test_lifecycle.py (6 tests)
PASSED backend/tests/api/test_positions.py (3 tests)

13 passed, 0 failed
```

## Quality Checks

- ✅ `make test` passed (no regressions)
- ✅ `make lint` passed
- ✅ `make typecheck` passed

## Remaining Tech Debt

- [ ] [Description of any known issues deferred for later]

## Notes

All refactorings performed incrementally with tests passing after each change.
````

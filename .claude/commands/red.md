---
description: 'Write failing tests for TDD red phase (test-first development)'
---

# Red Phase: Write Failing Tests

## User Input

```
$ARGUMENTS
```

## Outline

You are implementing the **RED phase** of Test-Driven Development for Wheelbase (Option Wheel Manager). Your goal is to write comprehensive failing tests that define the expected behaviour before any implementation exists.

### Phase 1: Setup and Prerequisites

1. **Locate Feature Artifacts**
   - Find the relevant user story file(s) under `phase-1-stories/`
   - Find the feature plan under `plans/<feature-dir>/` — look for `plan.md` or `tasks.md`
   - Read and internalise all available artifacts before writing any tests

2. **Read and Understand Requirements**
   - Read the user story for acceptance criteria and edge cases
   - Read the plan for architecture decisions and planned file structure
   - Identify which layer(s) are affected:
     - **Backend core engines** — `backend/app/core/` (pure Python, no db/broker)
     - **Backend API** — `backend/app/api/routes/`
     - **Backend DB models** — `backend/app/models/`
     - **Frontend components** — `frontend/src/components/`
     - **Frontend hooks** — `frontend/src/hooks/`

3. **Identify Test Scope**
   - Classify tests by type:
     - **Unit tests** (pure engine logic) — `backend/tests/core/`
     - **API integration tests** — `backend/tests/api/`
     - **Model/DB tests** — `backend/tests/models/`
     - **Frontend component tests** — `frontend/src/**/*.test.tsx` (vitest + @testing-library/preact)
   - Note which existing test files need updates

### Phase 2: Write Failing Tests

4. **Backend Test Structure**
   - Place unit tests in `backend/tests/core/` for pure engine functions
   - Place API tests in `backend/tests/api/`
   - Follow naming: `test_{module}.py`
   - Use `pytest-asyncio` for any async tests (mode is `auto` — no decorator needed)
   - For API tests, use `httpx.AsyncClient` with the FastAPI `app` directly

5. **Write Test Cases**
   - Write tests that describe EXPECTED behaviour, not current behaviour
   - Cover:
     - Happy path
     - Edge cases (zero premiums, multiple rolls, negative cost basis)
     - Error / invalid input conditions
   - Follow project conventions:
     - **Python**: `pytest`, `pytest-asyncio`, `httpx`
     - **TypeScript**: vitest + `@testing-library/preact`
     - Descriptive function names: `test_cost_basis_decreases_after_csp_premium`

6. **Core Engine Test Guidelines** (most critical for Phase 1)
   - Import ONLY from `app.core.*` — never from `app.db` or `app.integrations`
   - Pass plain dataclasses or simple dicts; do not connect to the database
   - Verify exact numeric results for cost basis math (use `Decimal` or compare with `pytest.approx`)
   - Test every valid lifecycle phase transition and every illegal transition that must raise

7. **Add Test Documentation**
   - Link test to user story: `# [US-301] Calculate effective cost basis`
   - Document any fixtures or test data factories needed

### Phase 3: Verify Tests Fail for the Right Reason

8. **Run Tests**
   - Backend: `make test` (or `cd backend && uv run pytest -v`)
   - Frontend: `cd frontend && pnpm test --run` (once test infra is set up)

9. **Every Test Must Fail Because the Feature Doesn't Exist Yet**
   - **CRITICAL**: This is a hard gate. Do not proceed until every new test fails for the correct reason.
   - Acceptable failures:
     - `ImportError` / `ModuleNotFoundError` — implementation file doesn't exist yet
     - `AttributeError` — function or class not yet defined
     - `AssertionError` — implementation is stubbed and returns wrong result
   - **Unacceptable failures — fix immediately and re-run:**
     - Syntax errors in the test file itself
     - Broken imports caused by test setup mistakes
     - Fixture errors or missing test dependencies
     - Any failure caused by a bug in the test, not the missing feature
   - Keep fixing and re-running until the only failures are "feature not implemented yet"

10. **Document Test Results**
    - Create `plans/<feature-dir>/red-phase-results.md` with:
      - Feature directory path and linked artifacts (story file, plan file)
      - List of all test files created/modified (absolute paths)
      - Summary of what behaviours are tested
      - Key function/class signatures being tested (so green phase can create the right interfaces)
      - Any non-obvious test design decisions or assumptions
      - Pytest output showing failures
      - Explicit confirmation that every failure is due to missing implementation, not test bugs

### Phase 4: Review and Handoff

11. **Prepare for Green Phase**
    - Ensure all new test files are saved and importable
    - Document any assumptions made (e.g., data shapes, rounding rules)
    - Ready to hand off to implementation (green phase)

## Guidelines

### Testing Principles

1. **Test Behaviour, Not Implementation**
   - Focus on WHAT the code should do, not HOW it does it
   - Test public interfaces (functions, HTTP endpoints, rendered output)
   - Use black-box testing mindset

2. **Follow TDD Best Practices**
   - Write the simplest test that will fail
   - One assertion per test when possible
   - Arrange-Act-Assert pattern
   - Test names describe expected behaviour

3. **Test Independence**
   - Each test must run independently, in any order
   - No shared mutable state between tests
   - Use `pytest` fixtures for setup/teardown
   - Mock external dependencies (DB, Alpaca) at the boundary

### Wheelbase-Specific Testing Rules

4. **Core Engines are Pure — Test Them as Such**
   - `lifecycle.py`, `costbasis.py`, `alerts.py` accept plain dataclasses and return results
   - No database session, no Alpaca client — these tests run without a DB connection
   - If you find yourself needing DB in a core engine test, something is wrong with the design

5. **Cost Basis Math Precision**
   - Use `decimal.Decimal` for all monetary calculations in tests
   - Compare with `pytest.approx(rel=1e-9)` when Decimal isn't used
   - Test the formula explicitly: `assignment_strike − CSP_premiums − CC_premiums + roll_debits − roll_credits`

6. **Lifecycle State Machine**
   - Test every valid transition: `CSP_OPEN → HOLDING_SHARES`, `HOLDING_SHARES → CC_OPEN`, etc.
   - Test every illegal transition raises the appropriate exception
   - Test roll transitions: CSP roll, CC roll

7. **API Tests**
   - Use `httpx.AsyncClient(app=app, base_url="http://test")` as an async context manager
   - Never hit a real database in API tests — use dependency override for `get_session`
   - Verify response schema, not just status code

8. **Alpaca Isolation**
   - Mock `app.integrations.alpaca` at the module level
   - Never import `alpaca-py` in tests directly
   - Integration-layer tests go in `backend/tests/integrations/` (separate from core)

## Error Conditions

- **ERROR**: User story or plan doesn't exist → request these documents first
- **ERROR**: Tests pass immediately → implementation already exists (skip red phase or add more tests)
- **ERROR**: Any test fails for a reason other than missing implementation → fix the test, re-run; do not proceed until clean
- **ERROR**: Core engine test imports from `app.db` or `app.integrations` → architectural violation, fix the test design

## Success Criteria

- ✅ All new test files created and properly structured
- ✅ Tests comprehensively cover specified behaviours and edge cases
- ✅ Every new test fails — and every failure is because the feature is not yet implemented
- ✅ Zero test failures caused by bugs in the tests themselves
- ✅ Test names clearly describe expected behaviour
- ✅ Core engine tests have zero database or broker dependencies
- ✅ Test output documented in `plans/<feature-dir>/red-phase-results.md`
- ✅ Ready to proceed to GREEN phase

## Output

After completing the red phase, create `plans/<feature-dir>/red-phase-results.md`:

````markdown
# Red Phase Results: [Feature Name]

## Feature Context

- **Feature directory**: `plans/<feature-dir>/`
- **User story**: `phase-1-stories/<story-file>.md`
- **Plan file**: `plans/<feature-dir>/plan.md`

## Test Files Created/Modified

- `backend/tests/core/test_costbasis.py` — cost basis math and roll handling
- `backend/tests/core/test_lifecycle.py` — phase transition state machine
- `backend/tests/api/test_positions.py` — REST endpoint contracts

## Interfaces Under Test

List every public function, class, or endpoint the tests import or call. Green phase must create exactly these:

```python
# backend/app/core/costbasis.py
def calculate_cost_basis(legs: list[Leg]) -> Decimal: ...

# backend/app/core/lifecycle.py
def transition(current_phase: WheelPhase, event: PhaseEvent) -> WheelPhase: ...
class PhaseTransitionError(Exception): ...

# backend/app/api/routes/positions.py
# POST /positions → 201 PositionResponse
# GET  /positions → 200 list[PositionResponse]
```

## Test Coverage Summary

### Core Engine Tests (backend/tests/core/)

- [x] Cost basis is assignment strike when no premiums collected
- [x] CSP premium reduces cost basis
- [x] CC premium further reduces cost basis
- [x] Roll credit reduces cost basis; roll debit increases it
- [x] Illegal phase transition raises PhaseTransitionError

### API Tests (backend/tests/api/)

- [x] POST /positions returns 201 with created wheel
- [x] GET /positions returns list of active wheels

## Test Design Assumptions

[Non-obvious decisions made while writing tests — e.g., "Decimal precision to 4 dp", "roll debit is positive, roll credit is negative in the Leg model"]

## Test Execution Results

```bash
cd backend && uv run pytest -v

FAILED tests/core/test_costbasis.py::test_cost_basis_decreases_after_csp_premium
  ImportError: cannot import name 'calculate_cost_basis' from 'app.core.costbasis'

FAILED tests/core/test_lifecycle.py::test_csp_open_to_holding_shares
  ImportError: cannot import name 'transition' from 'app.core.lifecycle'

2 failed, 0 passed
```

## Verification

- ✅ Every test fails because the feature doesn't exist yet — not due to test bugs
- ✅ No syntax errors in test files
- ✅ No fixture or import errors caused by test setup mistakes

## Handoff to Green Phase

To resume: run `/green [feature-name]`. Green phase should:
1. Read this file to find all test files and the exact interfaces to implement
2. Read `plans/<feature-dir>/plan.md` for architecture decisions
3. Implement only the interfaces listed under "Interfaces Under Test"

## Notes

[Any clarifications or open questions]
````
